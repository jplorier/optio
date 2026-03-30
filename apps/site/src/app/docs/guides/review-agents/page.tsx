import type { Metadata } from "next";
import Link from "next/link";
import { CodeBlock } from "@/components/docs/code-block";
import { Callout } from "@/components/docs/callout";

export const metadata: Metadata = {
  title: "Review Agents",
  description: "Configure automated code review agents that run as subtasks of coding tasks.",
};

export default function ReviewAgentsPage() {
  return (
    <>
      <h1 className="text-3xl font-bold text-text-heading">Review Agents</h1>
      <p className="mt-4 text-text-muted leading-relaxed">
        Optio can automatically launch a code review agent as a subtask of any coding task. The
        review agent examines the PR, checks for issues, and posts a GitHub review. This provides an
        automated first pass before human reviewers look at the code.
      </p>

      <h2 className="mt-10 text-2xl font-bold text-text-heading">How It Works</h2>
      <ol className="mt-3 list-decimal pl-5 space-y-2 text-[14px] text-text-muted">
        <li>
          A coding task opens a PR and transitions to{" "}
          <code className="rounded bg-bg-hover px-1.5 py-0.5 text-[13px] font-mono">pr_opened</code>
        </li>
        <li>
          The PR watcher detects the trigger condition (CI pass or PR open, depending on config)
        </li>
        <li>
          A review subtask is created with{" "}
          <code className="rounded bg-bg-hover px-1.5 py-0.5 text-[13px] font-mono">
            taskType: &quot;review&quot;
          </code>{" "}
          and{" "}
          <code className="rounded bg-bg-hover px-1.5 py-0.5 text-[13px] font-mono">
            blocksParent: true
          </code>
        </li>
        <li>The review agent runs in the same repo pod, scoped to the PR branch</li>
        <li>The review agent posts its findings as a GitHub PR review</li>
        <li>The parent coding task waits for the review subtask to complete before advancing</li>
      </ol>

      <h2 className="mt-10 text-2xl font-bold text-text-heading">Enabling Reviews</h2>
      <p className="mt-3 text-text-muted leading-relaxed">
        Reviews are configured per repository. Navigate to{" "}
        <strong className="text-text-heading">Repos &rarr; (select repo) &rarr; Settings</strong>.
      </p>

      <div className="mt-4 overflow-hidden rounded-xl border border-border bg-bg-card">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border bg-bg-subtle">
              <th className="px-4 py-3 text-left font-semibold text-text-heading">Setting</th>
              <th className="px-4 py-3 text-left font-semibold text-text-heading">Default</th>
              <th className="px-4 py-3 text-left font-semibold text-text-heading">Description</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {[
              ["reviewEnabled", "false", "Enable automatic code review for this repo"],
              ["reviewTrigger", "on_ci_pass", "When to launch the review agent"],
              ["reviewModel", "sonnet", "Which model to use for reviews"],
              ["reviewPromptTemplate", "null", "Custom review prompt template"],
            ].map(([setting, def, desc]) => (
              <tr key={setting}>
                <td className="px-4 py-3 font-mono text-text-heading">{setting}</td>
                <td className="px-4 py-3 text-text-muted">{def}</td>
                <td className="px-4 py-3 text-text-muted">{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-10 text-2xl font-bold text-text-heading">Trigger Options</h2>
      <p className="mt-3 text-text-muted leading-relaxed">
        The{" "}
        <code className="rounded bg-bg-hover px-1.5 py-0.5 text-[13px] font-mono">
          reviewTrigger
        </code>{" "}
        setting controls when the review agent is launched:
      </p>

      <div className="mt-4 space-y-3">
        <div className="rounded-lg border border-border bg-bg-card p-4">
          <p className="text-[14px] font-medium text-text-heading">
            <code className="rounded bg-bg-hover px-1.5 py-0.5 text-[13px] font-mono">
              on_ci_pass
            </code>{" "}
            (default)
          </p>
          <p className="mt-2 text-[13px] text-text-muted leading-relaxed">
            The review agent launches after CI checks pass on the PR. This ensures the review
            focuses on code quality rather than catching build errors. Recommended for most repos.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-bg-card p-4">
          <p className="text-[14px] font-medium text-text-heading">
            <code className="rounded bg-bg-hover px-1.5 py-0.5 text-[13px] font-mono">on_pr</code>
          </p>
          <p className="mt-2 text-[13px] text-text-muted leading-relaxed">
            The review agent launches as soon as the PR is first detected, without waiting for CI.
            This is faster but means the review may flag issues that CI would have caught. Useful
            for repos without CI or where review speed is critical.
          </p>
        </div>
      </div>

      <h2 className="mt-10 text-2xl font-bold text-text-heading">Review Model</h2>
      <p className="mt-3 text-text-muted leading-relaxed">
        The{" "}
        <code className="rounded bg-bg-hover px-1.5 py-0.5 text-[13px] font-mono">reviewModel</code>{" "}
        setting allows you to use a different (often cheaper) model for reviews. Since reviews are
        primarily reading and commenting on code rather than writing it, a lighter model often works
        well.
      </p>

      <Callout type="tip">
        Using{" "}
        <code className="rounded bg-bg-hover px-1.5 py-0.5 text-[13px] font-mono">sonnet</code> for
        reviews and{" "}
        <code className="rounded bg-bg-hover px-1.5 py-0.5 text-[13px] font-mono">opus</code> for
        coding is a common cost-effective configuration. You can also use{" "}
        <code className="rounded bg-bg-hover px-1.5 py-0.5 text-[13px] font-mono">haiku</code> for
        fast, inexpensive reviews on simpler repos.
      </Callout>

      <h2 className="mt-10 text-2xl font-bold text-text-heading">Custom Review Prompts</h2>
      <p className="mt-3 text-text-muted leading-relaxed">
        Override the default review prompt to match your team&apos;s review standards. The prompt
        template supports the same variable syntax as coding prompts, plus review-specific
        variables.
      </p>

      <h3 className="mt-6 text-lg font-semibold text-text-heading">Review Variables</h3>
      <div className="mt-4 overflow-hidden rounded-xl border border-border bg-bg-card">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border bg-bg-subtle">
              <th className="px-4 py-3 text-left font-semibold text-text-heading">Variable</th>
              <th className="px-4 py-3 text-left font-semibold text-text-heading">Description</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {[
              ["{{PR_NUMBER}}", "The PR number to review"],
              ["{{TASK_FILE}}", "Path to the task description markdown file"],
              ["{{REPO_NAME}}", "Repository name (owner/repo)"],
              ["{{TASK_TITLE}}", "Title of the original coding task"],
              ["{{TEST_COMMAND}}", "Auto-detected test command for the repo"],
            ].map(([variable, desc]) => (
              <tr key={variable}>
                <td className="px-4 py-3 font-mono text-text-heading">{variable}</td>
                <td className="px-4 py-3 text-text-muted">{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="mt-6 text-lg font-semibold text-text-heading">Example Custom Review Prompt</h3>
      <div className="mt-3">
        <CodeBlock title="custom review prompt template">{`You are reviewing PR #{{PR_NUMBER}} in {{REPO_NAME}}.

Read the original task description from {{TASK_FILE}} to understand
what was requested.

Review the PR diff and check for:
1. Correctness — does the implementation match the task requirements?
2. Security — any SQL injection, XSS, or auth bypass risks?
3. Performance — any N+1 queries, unnecessary re-renders, or memory leaks?
4. Testing — are there adequate tests? Run "{{TEST_COMMAND}}" to verify.
5. Code style — does it follow the existing patterns in the codebase?

Post a GitHub review with your findings. If everything looks good,
approve the PR. If there are issues, request changes with specific,
actionable feedback.`}</CodeBlock>
      </div>

      <h2 className="mt-10 text-2xl font-bold text-text-heading">Manual Review Trigger</h2>
      <p className="mt-3 text-text-muted leading-relaxed">
        You can manually trigger a review for any task that has an open PR, regardless of the
        automatic review settings:
      </p>
      <div className="mt-3">
        <CodeBlock title="terminal">{`curl -X POST https://optio.example.com/api/tasks/{taskId}/review \\
  -H "Cookie: optio_session=YOUR_SESSION_TOKEN"`}</CodeBlock>
      </div>
      <p className="mt-3 text-text-muted leading-relaxed">
        This is also available as a button in the task detail view when the task is in{" "}
        <code className="rounded bg-bg-hover px-1.5 py-0.5 text-[13px] font-mono">pr_opened</code>{" "}
        state.
      </p>

      <h2 className="mt-10 text-2xl font-bold text-text-heading">Review as a Subtask</h2>
      <p className="mt-3 text-text-muted leading-relaxed">
        Reviews are implemented as subtasks of the parent coding task. This means:
      </p>
      <ul className="mt-3 list-disc pl-5 space-y-2 text-[14px] text-text-muted">
        <li>
          The review appears in the subtask list (
          <code className="rounded bg-bg-hover px-1.5 py-0.5 text-[13px] font-mono">
            GET /api/tasks/:id/subtasks
          </code>
          )
        </li>
        <li>
          It has{" "}
          <code className="rounded bg-bg-hover px-1.5 py-0.5 text-[13px] font-mono">
            blocksParent: true
          </code>
          , so the parent waits for it to finish
        </li>
        <li>It runs in the same repo pod, sharing the cloned repository</li>
        <li>It has its own logs, state transitions, and cost tracking</li>
        <li>
          When the review subtask completes,{" "}
          <code className="rounded bg-bg-hover px-1.5 py-0.5 text-[13px] font-mono">
            onSubtaskComplete()
          </code>{" "}
          checks if the parent can advance
        </li>
      </ul>

      <h2 className="mt-10 text-2xl font-bold text-text-heading">Auto-Resume on Review</h2>
      <p className="mt-3 text-text-muted leading-relaxed">
        When a review (human or agent) requests changes, Optio can automatically resume the coding
        agent to address the feedback. This is controlled by the per-repo{" "}
        <code className="rounded bg-bg-hover px-1.5 py-0.5 text-[13px] font-mono">autoResume</code>{" "}
        setting (enabled by default).
      </p>
      <p className="mt-3 text-text-muted leading-relaxed">The flow:</p>
      <ol className="mt-3 list-decimal pl-5 space-y-1 text-[14px] text-text-muted">
        <li>PR watcher detects a &quot;changes requested&quot; review</li>
        <li>
          Task transitions to{" "}
          <code className="rounded bg-bg-hover px-1.5 py-0.5 text-[13px] font-mono">
            needs_attention
          </code>
        </li>
        <li>The review comments are extracted and used as the resume prompt</li>
        <li>Task is re-queued and the agent picks up the review feedback</li>
        <li>Agent pushes fixes and the cycle repeats</li>
      </ol>

      <Callout type="info">
        Auto-resume works with both human reviews and agent reviews. This creates a tight feedback
        loop where the coding agent and review agent iterate toward a mergeable PR.
      </Callout>

      <h2 className="mt-10 text-2xl font-bold text-text-heading">Cost Considerations</h2>
      <p className="mt-3 text-text-muted leading-relaxed">
        Review tasks have their own cost tracking. To control review costs:
      </p>
      <ul className="mt-3 list-disc pl-5 space-y-1 text-[14px] text-text-muted">
        <li>
          Use a lighter model for reviews (e.g.,{" "}
          <code className="rounded bg-bg-hover px-1.5 py-0.5 text-[13px] font-mono">sonnet</code> or{" "}
          <code className="rounded bg-bg-hover px-1.5 py-0.5 text-[13px] font-mono">haiku</code>)
        </li>
        <li>
          Set{" "}
          <code className="rounded bg-bg-hover px-1.5 py-0.5 text-[13px] font-mono">
            maxTurnsReview
          </code>{" "}
          per-repo to limit the number of agent turns
        </li>
        <li>
          Use{" "}
          <code className="rounded bg-bg-hover px-1.5 py-0.5 text-[13px] font-mono">
            on_ci_pass
          </code>{" "}
          trigger to avoid reviewing code that won&apos;t build
        </li>
        <li>
          Monitor costs in the <strong className="text-text-heading">Costs</strong> dashboard, which
          breaks down spending by task type (coding vs review)
        </li>
      </ul>

      <h2 className="mt-10 text-2xl font-bold text-text-heading">Next Steps</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {[
          {
            title: "Task Lifecycle",
            href: "/docs/task-lifecycle",
            description: "States, transitions, and the full feedback loop",
          },
          {
            title: "Configuration",
            href: "/docs/configuration",
            description: "Review settings reference",
          },
          {
            title: "Creating Tasks",
            href: "/docs/guides/creating-tasks",
            description: "Create tasks to review",
          },
          {
            title: "Integrations",
            href: "/docs/guides/integrations",
            description: "Slack notifications for reviews",
          },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="card-hover rounded-lg border border-border bg-bg-card p-4 block"
          >
            <p className="text-[14px] font-semibold text-text-heading">{item.title}</p>
            <p className="mt-1 text-[13px] text-text-muted">{item.description}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
