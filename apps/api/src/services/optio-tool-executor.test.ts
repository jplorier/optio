import { describe, it, expect, vi } from "vitest";
import {
  executeToolCall,
  truncateToolResult,
  MAX_TOOL_RESULT_LENGTH,
} from "./optio-tool-executor.js";

/** Create a minimal Fastify-like app with a mocked inject method. */
function mockApp(response: { statusCode: number; body: string }) {
  return {
    inject: vi.fn().mockResolvedValue(response),
  } as unknown as Parameters<typeof executeToolCall>[0];
}

describe("optio-tool-executor", () => {
  // ─── executeToolCall ───

  describe("executeToolCall", () => {
    it("executes a GET tool with no parameters", async () => {
      const app = mockApp({ statusCode: 200, body: '{"repos":[]}' });
      const result = await executeToolCall(app, "list_repos", {}, "token123");

      expect(result.success).toBe(true);
      expect(result.result).toBe('{"repos":[]}');
      expect(app.inject as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "GET",
          url: "/api/repos",
          headers: expect.objectContaining({
            cookie: "optio_session=token123",
          }),
        }),
      );
    });

    it("replaces path parameters in the URL", async () => {
      const app = mockApp({ statusCode: 200, body: '{"id":"abc","title":"test"}' });
      const result = await executeToolCall(app, "get_task", { id: "abc-123" }, "tok");

      expect(result.success).toBe(true);
      expect(app.inject as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
        expect.objectContaining({
          url: "/api/tasks/abc-123",
        }),
      );
    });

    it("adds remaining params as query string for GET", async () => {
      const app = mockApp({ statusCode: 200, body: "[]" });
      await executeToolCall(app, "list_tasks", { state: "failed", limit: 10 }, "tok");

      const call = (app.inject as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.url).toContain("state=failed");
      expect(call.url).toContain("limit=10");
      expect(call.method).toBe("GET");
    });

    it("sends remaining params as payload for POST", async () => {
      const app = mockApp({ statusCode: 201, body: '{"id":"new-task"}' });
      await executeToolCall(
        app,
        "create_task",
        { title: "Fix bug", repoUrl: "https://github.com/test/repo", prompt: "Fix it" },
        "tok",
      );

      const call = (app.inject as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.method).toBe("POST");
      expect(call.url).toBe("/api/tasks");
      expect(call.payload).toEqual({
        title: "Fix bug",
        repoUrl: "https://github.com/test/repo",
        prompt: "Fix it",
      });
    });

    it("separates path params from body params for POST with :id", async () => {
      const app = mockApp({ statusCode: 200, body: '{"ok":true}' });
      await executeToolCall(app, "retry_task", { id: "task-42" }, "tok");

      const call = (app.inject as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.method).toBe("POST");
      expect(call.url).toBe("/api/tasks/task-42/retry");
      // No payload since the only param was the path param
      expect(call.payload).toBeUndefined();
    });

    it("returns success=false for 4xx/5xx status codes", async () => {
      const app = mockApp({ statusCode: 404, body: '{"error":"Not found"}' });
      const result = await executeToolCall(app, "get_task", { id: "missing" }, "tok");

      expect(result.success).toBe(false);
      expect(result.result).toBe('{"error":"Not found"}');
    });

    it("returns success=false for unknown tool names", async () => {
      const app = mockApp({ statusCode: 200, body: "" });
      const result = await executeToolCall(app, "nonexistent_tool", {}, "tok");

      expect(result.success).toBe(false);
      expect(result.result).toContain("Unknown tool");
      // inject should not have been called
      expect(app.inject as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
    });

    it("returns success=false when inject throws", async () => {
      const app = {
        inject: vi.fn().mockRejectedValue(new Error("Connection refused")),
      } as unknown as Parameters<typeof executeToolCall>[0];

      const result = await executeToolCall(app, "list_tasks", {}, "tok");

      expect(result.success).toBe(false);
      expect(result.result).toContain("Connection refused");
    });

    it("encodes path parameter values", async () => {
      const app = mockApp({ statusCode: 200, body: "{}" });
      await executeToolCall(app, "get_task", { id: "id with spaces/special" }, "tok");

      const call = (app.inject as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.url).toContain("id%20with%20spaces%2Fspecial");
    });

    it("skips undefined values in remaining params", async () => {
      const app = mockApp({ statusCode: 200, body: "[]" });
      await executeToolCall(
        app,
        "list_tasks",
        { state: "failed", repoUrl: undefined, limit: 5 },
        "tok",
      );

      const call = (app.inject as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.url).toContain("state=failed");
      expect(call.url).toContain("limit=5");
      expect(call.url).not.toContain("repoUrl");
    });
  });

  // ─── truncateToolResult ───

  describe("truncateToolResult", () => {
    it("returns short strings unchanged", () => {
      expect(truncateToolResult("hello")).toBe("hello");
    });

    it("truncates strings exceeding MAX_TOOL_RESULT_LENGTH", () => {
      const long = "x".repeat(MAX_TOOL_RESULT_LENGTH + 100);
      const truncated = truncateToolResult(long);
      expect(truncated.length).toBeLessThan(long.length);
      expect(truncated).toContain("… (truncated)");
      expect(truncated.startsWith("x".repeat(100))).toBe(true);
    });

    it("does not truncate strings at exactly MAX_TOOL_RESULT_LENGTH", () => {
      const exact = "y".repeat(MAX_TOOL_RESULT_LENGTH);
      expect(truncateToolResult(exact)).toBe(exact);
    });
  });
});
