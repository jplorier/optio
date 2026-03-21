import { eq, desc } from "drizzle-orm";
import { db } from "../db/client.js";
import { tasks, taskEvents, taskLogs } from "../db/schema.js";
import { TaskState, transition, type CreateTaskInput } from "@optio/shared";
import { publishEvent } from "./event-bus.js";
import { logger } from "../logger.js";

export async function createTask(input: CreateTaskInput) {
  const [task] = await db
    .insert(tasks)
    .values({
      title: input.title,
      prompt: input.prompt,
      repoUrl: input.repoUrl,
      repoBranch: input.repoBranch ?? "main",
      agentType: input.agentType,
      ticketSource: input.ticketSource,
      ticketExternalId: input.ticketExternalId,
      metadata: input.metadata,
      maxRetries: input.maxRetries ?? 3,
      priority: input.priority ?? 100,
    })
    .returning();

  await publishEvent({
    type: "task:created",
    taskId: task.id,
    title: task.title,
    timestamp: new Date().toISOString(),
  });

  return task;
}

export async function getTask(id: string) {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
  return task ?? null;
}

export async function listTasks(opts?: { state?: string; limit?: number; offset?: number }) {
  let query = db.select().from(tasks).orderBy(desc(tasks.createdAt));
  if (opts?.state) {
    query = query.where(eq(tasks.state, opts.state as any)) as typeof query;
  }
  if (opts?.limit) {
    query = query.limit(opts.limit) as typeof query;
  }
  if (opts?.offset) {
    query = query.offset(opts.offset) as typeof query;
  }
  return query;
}

export async function transitionTask(
  id: string,
  toState: TaskState,
  trigger: string,
  message?: string,
) {
  const task = await getTask(id);
  if (!task) throw new Error(`Task not found: ${id}`);

  const currentState = task.state as TaskState;
  transition(currentState, toState); // throws if invalid

  const updateFields: Record<string, unknown> = {
    state: toState,
    updatedAt: new Date(),
  };

  if (toState === TaskState.RUNNING && !task.startedAt) {
    updateFields.startedAt = new Date();
  }
  if (
    toState === TaskState.COMPLETED ||
    toState === TaskState.FAILED ||
    toState === TaskState.CANCELLED
  ) {
    updateFields.completedAt = new Date();
  }
  // Reset fields when retrying/re-queuing
  if (toState === TaskState.QUEUED) {
    updateFields.errorMessage = null;
    updateFields.resultSummary = null;
    updateFields.completedAt = null;
    updateFields.startedAt = null;
    updateFields.containerId = null;
  }

  await db.update(tasks).set(updateFields).where(eq(tasks.id, id));

  await db.insert(taskEvents).values({
    taskId: id,
    fromState: currentState,
    toState,
    trigger,
    message,
  });

  await publishEvent({
    type: "task:state_changed",
    taskId: id,
    fromState: currentState,
    toState,
    timestamp: new Date().toISOString(),
  });

  // Close linked GitHub issue when task completes
  if (toState === TaskState.COMPLETED && task.ticketSource === "github" && task.ticketExternalId) {
    closeGitHubIssue(task.repoUrl, task.ticketExternalId, task.prUrl).catch((err) =>
      logger.warn({ err, taskId: id }, "Failed to close linked GitHub issue"),
    );
  }

  return { ...task, ...updateFields };
}

async function closeGitHubIssue(repoUrl: string, issueNumber: string, prUrl?: string | null) {
  const { retrieveSecret } = await import("./secret-service.js");
  const token = await retrieveSecret("GITHUB_TOKEN");
  const match = repoUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
  if (!match) return;
  const [, owner, repo] = match;

  // Post completion comment
  const comment = prUrl
    ? `✅ **Optio** completed this issue. Changes merged in ${prUrl}.`
    : `✅ **Optio** completed this issue.`;

  await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "Optio",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ body: comment }),
  });

  // Close the issue
  await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "Optio",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ state: "closed", state_reason: "completed" }),
  });

  logger.info({ owner, repo, issueNumber }, "Closed linked GitHub issue");
}

export async function updateTaskContainer(id: string, containerId: string) {
  await db.update(tasks).set({ containerId, updatedAt: new Date() }).where(eq(tasks.id, id));
}

export async function updateTaskPr(id: string, prUrl: string) {
  await db.update(tasks).set({ prUrl, updatedAt: new Date() }).where(eq(tasks.id, id));
}

export async function updateTaskSession(id: string, sessionId: string) {
  await db.update(tasks).set({ sessionId, updatedAt: new Date() }).where(eq(tasks.id, id));
}

export async function updateTaskResult(id: string, resultSummary?: string, errorMessage?: string) {
  await db
    .update(tasks)
    .set({ resultSummary, errorMessage, updatedAt: new Date() })
    .where(eq(tasks.id, id));
}

export async function appendTaskLog(
  taskId: string,
  content: string,
  stream = "stdout",
  logType?: string,
  metadata?: Record<string, unknown>,
) {
  await db.insert(taskLogs).values({ taskId, content, stream, logType, metadata });

  await publishEvent({
    type: "task:log",
    taskId,
    stream: stream as "stdout" | "stderr",
    content,
    timestamp: new Date().toISOString(),
  });
}

export async function getTaskLogs(taskId: string, opts?: { limit?: number; offset?: number }) {
  let query = db
    .select()
    .from(taskLogs)
    .where(eq(taskLogs.taskId, taskId))
    .orderBy(taskLogs.timestamp);
  if (opts?.limit) query = query.limit(opts.limit) as typeof query;
  if (opts?.offset) query = query.offset(opts.offset) as typeof query;
  return query;
}

export async function getTaskEvents(taskId: string) {
  return db
    .select()
    .from(taskEvents)
    .where(eq(taskEvents.taskId, taskId))
    .orderBy(taskEvents.createdAt);
}
