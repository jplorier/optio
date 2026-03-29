import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { getGitHubToken } from "../services/github-token-service.js";
import { isGitHubAppConfigured } from "../services/github-app-service.js";

function deriveCredentialSecret(): string {
  if (process.env.OPTIO_CREDENTIAL_SECRET) return process.env.OPTIO_CREDENTIAL_SECRET;
  if (process.env.OPTIO_ENCRYPTION_KEY) {
    // Derive a separate secret — never expose the raw encryption key to pods.
    // Must match the Helm template: sha256sum of "{key}:credential-secret"
    return createHash("sha256")
      .update(`${process.env.OPTIO_ENCRYPTION_KEY}:credential-secret`)
      .digest("hex");
  }
  return randomBytes(32).toString("hex");
}

// Shared secret for pod-to-API credential requests.
// Injected into pods via OPTIO_CREDENTIAL_SECRET env var.
const CREDENTIAL_SECRET = deriveCredentialSecret();

export function getCredentialSecret(): string {
  return CREDENTIAL_SECRET;
}

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
   * With taskId: returns the task creator's user token (for task-scoped operations).
   * Without taskId: returns an installation token (for pod-level operations like clone).
   */
  app.get<{ Querystring: { taskId?: string } }>(
    "/api/internal/git-credentials",
    async (req, reply) => {
      const authHeader = req.headers.authorization ?? "";
      const expected = `Bearer ${CREDENTIAL_SECRET}`;
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
