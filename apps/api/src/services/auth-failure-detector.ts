import { and, gt, ilike, or, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { taskLogs } from "../db/schema.js";

/**
 * Substrings (case-insensitive) that indicate an authentication failure bubbling
 * up from claude or the Anthropic API. Picked to cover:
 *  - stream-json `{"type":"error","error":{"type":"authentication_error",...}}`
 *  - plain text `Failed to authenticate. API Error: 401 ...`
 *  - `invalid_api_key` from api-key mode
 *  - our own status endpoint's "OAuth token has expired" message
 *
 * Avoids matching the word "unauthorized" alone since that can appear in
 * unrelated github/git error output.
 */
export const AUTH_FAILURE_PATTERNS = [
  "api error: 401",
  "authentication_error",
  '"status":401',
  "invalid_api_key",
  "invalid api key",
  "oauth token has expired",
] as const;

/** Default lookback window for the banner trigger. */
export const RECENT_AUTH_FAILURE_WINDOW_MS = 15 * 60 * 1000;

/**
 * Returns true if any task log line in the recent window contains an
 * authentication-failure marker. This is what the web dashboard uses to decide
 * whether to show the "OAuth token expired" banner — the usage endpoint alone
 * is unreliable because it can return 429 (rate limited) even when the
 * messages endpoint is returning 401.
 */
export async function hasRecentClaudeAuthFailure(
  windowMs: number = RECENT_AUTH_FAILURE_WINDOW_MS,
): Promise<boolean> {
  const cutoff = new Date(Date.now() - windowMs);
  const patternClauses = AUTH_FAILURE_PATTERNS.map((p) => ilike(taskLogs.content, `%${p}%`));

  const rows = await db
    .select({ exists: sql<number>`1` })
    .from(taskLogs)
    .where(and(gt(taskLogs.timestamp, cutoff), or(...patternClauses)))
    .limit(1);

  return rows.length > 0;
}
