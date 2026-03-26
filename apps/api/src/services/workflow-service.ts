import { eq, desc } from "drizzle-orm";
import { db } from "../db/client.js";
import { workflowTemplates, workflowRuns, tasks } from "../db/schema.js";
import { TaskState, detectCycle, type DagEdge } from "@optio/shared";
import * as taskService from "./task-service.js";
import * as dependencyService from "./dependency-service.js";
import { taskQueue } from "../workers/task-worker.js";
import { logger } from "../logger.js";

// ── Workflow Template CRUD ───────────────────────────────────────────────────

export async function listWorkflowTemplates(workspaceId?: string) {
  let query = db.select().from(workflowTemplates).orderBy(desc(workflowTemplates.createdAt));
  if (workspaceId) {
    query = query.where(eq(workflowTemplates.workspaceId, workspaceId)) as typeof query;
  }
  return query;
}

export async function getWorkflowTemplate(id: string) {
  const [template] = await db.select().from(workflowTemplates).where(eq(workflowTemplates.id, id));
  return template ?? null;
}

export async function createWorkflowTemplate(input: {
  name: string;
  description?: string;
  steps: Array<{
    id: string;
    title: string;
    prompt: string;
    repoUrl?: string;
    agentType?: string;
    dependsOn?: string[];
    condition?: { type: string; value?: string };
  }>;
  status?: string;
  workspaceId?: string;
  createdBy?: string;
}) {
  // Validate DAG — no cycles in step dependencies
  const edges: DagEdge[] = [];
  for (const step of input.steps) {
    for (const dep of step.dependsOn ?? []) {
      edges.push({ from: step.id, to: dep });
    }
  }
  const cycle = detectCycle(edges);
  if (cycle) {
    throw new Error(`Circular dependency in workflow steps: ${cycle.join(" → ")}`);
  }

  // Validate all dependsOn references point to valid step IDs
  const stepIds = new Set(input.steps.map((s) => s.id));
  for (const step of input.steps) {
    for (const dep of step.dependsOn ?? []) {
      if (!stepIds.has(dep)) {
        throw new Error(`Step "${step.id}" depends on unknown step "${dep}"`);
      }
    }
  }

  const [template] = await db
    .insert(workflowTemplates)
    .values({
      name: input.name,
      description: input.description,
      steps: input.steps,
      status: input.status ?? "draft",
      workspaceId: input.workspaceId,
      createdBy: input.createdBy,
    })
    .returning();
  return template;
}

export async function updateWorkflowTemplate(
  id: string,
  input: {
    name?: string;
    description?: string;
    steps?: Array<{
      id: string;
      title: string;
      prompt: string;
      repoUrl?: string;
      agentType?: string;
      dependsOn?: string[];
      condition?: { type: string; value?: string };
    }>;
    status?: string;
  },
) {
  // Validate DAG if steps are being updated
  if (input.steps) {
    const edges: DagEdge[] = [];
    for (const step of input.steps) {
      for (const dep of step.dependsOn ?? []) {
        edges.push({ from: step.id, to: dep });
      }
    }
    const cycle = detectCycle(edges);
    if (cycle) {
      throw new Error(`Circular dependency in workflow steps: ${cycle.join(" → ")}`);
    }
    const stepIds = new Set(input.steps.map((s) => s.id));
    for (const step of input.steps) {
      for (const dep of step.dependsOn ?? []) {
        if (!stepIds.has(dep)) {
          throw new Error(`Step "${step.id}" depends on unknown step "${dep}"`);
        }
      }
    }
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) updates.name = input.name;
  if (input.description !== undefined) updates.description = input.description;
  if (input.steps !== undefined) updates.steps = input.steps;
  if (input.status !== undefined) updates.status = input.status;

  const [updated] = await db
    .update(workflowTemplates)
    .set(updates)
    .where(eq(workflowTemplates.id, id))
    .returning();
  return updated ?? null;
}

export async function deleteWorkflowTemplate(id: string): Promise<boolean> {
  const deleted = await db
    .delete(workflowTemplates)
    .where(eq(workflowTemplates.id, id))
    .returning();
  return deleted.length > 0;
}

// ── Workflow Runs ────────────────────────────────────────────────────────────

export async function listWorkflowRuns(templateId: string) {
  return db
    .select()
    .from(workflowRuns)
    .where(eq(workflowRuns.workflowTemplateId, templateId))
    .orderBy(desc(workflowRuns.createdAt));
}

export async function getWorkflowRun(id: string) {
  const [run] = await db.select().from(workflowRuns).where(eq(workflowRuns.id, id));
  return run ?? null;
}

