"use client";

import { useState } from "react";
import { TaskList } from "@/components/task-list";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import Link from "next/link";
import { Plus, RotateCcw, XCircle } from "lucide-react";

export default function TasksPage() {
  const [bulkLoading, setBulkLoading] = useState(false);

  const handleRetryFailed = async () => {
    if (!confirm("Retry all failed tasks?")) return;
    setBulkLoading(true);
    try {
      const data = await api.bulkRetryFailed();
      toast.success(`Retried ${data.retried} of ${data.total} failed tasks`);
    } catch {
      toast.error("Failed to retry tasks");
    }
    setBulkLoading(false);
  };

  const handleCancelActive = async () => {
    if (!confirm("Cancel all running and queued tasks?")) return;
    setBulkLoading(true);
    try {
      const data = await api.bulkCancelActive();
      toast.success(`Cancelled ${data.cancelled} of ${data.total} active tasks`);
    } catch {
      toast.error("Failed to cancel tasks");
    }
    setBulkLoading(false);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">Tasks</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRetryFailed}
            disabled={bulkLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs bg-bg-card border border-border text-text-muted hover:text-text hover:bg-bg-hover disabled:opacity-50"
          >
            <RotateCcw className="w-3 h-3" />
            Retry Failed
          </button>
          <button
            onClick={handleCancelActive}
            disabled={bulkLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs bg-bg-card border border-border text-text-muted hover:text-error hover:bg-error/5 disabled:opacity-50"
          >
            <XCircle className="w-3 h-3" />
            Cancel Active
          </button>
          <Link
            href="/tasks/new"
            className="flex items-center gap-2 px-4 py-1.5 rounded-md bg-primary text-white text-sm hover:bg-primary-hover transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Task
          </Link>
        </div>
      </div>
      <TaskList />
    </div>
  );
}
