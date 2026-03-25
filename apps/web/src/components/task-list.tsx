"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { api } from "@/lib/api-client";
import { useStore, type TaskSummary } from "@/hooks/use-store";
import { TaskCard } from "./task-card";
import { Loader2, ChevronUp, ChevronDown, ChevronRight, GripVertical, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";

// ---------------------------------------------------------------------------
// Pipeline stage derivation — mirrors the logic in pipeline-timeline.tsx
// so the task list sections match the individual task detail view.
// ---------------------------------------------------------------------------

type PipelineStage =
  | "queue"
  | "setup"
  | "running"
  | "ci"
  | "review"
  | "done"
  | "failed"
  | "attention";

function getTaskStage(
  t: TaskSummary,
  subs: { hasRunning: boolean; hasQueued: boolean; hasAny: boolean; allDone: boolean },
): PipelineStage {
  if (["completed", "cancelled"].includes(t.state)) return "done";
  if (t.state === "failed") return "failed";
  if (["pending", "queued"].includes(t.state)) return "queue";
  if (t.state === "provisioning") return "setup";
  if (t.state === "running") return "running";
  if (t.state === "needs_attention") return "attention";

  // pr_opened — determine which post-PR pipeline stage
  if (t.state === "pr_opened") {
    // Subtask running/queued means the review agent is active
    if (subs.hasRunning) return "review";
    if (subs.hasQueued) return "review";

    // Review status from GitHub
    if (t.prReviewStatus && !["none", "pending"].includes(t.prReviewStatus)) return "review";

    // CI checks
    const checks = t.prChecksStatus;
    if (!checks || ["none", "pending"].includes(checks)) return "ci";
    if (checks === "failing") return "ci";

    // Checks passing — if there's review activity or done subtasks, show review
    if (checks === "passing") {
      if (subs.allDone) return "review";
      return "review";
    }

    return "ci";
  }

  return "queue";
}

// ---------------------------------------------------------------------------
// Filter definitions — synced with pipeline stages
// ---------------------------------------------------------------------------

const STAGE_FILTERS = [
  { value: "", label: "All" },
  { value: "queue", label: "Queue" },
  { value: "running", label: "Running" },
  { value: "ci", label: "CI" },
  { value: "review", label: "Review" },
  { value: "attention", label: "Attention" },
  { value: "done", label: "Done" },
  { value: "failed", label: "Failed" },
];

const TIME_FILTERS = [
  { value: "1d", label: "Last 24h" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "", label: "All time" },
];

function getSinceDate(timeFilter: string): Date | null {
  const now = new Date();
  switch (timeFilter) {
    case "1d":
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case "7d":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "30d":
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    default:
      return null;
  }
}

const TERMINAL_STAGES: PipelineStage[] = ["done", "failed"];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TaskList() {
  const tasks = useStore(useShallow((state) => state.tasks));
  const setTasks = useStore((state) => state.setTasks);
  const [filter, setFilter] = useState("");
  const [timeFilter, setTimeFilter] = useState("1d");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    api
      .listTasks({ limit: 200 })
      .then((res) => setTasks(res.tasks))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [setTasks]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Memoize parent→subtask map (only recalculated when tasks change)
  const { reviewMap, topLevelAll } = useMemo(() => {
    const map = new Map<string, TaskSummary[]>();
    const topLevel: TaskSummary[] = [];

    for (const t of tasks) {
      if (t.parentTaskId) {
        const existing = map.get(t.parentTaskId) ?? [];
        existing.push(t);
        map.set(t.parentTaskId, existing);
      } else {
        topLevel.push(t);
      }
    }

    return { reviewMap: map, topLevelAll: topLevel };
  }, [tasks]);

  // Memoize stage derivation
  const taskStages = useMemo(() => {
    const stages = new Map<string, PipelineStage>();
    for (const t of topLevelAll) {
      const subs = reviewMap.get(t.id) ?? [];
      const status = {
        hasRunning: subs.some((s) => ["running", "provisioning"].includes(s.state)),
        hasQueued: subs.some((s) => ["queued", "pending"].includes(s.state)),
        hasAny: subs.length > 0,
        allDone:
          subs.length > 0 &&
          subs.every((s) => ["completed", "failed", "cancelled"].includes(s.state)),
      };
      stages.set(t.id, getTaskStage(t, status));
    }
    return stages;
  }, [topLevelAll, reviewMap]);

  // Memoize filtered + sectioned data
  const { attention, running, ci, review, queued, failed, completed, visibleTasks, stageCounts } =
    useMemo(() => {
      const sinceDate = getSinceDate(timeFilter);
      const query = searchQuery.trim().toLowerCase();

      // Apply stage filter
      let visible = filter
        ? topLevelAll.filter((t) => taskStages.get(t.id) === filter)
        : topLevelAll;

      // Apply time filter — only constrains terminal tasks
      if (sinceDate) {
        visible = visible.filter((t) => {
          const stage = taskStages.get(t.id)!;
          if (!TERMINAL_STAGES.includes(stage)) return true;
          return new Date(t.createdAt) >= sinceDate;
        });
      }

      // Apply text search
      if (query) {
        visible = visible.filter((t) => {
          if (t.title.toLowerCase().includes(query)) return true;
          if (t.id.toLowerCase().startsWith(query)) return true;
          if (t.ticketExternalId && t.ticketExternalId.toLowerCase().includes(query)) return true;
          return false;
        });
      }

      // Split into sections by stage
      const sections = {
        attention: visible.filter((t) => taskStages.get(t.id) === "attention"),
        running: visible.filter((t) => {
          const s = taskStages.get(t.id);
          return s === "running" || s === "setup";
        }),
        ci: visible.filter((t) => taskStages.get(t.id) === "ci"),
        review: visible.filter((t) => taskStages.get(t.id) === "review"),
        queued: visible.filter((t) => taskStages.get(t.id) === "queue"),
        failed: visible.filter((t) => taskStages.get(t.id) === "failed"),
        completed: visible.filter((t) => taskStages.get(t.id) === "done"),
      };

      // Compute counts per stage for filter badges (from unfiltered + unsearched data)
      const counts = new Map<string, number>();
      for (const t of topLevelAll) {
        const stage = taskStages.get(t.id)!;
        if (sinceDate && TERMINAL_STAGES.includes(stage) && new Date(t.createdAt) < sinceDate)
          continue;
        counts.set(stage, (counts.get(stage) ?? 0) + 1);
      }

      return { ...sections, visibleTasks: visible, stageCounts: counts };
    }, [topLevelAll, taskStages, filter, timeFilter, searchQuery]);

  const moveTask = async (index: number, direction: "up" | "down") => {
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= queued.length) return;

    const reordered = [...queued];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(newIndex, 0, moved);

    const newTasks = [
      ...attention,
      ...running,
      ...ci,
      ...review,
      ...reordered,
      ...failed,
      ...completed,
    ];
    setTasks(newTasks);

    try {
      await api.reorderTasks(reordered.map((t) => t.id));
    } catch {
      toast.error("Failed to reorder");
      refresh();
    }
  };

  return (
    <div>
      {/* Search */}
      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted/50" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, task ID, or issue ID..."
            className="w-full pl-9 pr-3 py-2 bg-transparent border-b border-border/50 text-sm text-text placeholder:text-text-muted/40 focus:outline-none focus:border-text-muted transition-colors"
          />
        </div>
      </div>

      {/* Filters row */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex gap-1.5 flex-wrap flex-1">
          {STAGE_FILTERS.map((f) => {
            const count = f.value ? (stageCounts.get(f.value) ?? 0) : topLevelAll.length;
            return (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors flex items-center gap-1.5",
                  filter === f.value
                    ? "bg-bg-card border border-border text-text"
                    : "text-text-muted hover:bg-bg-hover hover:text-text",
                )}
              >
                {f.label}
                {f.value && count > 0 && (
                  <span className="text-[11px] text-text-muted/40">{count}</span>
                )}
              </button>
            );
          })}
        </div>
        <select
          value={timeFilter}
          onChange={(e) => setTimeFilter(e.target.value)}
          className="px-2 py-1.5 rounded-lg text-[13px] font-medium bg-transparent border border-border/50 text-text-muted cursor-pointer focus:outline-none focus:border-border hover:border-border transition-colors"
        >
          {TIME_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      {loading && tasks.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-text-muted">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Loading tasks...
        </div>
      ) : visibleTasks.length === 0 ? (
        <div className="text-center py-16 text-text-muted">
          <p>No tasks found</p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Needs human input — most important */}
          {attention.length > 0 && (
            <Section label="Needs Your Input" count={attention.length}>
              {attention.map((task) => (
                <TaskCard key={task.id} task={task} subtasks={reviewMap.get(task.id)} />
              ))}
            </Section>
          )}

          {/* Running */}
          {running.length > 0 && (
            <Section label="Running" count={running.length}>
              {running.map((task) => (
                <TaskCard key={task.id} task={task} subtasks={reviewMap.get(task.id)} />
              ))}
            </Section>
          )}

          {/* CI Checks */}
          {ci.length > 0 && (
            <Section label="CI Checks" count={ci.length}>
              {ci.map((task) => (
                <TaskCard key={task.id} task={task} subtasks={reviewMap.get(task.id)} />
              ))}
            </Section>
          )}

          {/* Review */}
          {review.length > 0 && (
            <Section label="Review" count={review.length}>
              {review.map((task) => (
                <TaskCard key={task.id} task={task} subtasks={reviewMap.get(task.id)} />
              ))}
            </Section>
          )}

          {/* Queue */}
          {queued.length > 0 && (
            <Section label="Queue" count={queued.length}>
              {queued.length > 1 && (
                <div className="text-xs text-text-muted/50 mb-2 flex items-center gap-1.5">
                  <GripVertical className="w-3 h-3" />
                  Use arrows to reprioritize
                </div>
              )}
              {queued.map((task, i) => (
                <div key={task.id} className="flex items-center gap-1.5">
                  {queued.length > 1 && (
                    <div className="flex flex-col shrink-0 rounded-md bg-bg-card p-0.5">
                      <button
                        onClick={() => moveTask(i, "up")}
                        disabled={i === 0}
                        className="p-0.5 text-text-muted hover:text-text disabled:opacity-20 transition-colors"
                      >
                        <ChevronUp className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => moveTask(i, "down")}
                        disabled={i === queued.length - 1}
                        className="p-0.5 text-text-muted hover:text-text disabled:opacity-20 transition-colors"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <TaskCard task={task} subtasks={reviewMap.get(task.id)} />
                  </div>
                </div>
              ))}
            </Section>
          )}

          {/* Failed */}
          {failed.length > 0 && (
            <Section
              label="Failed"
              count={failed.length}
              collapsible
              initialLimit={filter ? undefined : 5}
            >
              {failed.map((task) => (
                <TaskCard key={task.id} task={task} subtasks={reviewMap.get(task.id)} />
              ))}
            </Section>
          )}

          {/* Done */}
          {completed.length > 0 && (
            <Section
              label="Done"
              count={completed.length}
              collapsible
              initialLimit={filter ? undefined : 5}
            >
              {completed.map((task) => (
                <TaskCard key={task.id} task={task} subtasks={reviewMap.get(task.id)} />
              ))}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section component with optional collapse
// ---------------------------------------------------------------------------

function Section({
  label,
  count,
  children,
  collapsible,
  initialLimit,
}: {
  label: string;
  count: number;
  children: React.ReactNode;
  collapsible?: boolean;
  initialLimit?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const childArray = React.Children.toArray(children);
  const shouldLimit = collapsible && initialLimit != null && childArray.length > initialLimit;
  const visibleChildren = shouldLimit && !expanded ? childArray.slice(0, initialLimit) : childArray;
  const hiddenCount = shouldLimit ? childArray.length - initialLimit : 0;

  return (
    <div>
      <div
        className={cn("flex items-center gap-2 mb-3", collapsible && "cursor-pointer select-none")}
        onClick={collapsible ? () => setExpanded((e) => !e) : undefined}
      >
        {collapsible && (
          <ChevronRight
            className={cn(
              "w-3.5 h-3.5 text-text-muted/50 transition-transform",
              expanded && "rotate-90",
            )}
          />
        )}
        <span className="text-xs font-medium uppercase tracking-wider text-text-muted">
          {label}
        </span>
        <span className="text-xs text-text-muted/40">{count}</span>
      </div>
      <div className="grid gap-2.5">
        {visibleChildren}
        {shouldLimit && !expanded && (
          <button
            onClick={() => setExpanded(true)}
            className="text-xs text-text-muted hover:text-text py-2 transition-colors"
          >
            Show all {childArray.length}
          </button>
        )}
      </div>
    </div>
  );
}
