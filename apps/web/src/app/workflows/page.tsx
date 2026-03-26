"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api-client";
import { Loader2, Plus, Trash2, GitBranch, Play, ChevronDown, ChevronRight, X } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

interface WorkflowStep {
  id: string;
  title: string;
  prompt: string;
  repoUrl?: string;
  agentType?: string;
  dependsOn?: string[];
}

export default function WorkflowsPage() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [repos, setRepos] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState<WorkflowStep[]>([
    { id: "step-1", title: "", prompt: "", dependsOn: [] },
  ]);

  const loadTemplates = () => {
    api
      .listWorkflows()
      .then((res) => setTemplates(res.workflows))
      .catch(() => toast.error("Failed to load workflow templates"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadTemplates();
    api
      .listRepos()
      .then((res) => setRepos(res.repos))
      .catch(() => {});
  }, []);

  const resetForm = () => {
    setName("");
    setDescription("");
    setSteps([{ id: "step-1", title: "", prompt: "", dependsOn: [] }]);
    setShowForm(false);
  };

  const addStep = () => {
    const nextId = `step-${steps.length + 1}`;
    setSteps([...steps, { id: nextId, title: "", prompt: "", dependsOn: [] }]);
  };

  const removeStep = (idx: number) => {
    const removedId = steps[idx].id;
    const newSteps = steps.filter((_, i) => i !== idx);
    // Remove references to the deleted step from dependsOn arrays
    setSteps(
      newSteps.map((s) => ({
        ...s,
        dependsOn: (s.dependsOn ?? []).filter((d) => d !== removedId),
      })),
    );
  };

  const updateStep = (idx: number, field: keyof WorkflowStep, value: any) => {
    const newSteps = [...steps];
    newSteps[idx] = { ...newSteps[idx], [field]: value };
    setSteps(newSteps);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.error("Name is required");
    if (steps.some((s) => !s.title.trim() || !s.prompt.trim())) {
      return toast.error("All steps must have a title and prompt");
    }

    setSubmitting(true);
    try {
      await api.createWorkflow({
        name,
        description: description || undefined,
        steps: steps.map((s) => ({
          ...s,
          repoUrl: s.repoUrl || undefined,
          agentType: s.agentType || undefined,
        })),
        status: "active",
      });
      toast.success("Workflow template created");
      resetForm();
      loadTemplates();
    } catch (err) {
      toast.error("Failed to create workflow", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this workflow template?")) return;
    try {
      await api.deleteWorkflow(id);
      toast.success("Workflow deleted");
      loadTemplates();
    } catch {
      toast.error("Failed to delete");
    }
  };

  const handleRun = async (id: string) => {
    setRunningId(id);
    try {
      const result = await api.runWorkflow(id);
      toast.success("Workflow started", {
        description: `Created ${Object.keys(result.workflowRun?.taskMapping ?? {}).length} tasks`,
      });
    } catch (err) {
      toast.error("Failed to run workflow", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setRunningId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text">Workflows</h1>
          <p className="text-sm text-text-muted mt-1">
            Define multi-step task pipelines with dependencies and conditions
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm hover:bg-primary/90"
        >
          <Plus className="w-4 h-4" />
          New Workflow
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-bg-surface border border-border rounded-xl p-6 space-y-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Refactor & Test Pipeline"
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-bg text-text"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text mb-1">Description</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-bg text-text"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-text">Steps</label>
              <button
                type="button"
                onClick={addStep}
                className="text-xs text-primary hover:underline"
              >
                + Add Step
              </button>
            </div>
            <div className="space-y-3">
              {steps.map((step, idx) => (
                <div key={step.id} className="border border-border rounded-lg p-4 bg-bg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono text-text-muted">{step.id}</span>
                    {steps.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeStep(idx)}
                        className="text-text-muted hover:text-red-400"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3 mb-2">
                    <input
                      type="text"
                      value={step.title}
                      onChange={(e) => updateStep(idx, "title", e.target.value)}
                      placeholder="Step title"
                      className="border border-border rounded-lg px-3 py-1.5 text-sm bg-bg text-text"
                    />
                    <select
                      value={step.repoUrl ?? ""}
                      onChange={(e) => updateStep(idx, "repoUrl", e.target.value || undefined)}
                      className="border border-border rounded-lg px-3 py-1.5 text-sm bg-bg text-text"
                    >
                      <option value="">Select repo (optional)</option>
                      {repos.map((r) => (
                        <option key={r.id} value={r.repoUrl}>
                          {r.fullName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <textarea
                    value={step.prompt}
                    onChange={(e) => updateStep(idx, "prompt", e.target.value)}
                    placeholder="Task prompt for this step..."
                    rows={2}
                    className="w-full border border-border rounded-lg px-3 py-1.5 text-sm bg-bg text-text mb-2"
                  />
                  {idx > 0 && (
                    <div>
                      <label className="text-xs text-text-muted mb-1 block">
                        Depends on (runs after these complete):
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {steps.slice(0, idx).map((prev) => (
                          <label
                            key={prev.id}
                            className="flex items-center gap-1.5 text-xs text-text"
                          >
                            <input
                              type="checkbox"
                              checked={(step.dependsOn ?? []).includes(prev.id)}
                              onChange={(e) => {
                                const deps = step.dependsOn ?? [];
                                updateStep(
                                  idx,
                                  "dependsOn",
                                  e.target.checked
                                    ? [...deps, prev.id]
                                    : deps.filter((d) => d !== prev.id),
                                );
                              }}
                              className="rounded"
                            />
                            {prev.title || prev.id}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="bg-primary text-white px-4 py-2 rounded-lg text-sm hover:bg-primary/90 disabled:opacity-50"
            >
              {submitting ? "Creating..." : "Create Workflow"}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2 rounded-lg text-sm border border-border text-text hover:bg-bg-hover"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {templates.length === 0 ? (
        <div className="text-center py-12 text-text-muted">
          <GitBranch className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>No workflow templates yet</p>
          <p className="text-sm mt-1">
            Create a workflow to chain multiple tasks with dependencies
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((t) => {
            const stepCount = Array.isArray(t.steps) ? t.steps.length : 0;
            const isExpanded = expandedId === t.id;
            return (
              <div key={t.id} className="bg-bg-surface border border-border rounded-xl">
                <div className="flex items-center justify-between p-4">
                  <button
                    className="flex items-center gap-3 text-left flex-1"
                    onClick={() => setExpandedId(isExpanded ? null : t.id)}
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-text-muted" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-text-muted" />
                    )}
                    <div>
                      <div className="font-medium text-sm text-text">{t.name}</div>
                      <div className="text-xs text-text-muted">
                        {stepCount} step{stepCount !== 1 ? "s" : ""} &middot;{" "}
                        <span
                          className={
                            t.status === "active"
                              ? "text-green-400"
                              : t.status === "archived"
                                ? "text-text-muted"
                                : "text-yellow-400"
                          }
                        >
                          {t.status}
                        </span>
                      </div>
                    </div>
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleRun(t.id)}
                      disabled={runningId === t.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-green-500/10 text-green-400 hover:bg-green-500/20 disabled:opacity-50"
                    >
                      {runningId === t.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Play className="w-3.5 h-3.5" />
                      )}
                      Run
                    </button>
                    <button
                      onClick={() => handleDelete(t.id)}
                      className="p-1.5 rounded-lg text-text-muted hover:bg-red-500/10 hover:text-red-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {isExpanded && (
                  <div className="border-t border-border p-4">
                    {t.description && (
                      <p className="text-sm text-text-muted mb-3">{t.description}</p>
                    )}
                    <div className="space-y-2">
                      {(t.steps as WorkflowStep[]).map((step, i) => (
                        <div
                          key={step.id}
                          className="flex items-start gap-3 p-3 bg-bg rounded-lg border border-border/50"
                        >
                          <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-medium shrink-0">
                            {i + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-text">{step.title}</div>
                            <div className="text-xs text-text-muted mt-0.5 truncate">
                              {step.prompt}
                            </div>
                            {step.dependsOn && step.dependsOn.length > 0 && (
                              <div className="text-xs text-text-muted mt-1">
                                Depends on:{" "}
                                {step.dependsOn
                                  .map((d) => {
                                    const dep = (t.steps as WorkflowStep[]).find((s) => s.id === d);
                                    return dep?.title ?? d;
                                  })
                                  .join(", ")}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
