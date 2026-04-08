import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the db client before importing the module under test so the import
// picks up the mocked chain instead of trying to connect to a real Postgres.
const limitMock = vi.fn();
const whereMock = vi.fn(() => ({ limit: limitMock }));
const fromMock = vi.fn(() => ({ where: whereMock }));
const selectMock = vi.fn(() => ({ from: fromMock }));

vi.mock("../db/client.js", () => ({
  db: { select: selectMock },
}));

vi.mock("../db/schema.js", () => ({
  taskLogs: {
    content: "task_logs.content",
    timestamp: "task_logs.timestamp",
  },
}));

// Import after mocks are in place.
const { hasRecentClaudeAuthFailure, AUTH_FAILURE_PATTERNS } =
  await import("./auth-failure-detector.js");

describe("hasRecentClaudeAuthFailure", () => {
  beforeEach(() => {
    selectMock.mockClear();
    fromMock.mockClear();
    whereMock.mockClear();
    limitMock.mockClear();
  });

  it("returns false when no recent auth-failure log lines are found", async () => {
    limitMock.mockResolvedValueOnce([]);
    await expect(hasRecentClaudeAuthFailure()).resolves.toBe(false);
    expect(selectMock).toHaveBeenCalledOnce();
  });

  it("returns true when at least one matching log row exists", async () => {
    limitMock.mockResolvedValueOnce([{ exists: 1 }]);
    await expect(hasRecentClaudeAuthFailure()).resolves.toBe(true);
  });

  it("passes a LIMIT 1 to the query (we only need to know existence)", async () => {
    limitMock.mockResolvedValueOnce([]);
    await hasRecentClaudeAuthFailure();
    expect(limitMock).toHaveBeenCalledWith(1);
  });

  it("exposes the canonical set of auth-failure substrings", () => {
    // These are the markers we want claude/Anthropic failures to match on.
    // If the set changes, update the banner documentation too.
    expect(AUTH_FAILURE_PATTERNS).toEqual(
      expect.arrayContaining([
        "api error: 401",
        "authentication_error",
        '"status":401',
        "invalid_api_key",
        "invalid api key",
        "oauth token has expired",
      ]),
    );
  });
});
