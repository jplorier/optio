import type { FastifyInstance } from "fastify";
import { requireRole } from "../plugins/auth.js";
import * as prReviewService from "../services/pr-review-service.js";
import { logger } from "../logger.js";

export async function prReviewRoutes(app: FastifyInstance) {
  // List open PRs from configured repos
  app.get("/api/pull-requests", async (req, reply) => {
    const query = req.query as { repoId?: string };
    const pullRequests = await prReviewService.listOpenPrs(
      req.user?.workspaceId ?? undefined,
      query.repoId,
    );
    reply.send({ pullRequests });
  });

  // Create a pr_review task for a PR
  app.post(
    "/api/pull-requests/review",
    { preHandler: [requireRole("member")] },
    async (req, reply) => {
      const body = req.body as { prUrl: string };
      if (!body.prUrl) return reply.status(400).send({ error: "prUrl is required" });

      try {
        const result = await prReviewService.launchPrReview({
          prUrl: body.prUrl,
          workspaceId: req.user?.workspaceId ?? undefined,
          createdBy: req.user?.id,
        });
        reply.status(201).send(result);
      } catch (err: any) {
        logger.warn({ err, prUrl: body.prUrl }, "Failed to launch PR review");
        reply.status(400).send({ error: err.message });
      }
    },
  );

  // Get review draft for a task
  app.get("/api/tasks/:id/review-draft", async (req, reply) => {
    const { id } = req.params as { id: string };
    const draft = await prReviewService.getReviewDraft(id);
    if (!draft) return reply.status(404).send({ error: "No review draft found" });
    reply.send({ draft });
  });

  // Update review draft (edit summary, verdict, comments)
  app.patch(
    "/api/tasks/:id/review-draft",
    { preHandler: [requireRole("member")] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = req.body as {
        summary?: string;
        verdict?: string;
        fileComments?: Array<{ path: string; line?: number; side?: string; body: string }>;
      };

      // Get the draft for this task
      const draft = await prReviewService.getReviewDraft(id);
      if (!draft) return reply.status(404).send({ error: "No review draft found" });

      try {
        const updated = await prReviewService.updateReviewDraft(draft.id, body);
        reply.send({ draft: updated });
      } catch (err: any) {
        reply.status(400).send({ error: err.message });
      }
    },
  );

  // Submit review to git platform (GitHub or GitLab)
  app.post(
    "/api/tasks/:id/review-draft/submit",
    { preHandler: [requireRole("member")] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const draft = await prReviewService.getReviewDraft(id);
      if (!draft) return reply.status(404).send({ error: "No review draft found" });

      try {
        const result = await prReviewService.submitReview(draft.id, req.user?.id);
        reply.send(result);
      } catch (err: any) {
        logger.warn({ err, taskId: id }, "Failed to submit review");
        reply.status(400).send({ error: err.message });
      }
    },
  );

  // Re-review: create a new review task for the same PR
  app.post(
    "/api/tasks/:id/review-draft/re-review",
    { preHandler: [requireRole("member")] },
    async (req, reply) => {
      const { id } = req.params as { id: string };

      try {
        const result = await prReviewService.reReview(
          id,
          req.user?.id,
          req.user?.workspaceId ?? undefined,
        );
        reply.status(201).send(result);
      } catch (err: any) {
        logger.warn({ err, taskId: id }, "Failed to re-review PR");
        reply.status(400).send({ error: err.message });
      }
    },
  );

  // Merge a PR
  app.post(
    "/api/pull-requests/merge",
    { preHandler: [requireRole("member")] },
    async (req, reply) => {
      const body = req.body as {
        prUrl: string;
        mergeMethod: "merge" | "squash" | "rebase";
      };
      if (!body.prUrl) return reply.status(400).send({ error: "prUrl is required" });
      if (!["merge", "squash", "rebase"].includes(body.mergeMethod)) {
        return reply.status(400).send({ error: "mergeMethod must be merge, squash, or rebase" });
      }

      try {
        const result = await prReviewService.mergePr({
          prUrl: body.prUrl,
          mergeMethod: body.mergeMethod,
          userId: req.user?.id,
        });
        reply.send(result);
      } catch (err: any) {
        logger.warn({ err, prUrl: body.prUrl }, "Failed to merge PR");
        reply.status(400).send({ error: err.message });
      }
    },
  );

  // Get CI + review status for a PR
  app.get("/api/pull-requests/status", async (req, reply) => {
    const query = req.query as { prUrl?: string };
    if (!query.prUrl) return reply.status(400).send({ error: "prUrl query param is required" });

    try {
      const status = await prReviewService.getPrStatus(query.prUrl);
      reply.send(status);
    } catch (err: any) {
      logger.warn({ err, prUrl: query.prUrl }, "Failed to get PR status");
      reply.status(400).send({ error: err.message });
    }
  });
}
