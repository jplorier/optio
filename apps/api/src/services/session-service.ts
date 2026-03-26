import { randomBytes, createHash } from "node:crypto";
import { db } from "../db/client.js";
import { users, sessions } from "../db/schema.js";
import { eq, and, gt, lt } from "drizzle-orm";
import type { OAuthUser } from "./oauth/provider.js";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface SessionUser {
  id: string;
  provider: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  workspaceId: string | null;
  workspaceRole: string | null;
}

/** Find or create a user from an OAuth profile, then create a session. */
export async function createSession(
  provider: string,
  profile: OAuthUser,
): Promise<{ token: string; user: SessionUser }> {
  // Upsert user
  const existing = await db
    .select()
    .from(users)
    .where(and(eq(users.provider, provider), eq(users.externalId, profile.externalId)))
    .limit(1);

  let user: (typeof existing)[0];

  if (existing.length > 0) {
    // Update user info on login
    const updated = await db
      .update(users)
      .set({
        email: profile.email,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl ?? null,
        lastLoginAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, existing[0].id))
      .returning();
    user = updated[0];
  } else {
    const inserted = await db
      .insert(users)
      .values({
        provider,
        externalId: profile.externalId,
        email: profile.email,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl ?? null,
      })
      .returning();
    user = inserted[0];
  }

  // Create session token
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db.insert(sessions).values({
    userId: user.id,
    tokenHash,
    expiresAt,
  });

  return {
    token,
    user: {
      id: user.id,
      provider: user.provider,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      workspaceId: user.defaultWorkspaceId,
      workspaceRole: null,
    },
  };
}

/** Validate a session token and return the user if valid. */
export async function validateSession(token: string): Promise<SessionUser | null> {
  const tokenHash = hashToken(token);

  const rows = await db
    .select({
      sessionId: sessions.id,
      userId: users.id,
      provider: users.provider,
      email: users.email,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      defaultWorkspaceId: users.defaultWorkspaceId,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date())))
    .limit(1);

  if (rows.length === 0) return null;

  const row = rows[0];
  return {
    id: row.userId,
    provider: row.provider,
    email: row.email,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    workspaceId: row.defaultWorkspaceId,
    workspaceRole: null, // resolved by auth middleware from header/cookie
  };
}

/** Revoke a session by token. */
export async function revokeSession(token: string): Promise<void> {
  const tokenHash = hashToken(token);
  await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
}

/** Revoke all sessions for a user. */
export async function revokeAllUserSessions(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

/** Create a short-lived token for WebSocket authentication. */
export async function createWsToken(userId: string): Promise<string> {
  const WS_TOKEN_TTL_MS = 60_000; // 60 seconds — enough for the WS upgrade
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + WS_TOKEN_TTL_MS);

  await db.insert(sessions).values({ userId, tokenHash, expiresAt });

  return token;
}

/** Delete all expired sessions. Returns count of deleted rows. */
export async function cleanupExpiredSessions(): Promise<number> {
  const result = await db.delete(sessions).where(lt(sessions.expiresAt, new Date())).returning();
  return result.length;
}
