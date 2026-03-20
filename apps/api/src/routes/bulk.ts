import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { tasks } from "../db/schema.js";
import { TaskState } from "@optio/shared";
import * as taskService from "../services/task-service.js";
import { taskQueue } from "../workers/task-worker.js";

export async function bulkRoutes(app: FastifyInstance) {
  // Retry all failed tasks
  app.post("/api/tasks/bulk/retry-failed", async (_req, reply) => {
    const failedTasks = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(eq(tasks.state, "failed"));

    let retried = 0;
    for (const task of failedTasks) {
      try {
        await taskService.transitionTask(task.id, TaskState.QUEUED, "bulk_retry");
        await taskQueue.add(
          "process-task",
          { taskId: task.id },
          {
            jobId: `${task.id}-retry-${Date.now()}`,
            attempts: 1,
          },
        );
        retried++;
      } catch {
        // Skip tasks that can't transition
      }
    }
    reply.send({ retried, total: failedTasks.length });
  });

  // Cancel all running/queued tasks
  app.post("/api/tasks/bulk/cancel-active", async (_req, reply) => {
    const activeTasks = await db
      .select({ id: tasks.id, state: tasks.state })
      .from(tasks)
      .where(eq(tasks.state, "running"));

    const queuedTasks = await db
      .select({ id: tasks.id, state: tasks.state })
      .from(tasks)
      .where(eq(tasks.state, "queued"));

    const allActive = [...activeTasks, ...queuedTasks];
    let cancelled = 0;
    for (const task of allActive) {
      try {
        await taskService.transitionTask(task.id, TaskState.CANCELLED, "bulk_cancel");
        cancelled++;
      } catch {
        // Skip tasks that can't transition
      }
    }
    reply.send({ cancelled, total: allActive.length });
  });
}
