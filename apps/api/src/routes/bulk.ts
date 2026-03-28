import type { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import { db } from "../db/client.js";
import { tasks } from "../db/schema.js";
import { TaskState } from "@optio/shared";
import * as taskService from "../services/task-service.js";
import { taskQueue } from "../workers/task-worker.js";
import { requireRole } from "../plugins/auth.js";

export async function bulkRoutes(app: FastifyInstance) {
  // Retry all failed tasks — member+
  app.post(
    "/api/tasks/bulk/retry-failed",
    { preHandler: [requireRole("member")] },
    async (req, reply) => {
      const workspaceId = req.user?.workspaceId;
      const conditions = [eq(tasks.state, "failed" as any)];
      if (workspaceId) conditions.push(eq(tasks.workspaceId, workspaceId));
      const failedTasks = await db
        .select({ id: tasks.id })
        .from(tasks)
        .where(and(...conditions));

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
    },
  );

  // Cancel all running/queued tasks — member+
  app.post(
    "/api/tasks/bulk/cancel-active",
    { preHandler: [requireRole("member")] },
    async (req, reply) => {
      const workspaceId = req.user?.workspaceId;
      const runningConds = [eq(tasks.state, "running" as any)];
      const queuedConds = [eq(tasks.state, "queued" as any)];
      if (workspaceId) {
        runningConds.push(eq(tasks.workspaceId, workspaceId));
        queuedConds.push(eq(tasks.workspaceId, workspaceId));
      }
      const activeTasks = await db
        .select({ id: tasks.id, state: tasks.state })
        .from(tasks)
        .where(and(...runningConds));

      const queuedTasks = await db
        .select({ id: tasks.id, state: tasks.state })
        .from(tasks)
        .where(and(...queuedConds));

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
    },
  );
}
