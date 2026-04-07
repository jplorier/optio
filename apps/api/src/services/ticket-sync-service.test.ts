import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db/client.js", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
  },
}));

vi.mock("../db/schema.js", () => ({
  ticketProviders: {
    enabled: "ticket_providers.enabled",
  },
  repos: {
    repoUrl: "repos.repoUrl",
  },
}));

vi.mock("@optio/ticket-providers", () => ({
  getTicketProvider: vi.fn(),
}));

vi.mock("./task-service.js", () => ({
  createTask: vi.fn(),
  transitionTask: vi.fn(),
  listTasks: vi.fn(),
}));

vi.mock("../workers/task-worker.js", () => ({
  taskQueue: {
    add: vi.fn(),
  },
}));

vi.mock("./repo-service.js", () => ({
  getRepoByUrl: vi.fn().mockResolvedValue(null),
}));

vi.mock("../logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { db } from "../db/client.js";
import { getTicketProvider } from "@optio/ticket-providers";
import * as taskService from "./task-service.js";
import { taskQueue } from "../workers/task-worker.js";
import { syncAllTickets } from "./ticket-sync-service.js";

/**
 * Mock db.select() to handle two sequential query patterns:
 * 1. db.select().from(ticketProviders).where(...) — returns providers
 * 2. db.select({...}).from(repos) — returns configured repos (no .where())
 */
function mockDbSelect(providers: any[], configuredRepos: any[] = []) {
  let callCount = 0;
  (db.select as any) = vi.fn().mockImplementation(() => {
    callCount++;
    if (callCount === 1) {
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(providers),
        }),
      };
    }
    // Subsequent calls: repos query (awaited directly, no .where())
    return {
      from: vi.fn().mockResolvedValue(configuredRepos),
    };
  });
}

