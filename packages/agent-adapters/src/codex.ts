import type { AgentTaskInput, AgentContainerConfig, AgentResult } from "@optio/shared";
import { TASK_BRANCH_PREFIX } from "@optio/shared";
import type { AgentAdapter } from "./types.js";

/**
 * Codex CLI (codex exec --full-auto --json) outputs NDJSON events.
 * Each line is a JSON object. Known event shapes:
 *
 * - { type: "message", role: "assistant"|"system", content: "..." }
 * - { type: "function_call", name: "shell"|"...", call_id: "...", arguments: "..." }
 * - { type: "function_call_output", call_id: "...", output: "..." }
 * - { type: "error", message: "..." }
 * - { type: "usage", ... } or inline usage in final message
 *
 * The final summary event may contain usage data with input_tokens / output_tokens.
 */

/** Known Codex-compatible model pricing (USD per 1M tokens) */
const CODEX_MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "codex-mini": { input: 1.5, output: 6.0 },
  "o4-mini": { input: 1.1, output: 4.4 },
  o3: { input: 10.0, output: 40.0 },
  "gpt-4.1": { input: 2.0, output: 8.0 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1-nano": { input: 0.1, output: 0.4 },
};

const DEFAULT_PRICING = CODEX_MODEL_PRICING["codex-mini"];

export class CodexAdapter implements AgentAdapter {
  readonly type = "codex";
  readonly displayName = "OpenAI Codex";

  validateSecrets(availableSecrets: string[]): { valid: boolean; missing: string[] } {
    const required = ["OPENAI_API_KEY", "GITHUB_TOKEN"];
    const missing = required.filter((s) => !availableSecrets.includes(s));
    return { valid: missing.length === 0, missing };
  }

  buildContainerConfig(input: AgentTaskInput): AgentContainerConfig {
    // Use the pre-rendered prompt from the template system, or fall back to raw prompt
    const prompt = input.renderedPrompt ?? this.buildPrompt(input);

    const env: Record<string, string> = {
      OPTIO_TASK_ID: input.taskId,
      OPTIO_REPO_URL: input.repoUrl,
      OPTIO_REPO_BRANCH: input.repoBranch,
      OPTIO_PROMPT: prompt,
      OPTIO_AGENT_TYPE: "codex",
      OPTIO_BRANCH_NAME: `${TASK_BRANCH_PREFIX}${input.taskId}`,
    };

    const requiredSecrets = ["OPENAI_API_KEY", "GITHUB_TOKEN"];
    const setupFiles: AgentContainerConfig["setupFiles"] = [];

    // Write the task file into the worktree
    if (input.taskFileContent && input.taskFilePath) {
      setupFiles.push({
        path: input.taskFilePath,
        content: input.taskFileContent,
      });
    }

    return {
      command: ["/opt/optio/entrypoint.sh"],
      env,
      requiredSecrets,
      setupFiles,
    };
  }

  parseResult(exitCode: number, logs: string): AgentResult {
    // Extract PR URL from anywhere in the logs
    const prMatch = logs.match(/https:\/\/github\.com\/[^\s"]+\/pull\/\d+/);

    // Parse NDJSON lines to extract structured data
    const { costUsd, errorMessage, hasError, summary } = this.parseLogs(logs);

    const success = exitCode === 0 && !hasError;

    return {
      success,
      prUrl: prMatch?.[0],
      costUsd,
      summary:
        summary ??
        (success ? "Agent completed successfully" : `Agent exited with code ${exitCode}`),
      error: !success ? (errorMessage ?? `Exit code: ${exitCode}`) : undefined,
    };
  }

  private parseLogs(logs: string): {
    costUsd?: number;
    errorMessage?: string;
    hasError: boolean;
    summary?: string;
  } {
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let model: string | undefined;
    let errorMessage: string | undefined;
    let hasError = false;
    let lastAssistantMessage: string | undefined;

    for (const line of logs.split("\n")) {
      if (!line.trim()) continue;

      let event: any;
      try {
        event = JSON.parse(line);
      } catch {
        // Not JSON — check for error patterns in raw text
        if (
          /error|failed|fatal/i.test(line) &&
          !errorMessage &&
          /OPENAI_API_KEY|api\.openai\.com|authentication|unauthorized|quota/i.test(line)
        ) {
          errorMessage = line.trim();
          hasError = true;
        }
        continue;
      }

      // Extract model name
      if (event.model && !model) {
        model = event.model;
      }

      // Error events
      if (event.type === "error") {
        errorMessage = event.message ?? event.error ?? JSON.stringify(event);
        hasError = true;
        continue;
      }

      // Track assistant messages for summary
      if (event.type === "message" && event.role === "assistant" && event.content) {
        if (typeof event.content === "string") {
          lastAssistantMessage = event.content;
        }
      }

      // Extract usage data — may appear in multiple places
      const usage = event.usage ?? event.response?.usage;
      if (usage) {
        if (usage.input_tokens) totalInputTokens += usage.input_tokens;
        if (usage.output_tokens) totalOutputTokens += usage.output_tokens;
        // Also handle OpenAI-style naming
        if (usage.prompt_tokens) totalInputTokens += usage.prompt_tokens;
        if (usage.completion_tokens) totalOutputTokens += usage.completion_tokens;
      }

      // Some Codex versions embed total_cost directly
      if (event.total_cost_usd != null) {
        return {
          costUsd: event.total_cost_usd,
          errorMessage,
          hasError,
          summary: lastAssistantMessage ? truncate(lastAssistantMessage, 200) : undefined,
        };
      }
    }

    // Calculate cost from token usage
    let costUsd: number | undefined;
    if (totalInputTokens > 0 || totalOutputTokens > 0) {
      const pricing = model ? (CODEX_MODEL_PRICING[model] ?? DEFAULT_PRICING) : DEFAULT_PRICING;
      costUsd =
        (totalInputTokens / 1_000_000) * pricing.input +
        (totalOutputTokens / 1_000_000) * pricing.output;
    }

    return {
      costUsd,
      errorMessage,
      hasError,
      summary: lastAssistantMessage ? truncate(lastAssistantMessage, 200) : undefined,
    };
  }

  private buildPrompt(input: AgentTaskInput): string {
    const parts = [
      input.prompt,
      "",
      "Instructions:",
      "- Work on the task described above.",
      "- When you are done, create a pull request using the gh CLI.",
      `- Use branch name: ${TASK_BRANCH_PREFIX}${input.taskId}`,
      "- Write a clear PR title and description summarizing your changes.",
    ];
    if (input.additionalContext) {
      parts.push("", "Additional context:", input.additionalContext);
    }
    return parts.join("\n");
  }
}

function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen) + "\u2026";
}
