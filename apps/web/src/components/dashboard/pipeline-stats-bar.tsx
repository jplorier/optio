import Link from "next/link";
import { cn } from "@/lib/utils";
import { Activity, CheckCircle, AlertTriangle, GitMerge, Eye, ListChecks } from "lucide-react";
import type { TaskStats } from "./types.js";

export function PipelineStatsBar({ taskStats }: { taskStats: TaskStats | null }) {
  const stages = [
    {
      key: "queue",
      label: "Queue",
      value: taskStats?.queued ?? 0,
      icon: ListChecks,
      color: "var(--color-text-muted)",
    },
    {
      key: "running",
      label: "Running",
      value: taskStats?.running ?? 0,
      icon: Activity,
      color: "var(--color-primary)",
    },
    {
      key: "ci",
      label: "CI",
      value: taskStats?.ci ?? 0,
      icon: GitMerge,
      color: "var(--color-info)",
    },
    {
      key: "review",
      label: "Review",
      value: taskStats?.review ?? 0,
      icon: Eye,
      color: "var(--color-info)",
    },
    {
      key: "attention",
      label: "Attention",
      value: taskStats?.needsAttention ?? 0,
      icon: AlertTriangle,
      color: "var(--color-warning)",
    },
    {
      key: "failed",
      label: "Failed",
      value: taskStats?.failed ?? 0,
      icon: AlertTriangle,
      color: "var(--color-error)",
    },
    {
      key: "done",
      label: "Done",
      value: taskStats?.completed ?? 0,
      icon: CheckCircle,
      color: "var(--color-success)",
    },
  ];

  return (
    <div className="rounded-xl border border-border/50 bg-bg-card overflow-hidden">
      <div className="flex divide-x divide-border/30">
        {stages.map((stage) => {
          const active = stage.value > 0;
          const Icon = stage.icon;

          return (
            <Link
              key={stage.key}
              href={`/tasks?stage=${stage.key}&timeFilter=`}
              className="flex-1 relative py-5 flex flex-col items-center gap-1.5 hover:bg-bg-hover/30 transition-all group"
            >
              {/* Colored top accent bar for active stages */}
              {active && (
                <div
                  className="absolute top-0 inset-x-0 h-0.5"
                  style={{ backgroundColor: stage.color }}
                />
              )}

              <span
                className={cn(
                  "text-3xl font-bold tabular-nums tracking-tight font-mono transition-colors",
                  !active && "text-text-muted/15",
                )}
                style={active ? { color: stage.color } : undefined}
              >
                {stage.value}
              </span>

              <div className="flex items-center gap-1.5">
                <Icon
                  className={cn("w-3 h-3 transition-colors", !active && "text-text-muted/20")}
                  style={active ? { color: stage.color } : undefined}
                />
                <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted/50">
                  {stage.label}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
