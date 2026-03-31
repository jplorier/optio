/**
 * Execute Optio tool calls by routing them to the local API via Fastify inject.
 *
 * This avoids network round-trips — the tool executor calls API route handlers
 * directly within the same process.
 */

import type { FastifyInstance } from "fastify";
import { OPTIO_TOOL_MAP } from "@optio/shared";
import { logger } from "../logger.js";

const log = logger.child({ service: "optio-tool-executor" });

/** Maximum length for tool result strings sent back to the model. */
export const MAX_TOOL_RESULT_LENGTH = 8_000;

/**
 * Execute a single Optio tool call by making an internal API request.
 *
 * @param app           Fastify instance (used for `app.inject`)
 * @param toolName      Name of the tool (must match an OPTIO_TOOL_SCHEMAS entry)
 * @param toolInput     Input parameters from the model
 * @param sessionToken  The user's session token for auth
 */
export async function executeToolCall(
  app: FastifyInstance,
  toolName: string,
  toolInput: Record<string, unknown>,
  sessionToken: string,
): Promise<{ success: boolean; result: string }> {
  const schema = OPTIO_TOOL_MAP[toolName];
  if (!schema) {
    return { success: false, result: JSON.stringify({ error: `Unknown tool: ${toolName}` }) };
  }

  try {
    // Parse endpoint template: "GET /api/tasks/:id"
    const spaceIdx = schema.endpoint.indexOf(" ");
    const urlTemplate = spaceIdx >= 0 ? schema.endpoint.slice(spaceIdx + 1) : schema.endpoint;
    let url = urlTemplate;

    // Replace path parameters (:id, etc.)
    const pathParams = new Set<string>();
    for (const [key, value] of Object.entries(toolInput)) {
      const placeholder = `:${key}`;
      if (url.includes(placeholder)) {
        url = url.replace(placeholder, encodeURIComponent(String(value)));
        pathParams.add(key);
      }
    }

    // Remaining params → query string (GET) or JSON body (POST/PATCH/DELETE)
    const remainingParams = Object.fromEntries(
      Object.entries(toolInput).filter(
        ([key, value]) => !pathParams.has(key) && value !== undefined,
      ),
    );

    if (schema.method === "GET" && Object.keys(remainingParams).length > 0) {
      const qs = new URLSearchParams(
        Object.entries(remainingParams).map(([k, v]) => [k, String(v)]),
      );
      url += `?${qs.toString()}`;
    }

    const injectOptions: Record<string, unknown> = {
      method: schema.method,
      url,
      headers: {
        cookie: `optio_session=${sessionToken}`,
        "content-type": "application/json",
      },
    };

    if (schema.method !== "GET" && Object.keys(remainingParams).length > 0) {
      injectOptions.payload = remainingParams;
    }

    const response = await app.inject(injectOptions);
    const statusOk = response.statusCode >= 200 && response.statusCode < 300;

    log.info({ toolName, url, status: response.statusCode, ok: statusOk }, "Tool call executed");

    return { success: statusOk, result: response.body };
  } catch (err) {
    log.error({ err, toolName }, "Tool execution failed");
    return {
      success: false,
      result: JSON.stringify({
        error: `Internal error executing ${toolName}: ${err instanceof Error ? err.message : String(err)}`,
      }),
    };
  }
}

/** Truncate a tool result to stay within context limits. */
export function truncateToolResult(result: string): string {
  if (result.length <= MAX_TOOL_RESULT_LENGTH) return result;
  return result.slice(0, MAX_TOOL_RESULT_LENGTH) + "… (truncated)";
}
