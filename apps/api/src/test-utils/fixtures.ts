/**
 * Shared test fixtures matching the canonical domain schemas.
 *
 * When a route attaches a response schema via `schema.response[200]`,
 * the type-provider serializer validates the actual reply body against
 * that schema. Tests that mock service methods must return objects that
 * match the schema or the serializer throws. Keeping full, realistic
 * mocks in one place avoids scattering duplicates across every test
 * file and makes it obvious when a new schema field needs to be added.
 *
 * Each fixture is a "factory" — spread it and override only the fields
 * that matter for a given test:
 *
 *     mockGetTask.mockResolvedValue({ ...mockTask, state: "failed" });
 */

export const mockTask = {
  id: "task-1",
  title: "Fix bug",
  prompt: "Fix the bug",
  repoUrl: "https://github.com/org/repo",
  repoBranch: "main",
  state: "running",
  agentType: "claude-code",
  containerId: null,
  sessionId: null,
  prUrl: null,
  prNumber: null,
  prState: null,
  prChecksStatus: null,
  prReviewStatus: null,
  prReviewComments: null,
  resultSummary: null,
  costUsd: null,
  inputTokens: null,
  outputTokens: null,
  modelUsed: null,
  errorMessage: null,
  ticketSource: null,
  ticketExternalId: null,
  metadata: null,
  retryCount: 0,
  maxRetries: 3,
  priority: 100,
  parentTaskId: null,
  taskType: "coding",
  subtaskOrder: 0,
  blocksParent: false,
  worktreeState: null,
  lastPodId: null,
  workflowRunId: null,
  createdBy: null,
  ignoreOffPeak: false,
  lastActivityAt: null,
  activitySubstate: "active",
  workspaceId: "ws-1",
  lastMessageAt: null,
  createdAt: new Date("2026-04-11T12:00:00Z"),
  updatedAt: new Date("2026-04-11T12:00:00Z"),
  startedAt: null,
  completedAt: null,
} as const;

export const mockTaskEvent = {
  id: "ev-1",
  taskId: "task-1",
  fromState: "pending",
  toState: "queued",
  trigger: "task_submitted",
  message: null,
  userId: "user-1",
  createdAt: new Date("2026-04-11T12:00:00Z"),
};

export const mockLogEntry = {
  id: "log-1",
  taskId: "task-1",
  stream: "stdout",
  content: "hello",
  logType: "text",
  metadata: null,
  workflowRunId: null,
  timestamp: new Date("2026-04-11T12:00:00Z"),
};

export const mockTaskComment = {
  id: "comment-1",
  taskId: "task-1",
  userId: "user-1",
  content: "Looks good!",
  createdAt: new Date("2026-04-11T12:00:00Z"),
  updatedAt: new Date("2026-04-11T12:00:00Z"),
  user: {
    id: "user-1",
    displayName: "Test User",
    avatarUrl: null,
  },
};

export const mockTaskMessage = {
  id: "msg-1",
  taskId: "task-1",
  userId: "user-1",
  content: "Try again please",
  mode: "soft",
  workspaceId: "ws-1",
  createdAt: new Date("2026-04-11T12:00:00Z"),
  deliveredAt: null,
  ackedAt: null,
  deliveryError: null,
  user: {
    id: "user-1",
    displayName: "Test User",
    avatarUrl: null,
  },
};
