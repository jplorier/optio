"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePageTitle } from "@/hooks/use-page-title";
import { api } from "@/lib/api-client";
import { NumberInput } from "@/components/number-input";
import {
  Loader2,
  Sparkles,
  Link2,
  Clock,
  Play,
  FolderGit2,
  GitBranch as GitBranchIcon,
} from "lucide-react";
import { toast } from "sonner";
import { TriggerSelector, type TriggerConfig, cronIsValid } from "@/components/trigger-selector";

type RunMode = "now" | "schedule";

export default function NewTaskPage() {
  usePageTitle("New Task");
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // Repo attachment state
  const [attachRepo, setAttachRepo] = useState(false);
  const [repos, setRepos] = useState<any[]>([]);
  const [reposLoading, setReposLoading] = useState(true);

  // Dependency state (repo tasks, run-now only)
  const [existingTasks, setExistingTasks] = useState<any[]>([]);
  const [selectedDeps, setSelectedDeps] = useState<string[]>([]);
  const [showDeps, setShowDeps] = useState(false);

  // Run mode
  const [runMode, setRunMode] = useState<RunMode>("now");
  const [scheduleName, setScheduleName] = useState("");
  const [trigger, setTrigger] = useState<TriggerConfig>({
    type: "schedule",
    cronExpression: "0 9 * * *",
  });

  // Core form
  const [form, setForm] = useState({
    title: "",
    prompt: "",
    description: "",
    repoId: "",
    repoUrl: "",
    repoBranch: "main",
    agentType: "claude-code",
    priority: 100,
    maxRetries: 3,
  });

  useEffect(() => {
    api
      .listRepos()
      .then((res) => setRepos(res.repos))
      .catch(() => {})
      .finally(() => setReposLoading(false));
    api
      .listTasks({ limit: 100 })
      .then((res) => setExistingTasks(res.tasks))
      .catch(() => {});
  }, []);

  // When the user toggles on "Attach a repo", pre-select the first repo.
  useEffect(() => {
    if (attachRepo && !form.repoId && repos.length > 0) {
      const first = repos[0];
      setForm((f) => ({
        ...f,
        repoId: first.id,
        repoUrl: first.repoUrl,
        repoBranch: first.defaultBranch ?? "main",
        agentType: first.defaultAgentType ?? f.agentType,
      }));
    }
  }, [attachRepo, form.repoId, repos]);

  const handleRepoChange = (repoId: string) => {
    const repo = repos.find((r: any) => r.id === repoId);
    if (repo) {
      setForm((f) => ({
        ...f,
        repoId: repo.id,
        repoUrl: repo.repoUrl,
        repoBranch: repo.defaultBranch ?? "main",
        agentType: repo.defaultAgentType ?? f.agentType,
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (
        runMode === "schedule" &&
        trigger.type === "schedule" &&
        !cronIsValid(trigger.cronExpression)
      ) {
        toast.error("Invalid cron expression", {
          description: "Expected five space-separated fields.",
        });
        setLoading(false);
        return;
      }

      // ── Branch 1: Repo Task, run now ────────────────────────────────────
      if (attachRepo && runMode === "now") {
        const res = await api.createTask({
          title: form.title,
          prompt: form.prompt,
          repoUrl: form.repoUrl,
          repoBranch: form.repoBranch,
          agentType: form.agentType,
          maxRetries: form.maxRetries,
          priority: form.priority,
          ...(selectedDeps.length > 0 ? { dependsOn: selectedDeps } : {}),
        });
        toast.success("Task created", {
          description: `"${form.title}" has been queued.`,
        });
        router.push(`/tasks/${res.task.id}`);
        return;
      }

      // ── Branch 2: Repo Task, scheduled ──────────────────────────────────
      if (attachRepo && runMode === "schedule") {
        const name = scheduleName.trim() || form.title.trim();
        if (!name) {
          toast.error("Name required for scheduled tasks");
          setLoading(false);
          return;
        }
        const created = await api.createTaskConfig({
          name,
          description: form.description || undefined,
          title: form.title,
          prompt: form.prompt,
          repoUrl: form.repoUrl,
          repoBranch: form.repoBranch,
          agentType: form.agentType,
          maxRetries: form.maxRetries,
          priority: form.priority,
          enabled: true,
        });
        if (trigger.type !== "manual") {
          const config: Record<string, unknown> =
            trigger.type === "schedule"
              ? { cronExpression: trigger.cronExpression!.trim() }
              : trigger.type === "webhook"
                ? { path: trigger.webhookPath }
                : {};
          await api.createTaskConfigTrigger(created.taskConfig.id, {
            type: trigger.type,
            config,
            enabled: true,
          });
        }
        toast.success("Scheduled task created", { description: `"${name}" saved.` });
        router.push(`/tasks/scheduled/${created.taskConfig.id}`);
        return;
      }

      // ── Branch 3 + 4: Standalone Task (workflow) ────────────────────────
      const workflowName =
        scheduleName.trim() || form.title.trim() || `Task ${new Date().toISOString().slice(0, 10)}`;
      const workflow = await api.createWorkflow({
        name: workflowName,
        description: form.description || undefined,
        promptTemplate: form.prompt,
        agentRuntime: form.agentType,
        maxRetries: form.maxRetries,
        enabled: true,
      });

      if (runMode === "schedule" && trigger.type !== "manual") {
        const config: Record<string, unknown> =
          trigger.type === "schedule"
            ? { cronExpression: trigger.cronExpression!.trim() }
            : trigger.type === "webhook"
              ? { path: trigger.webhookPath }
              : {};
        await api.createWorkflowTrigger(workflow.workflow.id, {
          type: trigger.type,
          config,
          enabled: true,
        });
        toast.success("Scheduled task created", {
          description: `"${workflowName}" saved.`,
        });
        router.push(`/jobs/${workflow.workflow.id}`);
        return;
      }

      // Run-now standalone: create workflow and immediately kick off a run
      const run = await api.runWorkflow(workflow.workflow.id, {});
      toast.success("Task started", {
        description: `"${workflowName}" is running.`,
      });
      router.push(`/jobs/${workflow.workflow.id}/runs/${run.run.id}`);
    } catch (err) {
      toast.error("Failed to create task", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = !loading && form.title && form.prompt && (!attachRepo || form.repoUrl);

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold tracking-tight mb-2">New Task</h1>
      <p className="text-sm text-text-muted mb-6">
        Configure an agent to do something. Attach a repo to turn it into a Repo Task that opens a
        PR.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ── Run mode ──────────────────────────────────── */}
        <div>
          <label className="block text-xs uppercase tracking-wider text-text-muted/60 mb-2">
            When
          </label>
          <div className="flex gap-2 p-1 rounded-lg bg-bg-card border border-border w-fit">
            <button
              type="button"
              onClick={() => setRunMode("now")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
                runMode === "now" ? "bg-primary text-white" : "text-text-muted hover:text-text"
              }`}
            >
              <Play className="w-3.5 h-3.5" />
              Run now
            </button>
            <button
              type="button"
              onClick={() => setRunMode("schedule")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
                runMode === "schedule" ? "bg-primary text-white" : "text-text-muted hover:text-text"
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              Schedule
            </button>
          </div>
        </div>

        {/* ── What ──────────────────────────────────── */}
        <div className="space-y-4">
          <div className="text-xs uppercase tracking-wider text-text-muted/60">What</div>
          <div>
            <label className="block text-sm text-text-muted mb-1.5">
              {runMode === "schedule" ? "Task title template" : "Title"}
            </label>
            <input
              type="text"
              required
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Daily CVE patches"
              className="w-full px-3 py-2 rounded-lg bg-bg-card border border-border text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm text-text-muted mb-1.5">Prompt</label>
            <textarea
              required
              rows={6}
              value={form.prompt}
              onChange={(e) => setForm((f) => ({ ...f, prompt: e.target.value }))}
              placeholder="Describe what the agent should do. Be specific."
              className="w-full px-3 py-2 rounded-lg bg-bg-card border border-border text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors resize-y"
            />
            <p className="text-xs text-text-muted/60 mt-1">
              Supports {"{{param}}"} substitution on scheduled/webhook firings.
            </p>
          </div>
        </div>

        {/* ── When (schedule details) ──────────────────────────────────── */}
        {runMode === "schedule" && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-text-muted mb-1.5">Schedule name</label>
              <input
                type="text"
                value={scheduleName}
                onChange={(e) => setScheduleName(e.target.value)}
                placeholder={form.title || "e.g. Daily CVE patch"}
                className="w-full px-3 py-2 rounded-lg bg-bg-card border border-border text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors"
              />
              <p className="text-xs text-text-muted/60 mt-1">
                Defaults to the task title if left blank.
              </p>
            </div>
            <TriggerSelector value={trigger} onChange={setTrigger} hideManual label="Trigger" />
          </div>
        )}

        {/* ── Who (agent) ──────────────────────────────────── */}
        <div>
          <div className="text-xs uppercase tracking-wider text-text-muted/60 mb-2">Who</div>
          <label className="block text-sm text-text-muted mb-1.5">Agent</label>
          <select
            value={form.agentType}
            onChange={(e) => setForm((f) => ({ ...f, agentType: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-bg-card border border-border text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors"
          >
            <option value="claude-code">Claude Code</option>
            <option value="codex">OpenAI Codex</option>
            <option value="copilot">GitHub Copilot</option>
            <option value="opencode">OpenCode (Experimental)</option>
            <option value="gemini">Google Gemini</option>
            <option value="openclaw">OpenClaw (Experimental)</option>
          </select>
        </div>

        {/* ── Where (optional repo) ──────────────────────────────────── */}
        <div>
          <div className="text-xs uppercase tracking-wider text-text-muted/60 mb-2">Where</div>
          <label className="flex items-start gap-3 p-3 rounded-lg bg-bg-card border border-border cursor-pointer hover:border-primary/40 transition-colors">
            <input
              type="checkbox"
              checked={attachRepo}
              onChange={(e) => setAttachRepo(e.target.checked)}
              className="mt-0.5"
            />
            <div className="flex-1">
              <div className="flex items-center gap-1.5 text-sm font-medium">
                <FolderGit2 className="w-4 h-4" />
                Attach a repo
              </div>
              <p className="text-xs text-text-muted mt-0.5">
                Runs the agent against a specific repository on a git branch. The agent opens a PR
                when it's done (Repo Task).
              </p>
            </div>
          </label>

          {attachRepo && (
            <div className="mt-3 p-4 rounded-lg border border-border bg-bg-card/60 space-y-3">
              {reposLoading ? (
                <div className="flex items-center gap-2 text-text-muted text-sm py-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading repos...
                </div>
              ) : repos.length > 0 ? (
                <>
                  <div>
                    <label className="block text-sm text-text-muted mb-1.5">Repository</label>
                    <select
                      required={attachRepo}
                      value={form.repoId}
                      onChange={(e) => handleRepoChange(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-bg border border-border text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors"
                    >
                      {repos.map((repo: any) => (
                        <option key={repo.id} value={repo.id}>
                          {repo.fullName} ({repo.defaultBranch})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-text-muted mb-1.5">Branch</label>
                    <div className="flex items-center gap-2">
                      <GitBranchIcon className="w-3.5 h-3.5 text-text-muted" />
                      <input
                        type="text"
                        value={form.repoBranch}
                        onChange={(e) => setForm((f) => ({ ...f, repoBranch: e.target.value }))}
                        className="flex-1 px-3 py-2 rounded-lg bg-bg border border-border text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-sm text-text-muted py-2">
                  No repos configured.{" "}
                  <a href="/repos" className="text-primary hover:underline">
                    Add a repo
                  </a>{" "}
                  first.
                </div>
              )}

              {runMode === "now" && (
                <div>
                  <button
                    type="button"
                    onClick={() => setShowDeps(!showDeps)}
                    className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text transition-colors"
                  >
                    <Link2 className="w-3.5 h-3.5" />
                    Dependencies {selectedDeps.length > 0 && `(${selectedDeps.length})`}
                  </button>
                  {showDeps && (
                    <div className="mt-2 p-3 rounded-lg bg-bg border border-border">
                      <p className="text-xs text-text-muted/60 mb-2">
                        Wait for these tasks to complete first.
                      </p>
                      {existingTasks.length === 0 ? (
                        <p className="text-xs text-text-muted">No existing tasks.</p>
                      ) : (
                        <div className="max-h-40 overflow-y-auto space-y-1">
                          {existingTasks
                            .filter((t) => !["completed", "cancelled"].includes(t.state))
                            .map((t) => (
                              <label
                                key={t.id}
                                className="flex items-center gap-2 text-xs py-0.5 cursor-pointer hover:bg-bg-hover rounded px-1"
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedDeps.includes(t.id)}
                                  onChange={(e) =>
                                    setSelectedDeps((prev) =>
                                      e.target.checked
                                        ? [...prev, t.id]
                                        : prev.filter((id) => id !== t.id),
                                    )
                                  }
                                />
                                <span className="truncate flex-1">{t.title}</span>
                                <span className="text-text-muted shrink-0">{t.state}</span>
                              </label>
                            ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Why (description) ──────────────────────────────────── */}
        <div>
          <div className="text-xs uppercase tracking-wider text-text-muted/60 mb-2">Why</div>
          <label className="block text-sm text-text-muted mb-1.5">
            Description <span className="text-text-muted/60">(optional)</span>
          </label>
          <input
            type="text"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Why does this task exist? Who asked for it?"
            className="w-full px-3 py-2 rounded-lg bg-bg-card border border-border text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors"
          />
        </div>

        {/* ── Priority (repo tasks) ──────────────────────────────────── */}
        {attachRepo && (
          <div>
            <label className="block text-sm text-text-muted mb-1.5">Priority</label>
            <p className="text-xs text-text-muted/60 mb-1.5">
              Lower number = higher priority. Default 100.
            </p>
            <NumberInput
              min={1}
              max={1000}
              value={form.priority}
              onChange={(v) => setForm((f) => ({ ...f, priority: v }))}
              fallback={100}
              className="w-24 px-3 py-2 rounded-lg bg-bg-card border border-border text-sm"
            />
          </div>
        )}

        {/* ── Submit ──────────────────────────────────── */}
        <div>
          <button
            type="submit"
            disabled={!canSubmit}
            className="flex items-center gap-2 px-6 py-2.5 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : runMode === "schedule" ? (
              <Clock className="w-4 h-4" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            {loading
              ? "Creating..."
              : runMode === "schedule"
                ? "Create Schedule"
                : attachRepo
                  ? "Create Repo Task"
                  : "Run Task"}
          </button>
        </div>
      </form>
    </div>
  );
}
