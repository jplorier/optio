import { LinearClient } from "@linear/sdk";
import {
  TicketSource,
  DEFAULT_TICKET_LABEL,
  type Ticket,
  type TicketProviderConfig,
} from "@optio/shared";
import type { TicketProvider } from "./types.js";

export interface LinearProviderConfig extends TicketProviderConfig {
  apiKey: string;
  teamId?: string;
  projectId?: string;
  label?: string;
}

function asLinearConfig(config: TicketProviderConfig): LinearProviderConfig {
  const c = config as LinearProviderConfig;
  if (!c.apiKey) {
    throw new Error("Linear provider requires apiKey in config");
  }
  return c;
}

export class LinearTicketProvider implements TicketProvider {
  readonly source = TicketSource.LINEAR;

  async fetchActionableTickets(config: TicketProviderConfig): Promise<Ticket[]> {
    const linearConfig = asLinearConfig(config);
    const client = new LinearClient({ apiKey: linearConfig.apiKey });
    const label = linearConfig.label ?? DEFAULT_TICKET_LABEL;

    // Fetch issues with the optio label
    const issues = await client.issues({
      filter: {
        labels: { name: { eq: label } },
        state: { type: { nin: ["completed", "canceled"] } },
        ...(linearConfig.teamId ? { team: { id: { eq: linearConfig.teamId } } } : {}),
      },
      first: 50,
    });

    return issues.nodes.map((issue) => ({
      externalId: issue.identifier,
      source: TicketSource.LINEAR,
      title: issue.title,
      body: issue.description ?? "",
      url: issue.url,
      labels: [],
      assignee: undefined,
      repo: undefined,
      metadata: {
        id: issue.id,
        identifier: issue.identifier,
        priority: issue.priority,
        createdAt: issue.createdAt,
      },
    }));
  }

  private async findIssueByIdentifier(client: LinearClient, identifier: string) {
    // Search by the identifier string (e.g., "ENG-123")
    const results = await client.issueSearch({ query: identifier, first: 5 });
    return results.nodes.find((issue) => issue.identifier === identifier) ?? null;
  }

  async addComment(ticketId: string, comment: string, config: TicketProviderConfig): Promise<void> {
    const linearConfig = asLinearConfig(config);
    const client = new LinearClient({ apiKey: linearConfig.apiKey });

    const issue = await this.findIssueByIdentifier(client, ticketId);
    if (!issue) return;

    await client.createComment({
      issueId: issue.id,
      body: comment,
    });
  }

  async updateState(
    ticketId: string,
    state: "open" | "closed",
    config: TicketProviderConfig,
  ): Promise<void> {
    const linearConfig = asLinearConfig(config);
    const client = new LinearClient({ apiKey: linearConfig.apiKey });

    const issue = await this.findIssueByIdentifier(client, ticketId);
    if (!issue) return;

    if (state === "closed") {
      // Find the "Done" state for the team
      const team = await issue.team;
      if (team) {
        const states = await team.states();
        const doneState = states.nodes.find((s) => s.type === "completed");
        if (doneState) {
          await issue.update({ stateId: doneState.id });
        }
      }
    }
  }
}
