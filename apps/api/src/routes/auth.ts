import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import {
  getClaudeAuthToken,
  getClaudeUsage,
  invalidateCredentialsCache,
} from "../services/auth-service.js";
import { getOAuthProvider, getEnabledProviders, isAuthDisabled } from "../services/oauth/index.js";
import { createSession, revokeSession, validateSession } from "../services/session-service.js";
import { SESSION_COOKIE_NAME } from "../plugins/auth.js";

const WEB_URL = process.env.WEB_PUBLIC_URL ?? "http://localhost:3000";

// In-memory state store for CSRF protection (short-lived, 10 min TTL)
const oauthStates = new Map<string, { provider: string; createdAt: number }>();

// Clean expired states periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of oauthStates) {
    if (now - val.createdAt > 10 * 60 * 1000) oauthStates.delete(key);
  }
}, 60_000);

export async function authRoutes(app: FastifyInstance) {
  // ─── Existing Claude auth endpoints ───

  app.get("/api/auth/claude-token", async (_req, reply) => {
    const result = getClaudeAuthToken();
    if (!result.available || !result.token) {
      return reply.status(503).send({ error: result.error ?? "Token not available" });
    }
    reply.type("text/plain").send(result.token);
  });

  app.get("/api/auth/status", async (_req, reply) => {
    const result = getClaudeAuthToken();
    reply.send({
      subscription: {
        available: result.available,
        expiresAt: result.expiresAt,
        error: result.error,
      },
    });
  });

  app.get("/api/auth/usage", async (_req, reply) => {
    const usage = await getClaudeUsage();
    reply.send({ usage });
  });

  app.post("/api/auth/refresh", async (_req, reply) => {
    invalidateCredentialsCache();
    const result = getClaudeAuthToken();
    reply.send({
      subscription: {
        available: result.available,
        expiresAt: result.expiresAt,
        error: result.error,
      },
    });
  });

  // ─── OAuth endpoints ───

  /** List enabled OAuth providers + auth config. */
  app.get("/api/auth/providers", async (_req, reply) => {
    reply.send({
      providers: getEnabledProviders(),
      authDisabled: isAuthDisabled(),
    });
  });

  /** Initiate OAuth flow — redirects to provider. */
  app.get<{ Params: { provider: string } }>("/api/auth/:provider/login", async (req, reply) => {
    const providerName = req.params.provider;
    const provider = getOAuthProvider(providerName);
    if (!provider) {
      return reply.status(404).send({ error: `Unknown provider: ${providerName}` });
    }

    const state = randomBytes(16).toString("hex");
    oauthStates.set(state, { provider: providerName, createdAt: Date.now() });

    const url = provider.authorizeUrl(state);
    reply.redirect(url);
  });

  /** OAuth callback — exchange code, create session, redirect to web. */
  app.get<{
    Params: { provider: string };
    Querystring: { code?: string; state?: string; error?: string };
  }>("/api/auth/:provider/callback", async (req, reply) => {
    const { provider: providerName } = req.params;
    const { code, state, error } = req.query;

    if (error) {
      return reply.redirect(`${WEB_URL}/login?error=${encodeURIComponent(error)}`);
    }

    if (!code || !state) {
      return reply.redirect(`${WEB_URL}/login?error=missing_params`);
    }

    // Verify state
    const storedState = oauthStates.get(state);
    if (!storedState || storedState.provider !== providerName) {
      return reply.redirect(`${WEB_URL}/login?error=invalid_state`);
    }
    oauthStates.delete(state);

    const provider = getOAuthProvider(providerName);
    if (!provider) {
      return reply.redirect(`${WEB_URL}/login?error=unknown_provider`);
    }

    try {
      const tokens = await provider.exchangeCode(code);
      const profile = await provider.fetchUser(tokens.accessToken);
      const { token } = await createSession(providerName, profile);

      // Set session cookie and redirect to web app
      reply
        .header(
          "Set-Cookie",
          `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}`,
        )
        .redirect(`${WEB_URL}/`);
    } catch (err) {
      app.log.error(err, "OAuth callback failed");
      const msg = err instanceof Error ? err.message : "unknown_error";
      reply.redirect(`${WEB_URL}/login?error=${encodeURIComponent(msg)}`);
    }
  });

  /** Get current user from session. */
  app.get("/api/auth/me", async (req, reply) => {
    if (isAuthDisabled()) {
      return reply.send({
        user: {
          id: "local",
          provider: "local",
          email: "dev@localhost",
          displayName: "Local Dev",
          avatarUrl: null,
        },
        authDisabled: true,
      });
    }

    // Parse session cookie
    const cookieHeader = req.headers.cookie;
    const match = cookieHeader?.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]*)`));
    const token = match ? decodeURIComponent(match[1]) : undefined;

    if (!token) {
      return reply.status(401).send({ error: "Not authenticated" });
    }

    const user = await validateSession(token);
    if (!user) {
      return reply.status(401).send({ error: "Invalid or expired session" });
    }

    reply.send({ user, authDisabled: false });
  });

  /** Logout — revoke session and clear cookie. */
  app.post("/api/auth/logout", async (req, reply) => {
    const cookieHeader = req.headers.cookie;
    const match = cookieHeader?.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]*)`));
    const token = match ? decodeURIComponent(match[1]) : undefined;

    if (token) {
      await revokeSession(token);
    }

    reply
      .header("Set-Cookie", `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`)
      .send({ ok: true });
  });
}