/**
 * Instantiate and run a workflow from a template.
 * Creates tasks for each step and wires up dependencies between them.
 */
export async function runWorkflow(
  templateId: string,
  opts?: { workspaceId?: string; createdBy?: string; repoUrlOverride?: string },
) {
  const template = await getWorkflowTemplate(templateId);
  if (!template) throw new Error("Workflow template not found");
  if (template.status === "archived") throw new Error("Cannot run an archived workflow");

  const steps = template.steps as Array<{
    id: string;
    title: string;
    prompt: string;
    repoUrl?: string;
    agentType?: string;
    dependsOn?: string[];
    condition?: { type: string; value?: string };
  }>;

  // Create the workflow run record
  const [run] = await db
    .insert(workflowRuns)
    .values({
      workflowTemplateId: templateId,
      workspaceId: opts?.workspaceId,
      createdBy: opts?.createdBy,
      status: "running",
      taskMapping: {},
    })
    .returning();

  const taskMapping: Record<string, string> = {};

  // Create tasks for each step
  for (const step of steps) {
    const repoUrl = opts?.repoUrlOverride ?? step.repoUrl;
    if (!repoUrl) {
      throw new Error(`Step "${step.id}" has no repoUrl and no override was provided`);
    }
    const task = await taskService.createTask({
      title: step.title,
      prompt: step.prompt,
      repoUrl,
      agentType: step.agentType ?? "claude-code",
      workspaceId: opts?.workspaceId ?? null,
    });
    taskMapping[step.id] = task.id;

    // Store workflow run ID on the task
    await db.update(tasks).set({ workflowRunId: run.id }).where(eq(tasks.id, task.id));
  }

  // Wire up dependencies between tasks based on step definitions
  for (const step of steps) {
    if (step.dependsOn && step.dependsOn.length > 0) {
      const taskId = taskMapping[step.id];
      const depTaskIds = step.dependsOn.map((depStepId) => {
        const depTaskId = taskMapping[depStepId];
        if (!depTaskId) throw new Error(`Missing task for step "${depStepId}"`);
        return depTaskId;
      });
      await dependencyService.addDependencies(taskId, depTaskIds);
    }
  }

  // Update run with task mapping
  await db
    .update(workflowRuns)
    .set({ taskMapping, updatedAt: new Date() })
    .where(eq(workflowRuns.id, run.id));

  // Start tasks that have no dependencies (roots)
  for (const step of steps) {
    const taskId = taskMapping[step.id];
    const hasDeps = step.dependsOn && step.dependsOn.length > 0;

    if (hasDeps) {
      // Task waits for dependencies
      await taskService.transitionTask(taskId, TaskState.WAITING_ON_DEPS, "workflow_start");
    } else {
      // No dependencies — queue immediately
      await taskService.transitionTask(taskId, TaskState.QUEUED, "workflow_start");
      await taskQueue.add(
        "process-task",
        { taskId },
        { jobId: `${taskId}-workflow-${Date.now()}`, priority: 100 },
      );
    }
  }

  logger.info(
    { workflowRunId: run.id, templateId, taskCount: steps.length },
    "Workflow run started",
  );

  return { ...run, taskMapping };
}

/**
 * Check if a workflow run is complete (all tasks are terminal).
 * Called by the task worker after any task in a workflow finishes.
 */
export async function checkWorkflowRunCompletion(workflowRunId: string): Promise<void> {
  const run = await getWorkflowRun(workflowRunId);
  if (!run || run.status !== "running") return;

  const mapping = (run.taskMapping ?? {}) as Record<string, string>;
  const taskIds = Object.values(mapping);
  if (taskIds.length === 0) return;

  const allTasks = await Promise.all(taskIds.map((id) => taskService.getTask(id)));

  const allCompleted = allTasks.every((t) => t?.state === TaskState.COMPLETED);
  const anyFailed = allTasks.some(
    (t) => t?.state === TaskState.FAILED || t?.state === TaskState.CANCELLED,
  );
  const allTerminal = allTasks.every(
    (t) =>
      t?.state === TaskState.COMPLETED ||
      t?.state === TaskState.FAILED ||
      t?.state === TaskState.CANCELLED,
  );

  if (allCompleted) {
    await db
      .update(workflowRuns)
      .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
      .where(eq(workflowRuns.id, workflowRunId));
    logger.info({ workflowRunId }, "Workflow run completed");
  } else if (allTerminal && anyFailed) {
    await db
      .update(workflowRuns)
      .set({ status: "failed", completedAt: new Date(), updatedAt: new Date() })
      .where(eq(workflowRuns.id, workflowRunId));
    logger.info({ workflowRunId }, "Workflow run failed");
  }
}
