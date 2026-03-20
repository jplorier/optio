"use client";

import { useRouter } from "next/navigation";
import { StateBadge } from "./state-badge";
import { classifyError } from "@optio/shared";
import { api } from "@/lib/api-client";
import { formatRelativeTime, truncate } from "@/lib/utils";
import { ExternalLink, RotateCcw, Bot } from "lucide-react";

interface TaskCardProps {
  task: {
    id: string;
    title: string;
    state: string;
    agentType: string;
    repoUrl: string;
    prUrl?: string;
    costUsd?: string;
    errorMessage?: string;
    taskType?: string;
    createdAt: string;
    updatedAt: string;
  };
}

export function TaskCard({ task }: TaskCardProps) {
  const router = useRouter();
  const repoName = task.repoUrl.replace(/.*\/\/[^/]+\//, "").replace(/\.git$/, "");
  const [owner, repo] = repoName.includes("/") ? repoName.split("/") : ["", repoName];
  const prNumber = task.prUrl?.match(/\/pull\/(\d+)/)?.[1];

  return (
    <div
      onClick={() => router.push(`/tasks/${task.id}`)}
      className="block p-5 rounded-xl border border-border/50 bg-bg-card hover:border-border hover:bg-bg-card-hover transition-all cursor-pointer"
    >
      {/* Top row: title + badges */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm tracking-tight truncate">{task.title}</h3>
            {task.taskType === "review" && (
              <span className="shrink-0 flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-info/10 text-info">
                <Bot className="w-3 h-3" />
                Review
              </span>
            )}
          </div>
          {/* Metadata row */}
          <div className="flex items-center gap-1.5 mt-2 text-xs text-text-muted">
            <span className="text-text-muted/50">{owner}/</span>
            <span>{repo}</span>
            <span className="text-text-muted/30 mx-1">&middot;</span>
            <span className="capitalize">{task.agentType.replace("-", " ")}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {task.costUsd && (
            <span className="text-[11px] text-text-muted/40 tabular-nums">
              ${parseFloat(task.costUsd).toFixed(2)}
            </span>
          )}
          <StateBadge state={task.state} />
        </div>
      </div>

      {/* Error section */}
      {task.state === "failed" && task.errorMessage && (
        <div className="mt-3 px-3 py-2.5 rounded-lg bg-error/5 border border-error/10 flex items-center justify-between gap-2">
          <span className="text-xs text-error/80 truncate">
            {classifyError(task.errorMessage).title}
          </span>
          <button
            onClick={async (e) => {
              e.stopPropagation();
              const btn = e.currentTarget;
              btn.textContent = "Retrying...";
              btn.setAttribute("disabled", "true");
              try {
                await api.retryTask(task.id);
                window.location.href = window.location.href;
              } catch {
                btn.textContent = "Failed";
                setTimeout(() => {
                  btn.textContent = "Retry";
                  btn.removeAttribute("disabled");
                }, 2000);
              }
            }}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs bg-primary/10 text-primary hover:bg-primary/20 shrink-0"
          >
            <RotateCcw className="w-3 h-3" />
            Retry
          </button>
        </div>
      )}

      {/* Footer: time + PR */}
      <div className="flex items-center justify-between mt-4 text-xs text-text-muted/60">
        <span>{formatRelativeTime(task.createdAt)}</span>
        {prNumber && (
          <a
            href={task.prUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 text-text-muted hover:text-text transition-colors"
          >
            PR #{prNumber}
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
    </div>
  );
}
