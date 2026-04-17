import type { Metadata } from "next";
import Link from "next/link";
import { CodeBlock } from "@/components/docs/code-block";
import { Callout } from "@/components/docs/callout";

export const metadata: Metadata = {
  title: "Scheduled Tasks",
  description:
    "Run tasks on a cron schedule, via webhook, or in response to tickets. Scheduled tasks use the full Task pipeline (repo clone, setupCommands, secrets, PR tracking).",
};

export default function ScheduledTasksPage() {
  return (
    <>
      <h1 className="text-3xl font-bold text-text-heading">Scheduled Tasks</h1>
      <p className="mt-4 text-text-muted leading-relaxed">
        A <strong>task config</strong> is a reusable task blueprint — a saved repo + prompt + agent
        configuration. Attach a trigger (cron schedule, webhook, or ticket event) and Optio spawns a
        fresh task through the full pipeline on each firing: repo clone, setupCommands, secrets
        injection, PR tracking.
      </p>

      <Callout type="info">
        Task configs and Jobs both plug into the same trigger system. The difference: Tasks produce
        PRs; Jobs are standalone agent runs. Pick Tasks when the work is repo-attached.
      </Callout>

      <h2 className="mt-10 text-2xl font-bold text-text-heading">Common use cases</h2>
      <ul className="mt-3 list-disc pl-5 space-y-2 text-[14px] text-text-muted">
        <li>
          <strong className="text-text-heading">Daily CVE patching</strong> — run every morning,
          prompt the agent to update dependencies with security fixes and open a PR.
        </li>
        <li>
          <strong className="text-text-heading">Scheduled dependency bumps</strong> — weekly
          pnpm/npm updates.
        </li>
        <li>
          <strong className="text-text-heading">Webhook-driven tasks</strong> — external systems
          POST to trigger a fresh PR (e.g. a Sentry alert spawning a fix task).
        </li>
        <li>
          <strong className="text-text-heading">Ticket-driven tasks</strong> — every ticket with
          label <code>cve</code> creates a task from a security-specialized blueprint.
        </li>
      </ul>

      <h2 className="mt-10 text-2xl font-bold text-text-heading">From the dashboard</h2>
      <ol className="mt-3 list-decimal pl-5 space-y-2 text-[14px] text-text-muted">
        <li>
          Navigate to <strong className="text-text-heading">Tasks &rarr; New Task</strong>.
        </li>
        <li>
          At the top of the form, switch from <strong className="text-text-heading">Run now</strong>{" "}
          to <strong className="text-text-heading">Schedule</strong>.
        </li>
        <li>Fill in the usual repo + title + prompt + agent fields.</li>
        <li>Pick a trigger type (schedule or webhook) and provide its config.</li>
        <li>
          Click <strong className="text-text-heading">Create Schedule</strong>.
        </li>
      </ol>
      <p className="mt-3 text-text-muted leading-relaxed">
        The task config is saved and visible at{" "}
        <code className="text-text-heading">/tasks/scheduled</code>. Each firing produces a regular
        Task at <code>/tasks/:id</code> with a <code>taskConfigId</code> link in its metadata.
      </p>

      <h2 className="mt-10 text-2xl font-bold text-text-heading">API</h2>
      <h3 className="mt-6 text-lg font-semibold text-text-heading">Create a task config</h3>
      <CodeBlock title="POST /api/task-configs">{`POST /api/task-configs
Content-Type: application/json

{
  "name": "Daily CVE patch",
  "title": "Patch security advisories",
  "prompt": "Check for security vulnerabilities in dependencies and open a PR with patches.",
  "repoUrl": "https://github.com/acme/web",
  "repoBranch": "main",
  "agentType": "claude-code",
  "priority": 50,
  "enabled": true
}`}</CodeBlock>

      <h3 className="mt-6 text-lg font-semibold text-text-heading">Add a schedule trigger</h3>
      <CodeBlock title="POST /api/task-configs/:id/triggers">{`POST /api/task-configs/\${id}/triggers
Content-Type: application/json

{
  "type": "schedule",
  "config": { "cronExpression": "0 9 * * *" },
  "enabled": true
}`}</CodeBlock>
      <p className="mt-3 text-text-muted text-[14px]">
        Cron expressions are five-field UTC (minute, hour, day, month, weekday). The worker polls
        every 60s by default (configure via <code>OPTIO_WORKFLOW_TRIGGER_INTERVAL</code>).
      </p>

      <h3 className="mt-6 text-lg font-semibold text-text-heading">Add a webhook trigger</h3>
      <CodeBlock title="POST /api/task-configs/:id/triggers">{`POST /api/task-configs/\${id}/triggers
Content-Type: application/json

{
  "type": "webhook",
  "config": { "path": "sentry-to-task" },
  "enabled": true
}`}</CodeBlock>
      <p className="mt-3 text-text-muted text-[14px]">
        The webhook path is globally unique. Upstream POST to <code>/api/hooks/sentry-to-task</code>{" "}
        — the payload becomes the task's <code>triggerParams</code> metadata and is available to the
        prompt template.
      </p>

      <h3 className="mt-6 text-lg font-semibold text-text-heading">Add a ticket trigger</h3>
      <CodeBlock title="POST /api/task-configs/:id/triggers">{`POST /api/task-configs/\${id}/triggers
Content-Type: application/json

{
  "type": "ticket",
  "config": { "source": "github", "labels": ["cve"] },
  "enabled": true
}`}</CodeBlock>
      <p className="mt-3 text-text-muted text-[14px]">
        Fires when the ticket-sync worker discovers a matching ticket. The ticket's
        source/externalId/title/body/labels/url are passed as params to the prompt.
      </p>

      <h3 className="mt-6 text-lg font-semibold text-text-heading">Manually run a task config</h3>
      <CodeBlock title="POST /api/task-configs/:id/run">{`POST /api/task-configs/\${id}/run

Response:
{ "taskId": "5b3ce588-fd6d-4682-a1c4-73f00d65ad24" }`}</CodeBlock>

      <h2 className="mt-10 text-2xl font-bold text-text-heading">Prompt templating</h2>
      <p className="mt-3 text-text-muted leading-relaxed">
        Title and prompt fields support <code>{`{{param}}`}</code> substitution and{" "}
        <code>{`{{#if param}}...{{/if}}`}</code> blocks. When a trigger fires, the trigger's payload
        (webhook body, ticket fields) is passed as params and substituted into the prompt. Link a
        named template from{" "}
        <Link href="/docs/guides" className="text-primary hover:underline">
          the template library
        </Link>{" "}
        via <code>promptTemplateId</code> to share a template across multiple task configs.
      </p>

      <h2 className="mt-10 text-2xl font-bold text-text-heading">Pausing and running</h2>
      <p className="mt-3 text-text-muted leading-relaxed">
        Every task config has an <code>enabled</code> flag, and every trigger has its own enabled
        flag. Pausing the config stops all triggers from firing; pausing an individual trigger stops
        just that one. The <code>/tasks/scheduled</code> page and the per-config detail page at{" "}
        <code>/tasks/scheduled/:id</code> expose one-click pause/resume and manual-run controls.
      </p>
    </>
  );
}
