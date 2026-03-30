import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { getGitHubToken } from "../services/github-token-service.js";
import { isGitHubAppConfigured } from "../services/github-app-service.js";

function deriveCredentialSecret(): string | null {
  if (process.env.OPTIO_CREDENTIAL_SECRET) return process.env.OPTIO_CREDENTIAL_SECRET;
  if (process.env.OPTIO_ENCRYPTION_KEY) {
    // Derive a separate secret — never expose the raw encryption key to pods.
    // Must match the Helm template: sha256sum of "{key}:credential-secret"
    return createHash("sha256")
      .update(`${process.env.OPTIO_ENCRYPTION_KEY}:credential-secret`)
      .digest("hex");
  }
  return null;
}

// Lazy-initialized credential secret. Computed on first access so that:
// 1. Local dev without GitHub App doesn't crash on module load
// 2. Test module loading order doesn't matter
let credentialSecret: string | null | undefined;

function getOrDeriveCredentialSecret(): string | null {
  if (credentialSecret === undefined) {
    credentialSecret = deriveCredentialSecret();
  }
  return credentialSecret;
}

export function getCredentialSecret(): string {
  const secret = getOrDeriveCredentialSecret();
  if (!secret) {
    throw new Error(
      "OPTIO_CREDENTIAL_SECRET or OPTIO_ENCRYPTION_KEY required for credential endpoint",
    );
  }
  return secret;
}

/** Re-derive the credential secret from current env vars. For testing only. */
export function resetCredentialSecret(): void {
  credentialSecret = undefined;
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
