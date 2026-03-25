import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import fp from "fastify-plugin";
import { validateSession, type SessionUser } from "../services/session-service.js";
import { isAuthDisabled } from "../services/oauth/index.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: SessionUser;
  }
}

const SESSION_COOKIE_NAME = "optio_session";

/** Routes that never require authentication. */
const PUBLIC_ROUTES = ["/api/health", "/api/auth/", "/api/setup/"];

function isPublicRoute(url: string): boolean {
  return PUBLIC_ROUTES.some((prefix) => url.startsWith(prefix));
}

function parseCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

async function authPlugin(app: FastifyInstance) {
  app.addHook("preHandler", async (req: FastifyRequest, reply: FastifyReply) => {
    // Auth disabled — allow everything
    if (isAuthDisabled()) return;

    // Public routes — no auth needed
    if (isPublicRoute(req.url)) return;

    // WebSocket upgrades pass token as query param
    const token =
      parseCookie(req.headers.cookie, SESSION_COOKIE_NAME) ??
      (req.query as Record<string, string>)?.token;

    if (!token) {
      return reply.status(401).send({ error: "Authentication required" });
    }

    const user = await validateSession(token);
    if (!user) {
      return reply.status(401).send({ error: "Invalid or expired session" });
    }

    req.user = user;
  });
}

export default fp(authPlugin, { name: "optio-auth" });
export { SESSION_COOKIE_NAME };