describe("ticket-sync-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("syncs new tickets and creates tasks", async () => {
    mockDbSelect([
      { source: "github", config: { repoUrl: "https://github.com/o/r" }, enabled: true },
    ]);

    const mockProvider = {
      fetchActionableTickets: vi.fn().mockResolvedValue([
        {
          title: "Fix bug",
          body: "Description",
          source: "github",
          externalId: "123",
          url: "https://github.com/o/r/issues/123",
          labels: [],
          repo: null,
        },
      ]),
      fetchTicketComments: vi.fn().mockResolvedValue([]),
      addComment: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(getTicketProvider).mockReturnValue(mockProvider as any);

    // No existing tasks
    vi.mocked(taskService.listTasks).mockResolvedValue([] as any);

    vi.mocked(taskService.createTask).mockResolvedValue({
      id: "task-1",
      maxRetries: 3,
    } as any);

    const count = await syncAllTickets();

    expect(count).toBe(1);
    expect(taskService.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Fix bug",
        repoUrl: "https://github.com/o/r",
        agentType: "claude-code",
        ticketSource: "github",
        ticketExternalId: "123",
      }),
    );
    expect(taskService.transitionTask).toHaveBeenCalledWith("task-1", "queued", "ticket_sync");
    expect(taskQueue.add).toHaveBeenCalled();
    expect(mockProvider.addComment).toHaveBeenCalled();
  });

  it("skips tickets that already have tasks", async () => {
    mockDbSelect([
      { source: "github", config: { repoUrl: "https://github.com/o/r" }, enabled: true },
    ]);

    vi.mocked(getTicketProvider).mockReturnValue({
      fetchActionableTickets: vi.fn().mockResolvedValue([
        {
          title: "Existing",
          body: "",
          source: "github",
          externalId: "123",
          url: "",
          labels: [],
          repo: null,
        },
      ]),
      addComment: vi.fn(),
    } as any);

    // Existing task matches (must include repoUrl for repo-scoped dedup)
    vi.mocked(taskService.listTasks).mockResolvedValue([
      { ticketSource: "github", ticketExternalId: "123", repoUrl: "https://github.com/o/r" },
    ] as any);

    const count = await syncAllTickets();
    expect(count).toBe(0);
    expect(taskService.createTask).not.toHaveBeenCalled();
  });

  it("uses codex agent type when ticket has codex label", async () => {
    mockDbSelect([
      { source: "github", config: { repoUrl: "https://github.com/o/r" }, enabled: true },
    ]);

    vi.mocked(getTicketProvider).mockReturnValue({
      fetchActionableTickets: vi.fn().mockResolvedValue([
        {
          title: "Codex task",
          body: "",
          source: "github",
          externalId: "456",
          url: "",
          labels: ["codex"],
          repo: null,
        },
      ]),
      fetchTicketComments: vi.fn().mockResolvedValue([]),
      addComment: vi.fn(),
    } as any);

    vi.mocked(taskService.listTasks).mockResolvedValue([] as any);
    vi.mocked(taskService.createTask).mockResolvedValue({ id: "t-1", maxRetries: 3 } as any);

    await syncAllTickets();

    expect(taskService.createTask).toHaveBeenCalledWith(
      expect.objectContaining({ agentType: "codex" }),
    );
  });

  it("uses ticket repo URL when available", async () => {
    mockDbSelect(
      [
        {
          source: "github",
          config: { repoUrl: "https://github.com/fallback/repo" },
          enabled: true,
        },
      ],
      [{ repoUrl: "https://github.com/owner/specific-repo" }],
    );

    vi.mocked(getTicketProvider).mockReturnValue({
      fetchActionableTickets: vi.fn().mockResolvedValue([
        {
          title: "Task",
          body: "",
          source: "github",
          externalId: "789",
          url: "",
          labels: [],
          repo: "owner/specific-repo",
        },
      ]),
      fetchTicketComments: vi.fn().mockResolvedValue([]),
      addComment: vi.fn(),
    } as any);

    vi.mocked(taskService.listTasks).mockResolvedValue([] as any);
    vi.mocked(taskService.createTask).mockResolvedValue({ id: "t-1", maxRetries: 3 } as any);

    await syncAllTickets();

    expect(taskService.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        repoUrl: "https://github.com/owner/specific-repo",
      }),
    );
  });

  it("skips tickets without repo URL", async () => {
    mockDbSelect([{ source: "github", config: {}, enabled: true }]);

    vi.mocked(getTicketProvider).mockReturnValue({
      fetchActionableTickets: vi.fn().mockResolvedValue([
        {
          title: "No repo",
          body: "",
          source: "github",
          externalId: "999",
          url: "",
          labels: [],
          repo: null,
        },
      ]),
      addComment: vi.fn(),
    } as any);

    vi.mocked(taskService.listTasks).mockResolvedValue([] as any);

    const count = await syncAllTickets();
    expect(count).toBe(0);
    expect(taskService.createTask).not.toHaveBeenCalled();
  });

  it("handles provider errors gracefully", async () => {
    mockDbSelect([{ source: "github", config: {}, enabled: true }]);

    vi.mocked(getTicketProvider).mockReturnValue({
      fetchActionableTickets: vi.fn().mockRejectedValue(new Error("API error")),
    } as any);

    const count = await syncAllTickets();
    expect(count).toBe(0);
  });

  it("continues syncing when comment fails", async () => {
    mockDbSelect([
      { source: "github", config: { repoUrl: "https://github.com/o/r" }, enabled: true },
    ]);

    vi.mocked(getTicketProvider).mockReturnValue({
      fetchActionableTickets: vi.fn().mockResolvedValue([
        {
          title: "Task",
          body: "",
          source: "github",
          externalId: "111",
          url: "",
          labels: [],
          repo: null,
        },
      ]),
      fetchTicketComments: vi.fn().mockResolvedValue([]),
      addComment: vi.fn().mockRejectedValue(new Error("comment failed")),
    } as any);

    vi.mocked(taskService.listTasks).mockResolvedValue([] as any);
    vi.mocked(taskService.createTask).mockResolvedValue({ id: "t-1", maxRetries: 3 } as any);

    const count = await syncAllTickets();
    expect(count).toBe(1); // Task still synced despite comment failure
  });
});
