import { describe, it, expect } from "vitest";
import { CodexAdapter } from "./codex.js";

const adapter = new CodexAdapter();

describe("CodexAdapter", () => {
  describe("type and displayName", () => {
    it("has correct type", () => {
      expect(adapter.type).toBe("codex");
    });

    it("has correct displayName", () => {
      expect(adapter.displayName).toBe("OpenAI Codex");
    });
  });

  describe("validateSecrets", () => {
    it("returns valid when both secrets are present", () => {
      const result = adapter.validateSecrets(["OPENAI_API_KEY", "GITHUB_TOKEN"]);
      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it("reports missing OPENAI_API_KEY", () => {
      const result = adapter.validateSecrets(["GITHUB_TOKEN"]);
      expect(result.valid).toBe(false);
      expect(result.missing).toContain("OPENAI_API_KEY");
    });

    it("reports missing GITHUB_TOKEN", () => {
      const result = adapter.validateSecrets(["OPENAI_API_KEY"]);
      expect(result.valid).toBe(false);
      expect(result.missing).toContain("GITHUB_TOKEN");
    });

    it("reports both missing when empty", () => {
      const result = adapter.validateSecrets([]);
      expect(result.valid).toBe(false);
      expect(result.missing).toEqual(["OPENAI_API_KEY", "GITHUB_TOKEN"]);
    });
  });

  describe("buildContainerConfig", () => {
    const baseInput = {
      taskId: "test-123",
      prompt: "Fix the bug",
      repoUrl: "https://github.com/org/repo",
      repoBranch: "main",
    };

    it("uses rendered prompt when available", () => {
      const config = adapter.buildContainerConfig({
        ...baseInput,
        renderedPrompt: "Rendered: Fix the bug",
      });
      expect(config.env.OPTIO_PROMPT).toBe("Rendered: Fix the bug");
    });

    it("falls back to built prompt when no rendered prompt", () => {
      const config = adapter.buildContainerConfig(baseInput);
      expect(config.env.OPTIO_PROMPT).toContain("Fix the bug");
      expect(config.env.OPTIO_PROMPT).toContain("Instructions:");
    });

    it("includes setup files when task file is provided", () => {
      const config = adapter.buildContainerConfig({
        ...baseInput,
        taskFileContent: "# Task\nDo something",
        taskFilePath: ".optio/task.md",
      });
      expect(config.setupFiles).toHaveLength(1);
      expect(config.setupFiles![0].path).toBe(".optio/task.md");
      expect(config.setupFiles![0].content).toBe("# Task\nDo something");
    });

    it("returns empty setupFiles when no task file", () => {
      const config = adapter.buildContainerConfig(baseInput);
      expect(config.setupFiles).toEqual([]);
    });

    it("sets correct env vars", () => {
      const config = adapter.buildContainerConfig(baseInput);
      expect(config.env.OPTIO_TASK_ID).toBe("test-123");
      expect(config.env.OPTIO_AGENT_TYPE).toBe("codex");
      expect(config.env.OPTIO_BRANCH_NAME).toBe("optio/task-test-123");
    });

    it("requires correct secrets", () => {
      const config = adapter.buildContainerConfig(baseInput);
      expect(config.requiredSecrets).toEqual(["OPENAI_API_KEY", "GITHUB_TOKEN"]);
    });
  });

  describe("parseResult", () => {
    it("returns success for exit code 0 with no errors", () => {
      const result = adapter.parseResult(0, "some output\nmore output");
      expect(result.success).toBe(true);
      expect(result.summary).toBe("Agent completed successfully");
      expect(result.error).toBeUndefined();
    });

    it("returns failure for non-zero exit code", () => {
      const result = adapter.parseResult(1, "some output");
      expect(result.success).toBe(false);
      expect(result.error).toBe("Exit code: 1");
    });

    it("extracts PR URL from logs", () => {
      const logs = `Working on task...\nhttps://github.com/org/repo/pull/42\nDone!`;
      const result = adapter.parseResult(0, logs);
      expect(result.prUrl).toBe("https://github.com/org/repo/pull/42");
    });

    it("extracts cost from usage data in JSON events", () => {
      const logs = [
        '{"type":"message","role":"assistant","content":"Working on it"}',
        '{"type":"message","role":"assistant","content":"Done","usage":{"input_tokens":1000,"output_tokens":500}}',
      ].join("\n");
      const result = adapter.parseResult(0, logs);
      expect(result.costUsd).toBeDefined();
      expect(result.costUsd).toBeGreaterThan(0);
    });

    it("extracts cost from OpenAI-style token naming", () => {
      const logs = [
        '{"type":"message","role":"assistant","content":"Done","usage":{"prompt_tokens":2000,"completion_tokens":1000}}',
      ].join("\n");
      const result = adapter.parseResult(0, logs);
      expect(result.costUsd).toBeDefined();
      expect(result.costUsd).toBeGreaterThan(0);
    });

    it("uses total_cost_usd when provided directly", () => {
      const logs = '{"type":"result","total_cost_usd":0.0534}';
      const result = adapter.parseResult(0, logs);
      expect(result.costUsd).toBe(0.0534);
    });

    it("detects error events in JSON output", () => {
      const logs = '{"type":"error","message":"API key is invalid"}';
      const result = adapter.parseResult(0, logs);
      expect(result.success).toBe(false);
      expect(result.error).toBe("API key is invalid");
    });

    it("extracts summary from last assistant message", () => {
      const logs = [
        '{"type":"message","role":"assistant","content":"Starting work"}',
        '{"type":"message","role":"assistant","content":"All done, PR created"}',
      ].join("\n");
      const result = adapter.parseResult(0, logs);
      expect(result.summary).toBe("All done, PR created");
    });

    it("truncates long summaries", () => {
      const longMsg = "x".repeat(300);
      const logs = `{"type":"message","role":"assistant","content":"${longMsg}"}`;
      const result = adapter.parseResult(0, logs);
      expect(result.summary!.length).toBeLessThanOrEqual(201); // 200 + ellipsis
    });

    it("detects auth errors in raw text", () => {
      const logs = "Error: OPENAI_API_KEY is not set";
      const result = adapter.parseResult(1, logs);
      expect(result.success).toBe(false);
      expect(result.error).toContain("OPENAI_API_KEY");
    });

    it("handles empty logs gracefully", () => {
      const result = adapter.parseResult(0, "");
      expect(result.success).toBe(true);
      expect(result.costUsd).toBeUndefined();
    });

    it("handles model-specific pricing", () => {
      const logs = [
        '{"model":"o4-mini","type":"message","role":"assistant","content":"Hi"}',
        '{"type":"message","role":"assistant","content":"Done","usage":{"input_tokens":1000000,"output_tokens":100000}}',
      ].join("\n");
      const result = adapter.parseResult(0, logs);
      // o4-mini: 1M input tokens * $1.1/M + 100K output tokens * $4.4/M = $1.1 + $0.44 = $1.54
      expect(result.costUsd).toBeCloseTo(1.54, 1);
    });
  });
});
