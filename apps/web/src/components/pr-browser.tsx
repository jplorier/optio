"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn, formatRelativeTime } from "@/lib/utils";
import {
  Loader2,
  GitPullRequest,
  GitBranch,
  Eye,
  Check,
  AlertTriangle,
  Clock,
  User,
} from "lucide-react";

export function PrBrowser() {
  const router = useRouter();
  const [prs, setPrs] = useState<any[]>([]);
  const [repos, setRepos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRepo, setSelectedRepo] = useState("");
  const [reviewing, setReviewing] = useState<number | null>(null);
  const [prUrl, setPrUrl] = useState("");
  const [submittingUrl, setSubmittingUrl] = useState(false);

  useEffect(() => {
    api
      .listRepos()
      .then((res) => setRepos(res.repos))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    api
      .listPullRequests({ repoId: selectedRepo || undefined })
      .then((res) => setPrs(res.pullRequests))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedRepo]);

  const handleReview = async (pr: any) => {
    setReviewing(pr.number);
    try {
      const res = await api.createPrReview({ prUrl: pr.url });
      toast.success(`Review started for PR #${pr.number}`);
      router.push(`/tasks/${res.task.id}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to start review");
    }
    setReviewing(null);
  };

  const handleUrlSubmit = async () => {
    if (!prUrl.trim()) return;
    setSubmittingUrl(true);
    try {
      const res = await api.createPrReview({ prUrl: prUrl.trim() });
      toast.success("Review started");
      router.push(`/tasks/${res.task.id}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to start review");
    }
    setSubmittingUrl(false);
  };

  const draftStateBadge = (draft: any) => {
    if (!draft) return null;
    const styles: Record<string, string> = {
      drafting: "bg-warning/10 text-warning",
      ready: "bg-success/10 text-success",
      submitted: "bg-info/10 text-info",
      stale: "bg-error/10 text-error",
    };
    const labels: Record<string, string> = {
      drafting: "Reviewing...",
      ready: "Draft Ready",
      submitted: "Submitted",
      stale: "Stale",
    };
    return (
      <span
        className={cn(
          "text-[10px] px-1.5 py-0.5 rounded-md font-medium",
          styles[draft.state] ?? "bg-bg text-text-muted",
        )}
      >
        {labels[draft.state] ?? draft.state}
      </span>
    );
  };

  return (
    <div>
      {/* URL input */}
      <div className="mb-4 flex items-center gap-2">
        <input
          value={prUrl}
          onChange={(e) => setPrUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleUrlSubmit()}
          placeholder="Paste a PR URL to review (e.g., https://github.com/owner/repo/pull/123)"
          className="flex-1 px-3 py-2 rounded-lg bg-bg border border-border text-sm focus:border-primary focus:ring-1 focus:ring-primary/20 focus:outline-none"
        />
        <button
          onClick={handleUrlSubmit}
          disabled={submittingUrl || !prUrl.trim()}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover disabled:opacity-50 transition-colors"
        >
          {submittingUrl ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Eye className="w-3.5 h-3.5" />
          )}
          Review
        </button>
      </div>

      {/* Repo filter */}
      {repos.length > 1 && (
        <div className="mb-4">
          <select
            value={selectedRepo}
            onChange={(e) => setSelectedRepo(e.target.value)}
            className="px-3 py-1.5 rounded-md bg-bg-card border border-border text-sm focus:outline-none focus:border-primary"
          >
            <option value="">All repos</option>
            {repos.map((r: any) => (
              <option key={r.id} value={r.id}>
                {r.fullName}
              </option>
            ))}
          </select>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12 text-text-muted">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Loading pull requests from GitHub...
        </div>
      ) : prs.length === 0 ? (
        <div className="text-center py-12 text-text-muted border border-dashed border-border rounded-lg">
          <GitPullRequest className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No open pull requests found</p>
          <p className="text-xs mt-1">
            {repos.length === 0
              ? "Add a repo first in the Repos settings."
              : "Pull requests will appear here from your configured repos."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {prs.map((pr: any) => (
            <div
              key={`${pr.repo.fullName}-${pr.number}`}
              className="p-3 rounded-lg border border-border bg-bg-card"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <a
                      href={pr.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium hover:text-primary transition-colors truncate"
                    >
                      {pr.title}
                    </a>
                    <span className="text-xs text-text-muted shrink-0">#{pr.number}</span>
                    {pr.draft && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-bg text-text-muted border border-border">
                        Draft
                      </span>
                    )}
                    {pr.reviewDraft && draftStateBadge(pr.reviewDraft)}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-text-muted">
                    <span className="flex items-center gap-1">
                      <GitBranch className="w-3 h-3" />
                      {pr.repo.fullName}
                    </span>
                    {pr.author && (
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {pr.author}
                      </span>
                    )}
                    <span>{formatRelativeTime(pr.updatedAt)}</span>
                  </div>
                  {/* Labels */}
                  {pr.labels && pr.labels.length > 0 && (
                    <div className="flex items-center gap-1 mt-1.5">
                      {pr.labels.map((label: string) => (
                        <span
                          key={label}
                          className="text-[10px] px-1.5 py-0.5 rounded-full border border-border bg-bg text-text-muted"
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Action button */}
                <div className="shrink-0">
                  {pr.reviewDraft ? (
                    <Link
                      href={`/tasks/${pr.reviewDraft.taskId}`}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs",
                        pr.reviewDraft.state === "stale"
                          ? "bg-error/10 text-error hover:bg-error/20"
                          : pr.reviewDraft.state === "submitted"
                            ? "bg-info/10 text-info hover:bg-info/20"
                            : "bg-success/10 text-success hover:bg-success/20",
                      )}
                    >
                      {pr.reviewDraft.state === "stale" ? (
                        <AlertTriangle className="w-3 h-3" />
                      ) : pr.reviewDraft.state === "drafting" ? (
                        <Clock className="w-3 h-3" />
                      ) : (
                        <Check className="w-3 h-3" />
                      )}
                      View Review
                    </Link>
                  ) : (
                    <button
                      onClick={() => handleReview(pr)}
                      disabled={reviewing === pr.number}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-white text-xs hover:bg-primary-hover disabled:opacity-50"
                    >
                      {reviewing === pr.number ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Eye className="w-3 h-3" />
                      )}
                      Review with Optio
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
