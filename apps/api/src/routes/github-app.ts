import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { getGitHubToken } from "../services/github-token-service.js";
import { isGitHubAppConfigured } from "../services/github-app-service.js";
import {
  getCredentialSecret,
  getOrDeriveCredentialSecret,
  resetCredentialSecret,
} from "../services/credential-secret-service.js";

export { getCredentialSecret, resetCredentialSecret };

export function buildStatusResponse(): {
  configured: boolean;
  appId?: string;
  installationId?: string;
} {
  if (!isGitHubAppConfigured()) {
    return { configured: false };
  }
  return {
    configured: true,
    appId: process.env.GITHUB_APP_ID,
    installationId: process.env.GITHUB_APP_INSTALLATION_ID,
  };
}

export default async function githubAppRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Internal endpoint — called by credential helpers in agent pods.
   * Cluster-internal only: the Helm ingress blocks /api/internal/* from public traffic.
   * Pods reach this via the K8s service DNS (optio-api.optio.svc.cluster.local).
   *
   * With taskId: returns the task creator's user token (for task-scoped operations).
   * Without taskId: returns an installation token (for pod-level operations like clone).
   */
  app.get<{ Querystring: { taskId?: string } }>(
    "/api/internal/git-credentials",
    async (req, reply) => {
      const secret = getOrDeriveCredentialSecret();
      if (!secret) {
        return reply.status(503).send({ error: "Credential secret not configured" });
      }

      const authHeader = req.headers.authorization ?? "";
      const expected = `Bearer ${secret}`;
      const isValid =
        authHeader.length === expected.length &&
        timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected));
      if (!isValid) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      try {
        const { taskId } = req.query;
        const token = taskId
          ? await getGitHubToken({ taskId })
          : await getGitHubToken({ server: true });
        return reply.send({ token });
      } catch (err) {
        app.log.error(err, "Failed to get git credentials");
        return reply.status(500).send({ error: "Failed to retrieve git credentials" });
      }
    },
  );

  app.get("/api/github-app/status", async (_req, reply) => {
    return reply.send(buildStatusResponse());
  });
}
