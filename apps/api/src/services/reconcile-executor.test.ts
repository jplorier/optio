import { describe, it, expect, vi, beforeEach } from "vitest";
import { TaskState, WorkflowRunState } from "@optio/shared";
import type { Action, RepoAction, StandaloneAction, WorldSnapshot, Run } from "@optio/shared";

// ─── Mocks ───

const mockDbUpdate = vi.fn();
const mockTransitionTask = vi.fn();

function chainable(returning: unknown) {
  const obj: Record<string, unknown> = {};
  for (const m of ["set", "where"]) {
    obj[m] = vi.fn().mockReturnValue(obj);
  }
  obj.returning = vi.fn().mockResolvedValue(returning);
  return obj;
}

vi.mock("../db/client.js", () => ({
  db: {
    update: (...args: unknown[]) => mockDbUpdate(...args),
  },
}));

vi.mock("../db/schema.js", () => ({
  tasks: { id: "id", updatedAt: "updated_at" },
  workflowRuns: { id: "id", updatedAt: "updated_at", state: "state" },
}));

vi.mock("./task-service.js", () => ({
  transitionTask: (...args: unknown[]) => mockTransitionTask(...args),
}));

vi.mock("../logger.js", () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

// Import AFTER mocks
import { executeAction } from "./reconcile-executor.js";

// ─── Fixtures ───

const BASE_VERSION = new Date("2026-04-17T12:00:00Z");
const NOW = new Date("2026-04-17T12:05:00Z");

function repoSnapshot(overrides: Partial<WorldSnapshot> = {}): WorldSnapshot {
  const run: Run = {
    kind: "repo",
    ref: { kind: "repo", id: "task-1" },
    spec: {
      repoUrl: "https://github.com/acme/repo",
      repoBranch: "main",
      agentType: "claude-code",
      prompt: "fix",
      title: "Fix",
      taskType: "coding",
      maxRetries: 3,
      priority: 100,
      ignoreOffPeak: false,
      parentTaskId: null,
      blocksParent: false,
      workspaceId: "ws-1",
      workflowRunId: null,
    },
    status: {
      state: TaskState.QUEUED,
      prUrl: null,
      prNumber: null,
      prState: null,
      prChecksStatus: null,
      prReviewStatus: null,
      prReviewComments: null,
      containerId: null,
      sessionId: null,
      worktreeState: null,
      lastPodId: null,
      lastActivityAt: null,
      retryCount: 0,
      errorMessage: null,
      costUsd: null,
      startedAt: null,
      completedAt: null,
      controlIntent: null,
      reconcileBackoffUntil: null,
      reconcileAttempts: 0,
      updatedAt: BASE_VERSION,
    },
  };
  return {
    now: NOW,
    run,
    pod: null,
    pr: null,
    dependencies: [],
    blockingSubtasks: [],
    capacity: { global: { running: 0, max: 5 } },
    heartbeat: { lastActivityAt: null, isStale: false, silentForMs: 0 },
    settings: {
      stallThresholdMs: 300_000,
      autoMerge: false,
      cautiousMode: false,
      autoResume: false,
      reviewEnabled: false,
      reviewTrigger: null,
      offPeakOnly: false,
      offPeakActive: false,
      hasReviewSubtask: false,
    },
    readErrors: [],
    ...overrides,
  };
}

function standaloneSnapshot(overrides: Partial<WorldSnapshot> = {}): WorldSnapshot {
  const run: Run = {
    kind: "standalone",
    ref: { kind: "standalone", id: "run-1" },
    spec: {
      workflowId: "wf-1",
      workflowEnabled: true,
      agentRuntime: "claude-code",
      promptRendered: "do",
      params: null,
      maxConcurrent: 5,
      maxRetries: 3,
      workspaceId: "ws-1",
    },
    status: {
      state: WorkflowRunState.QUEUED,
      costUsd: null,
      errorMessage: null,
      sessionId: null,
      podName: null,
      retryCount: 0,
      startedAt: null,
      finishedAt: null,
      controlIntent: null,
      reconcileBackoffUntil: null,
      reconcileAttempts: 0,
      updatedAt: BASE_VERSION,
    },
  };
  return {
    now: NOW,
    run,
    pod: null,
    pr: null,
    dependencies: [],
    blockingSubtasks: [],
    capacity: { global: { running: 0, max: 5 } },
    heartbeat: { lastActivityAt: null, isStale: false, silentForMs: 0 },
    settings: {
      stallThresholdMs: 300_000,
      autoMerge: false,
      cautiousMode: false,
      autoResume: false,
      reviewEnabled: false,
      reviewTrigger: null,
      offPeakOnly: false,
      offPeakActive: false,
      hasReviewSubtask: false,
    },
    readErrors: [],
    ...overrides,
  };
}

// ─── Tests ───

describe("reconcile-executor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("shadow mode", () => {
    it("returns shadow outcome without any DB call", async () => {
      const action: Action = { kind: "noop", reason: "healthy" };
      const outcome = await executeAction(action, repoSnapshot(), { shadow: true });
      expect(outcome.status).toBe("shadow");
      expect(mockDbUpdate).not.toHaveBeenCalled();
      expect(mockTransitionTask).not.toHaveBeenCalled();
    });

    it("shadows transition actions too", async () => {
      const action: RepoAction = {
        kind: "transition",
        to: TaskState.CANCELLED,
        trigger: "user_cancel",
        reason: "control_intent=cancel",
      };
      const outcome = await executeAction(action, repoSnapshot(), { shadow: true });
      expect(outcome.status).toBe("shadow");
      expect(mockTransitionTask).not.toHaveBeenCalled();
    });
  });

  describe("simple actions", () => {
    it("noop → skipped", async () => {
      const outcome = await executeAction({ kind: "noop", reason: "idle" }, repoSnapshot());
      expect(outcome.status).toBe("skipped");
      expect(outcome.reason).toBe("idle");
    });

    it("requeueSoon → skipped (worker handles re-enqueue)", async () => {
      const action: Action = {
        kind: "requeueSoon",
        delayMs: 10_000,
        reason: "capacity",
      };
      const outcome = await executeAction(action, repoSnapshot());
      expect(outcome.status).toBe("skipped");
      expect(mockDbUpdate).not.toHaveBeenCalled();
    });

    it("Phase-B-deferred side effects return skipped", async () => {
      const actions: RepoAction[] = [
        { kind: "requeueForAgent", trigger: "t", reason: "r" },
        { kind: "resumeAgent", resumeReason: "ci_failure", reason: "r" },
        { kind: "launchReview", reason: "r" },
        { kind: "autoMergePr", reason: "r" },
      ];
      for (const action of actions) {
        const outcome = await executeAction(action, repoSnapshot());
        expect(outcome.status).toBe("skipped");
        expect(outcome.reason).toMatch(/^phase_b_defer:/);
      }
      expect(mockDbUpdate).not.toHaveBeenCalled();
    });
  });

  describe("deferWithBackoff", () => {
    it("writes backoff_until and increments attempts for repo runs", async () => {
      const chain = chainable([{ id: "task-1" }]);
      mockDbUpdate.mockReturnValue(chain);

      const action: Action = {
        kind: "deferWithBackoff",
        untilMs: NOW.getTime() + 60_000,
        reason: "github_timeout",
      };
      const outcome = await executeAction(action, repoSnapshot());
      expect(outcome.status).toBe("applied");
      expect(chain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          reconcileBackoffUntil: expect.any(Date),
          reconcileAttempts: 1,
        }),
      );
    });

    it("increments attempts counter across defers", async () => {
      const chain = chainable([{ id: "task-1" }]);
      mockDbUpdate.mockReturnValue(chain);

      const snap = repoSnapshot();
      snap.run.status.reconcileAttempts = 4;
      const action: Action = {
        kind: "deferWithBackoff",
        untilMs: NOW.getTime() + 60_000,
        reason: "github_timeout",
      };
      await executeAction(action, snap);
      expect(chain.set).toHaveBeenCalledWith(expect.objectContaining({ reconcileAttempts: 5 }));
    });

    it("returns stale when CAS fails", async () => {
      const chain = chainable([]);
      mockDbUpdate.mockReturnValue(chain);
      const action: Action = {
        kind: "deferWithBackoff",
        untilMs: NOW.getTime() + 60_000,
        reason: "x",
      };
      const outcome = await executeAction(action, repoSnapshot());
      expect(outcome.status).toBe("stale");
    });

    it("works for standalone runs too", async () => {
      const chain = chainable([{ id: "run-1" }]);
      mockDbUpdate.mockReturnValue(chain);
      const action: Action = {
        kind: "deferWithBackoff",
        untilMs: NOW.getTime() + 60_000,
        reason: "pod_timeout",
      };
      const outcome = await executeAction(action, standaloneSnapshot());
      expect(outcome.status).toBe("applied");
    });
  });

  describe("clearControlIntent", () => {
    it("sets control_intent to null for repo runs", async () => {
      const chain = chainable([{ id: "task-1" }]);
      mockDbUpdate.mockReturnValue(chain);

      const outcome = await executeAction(
        { kind: "clearControlIntent", reason: "exhausted" },
        repoSnapshot(),
      );
      expect(outcome.status).toBe("applied");
      expect(chain.set).toHaveBeenCalledWith(expect.objectContaining({ controlIntent: null }));
    });

    it("clears intent on standalone runs", async () => {
      const chain = chainable([{ id: "run-1" }]);
      mockDbUpdate.mockReturnValue(chain);

      const outcome = await executeAction(
        { kind: "clearControlIntent", reason: "unsupported" },
        standaloneSnapshot(),
      );
      expect(outcome.status).toBe("applied");
    });

    it("stale CAS on clear returns stale", async () => {
      mockDbUpdate.mockReturnValue(chainable([]));
      const outcome = await executeAction(
        { kind: "clearControlIntent", reason: "x" },
        repoSnapshot(),
      );
      expect(outcome.status).toBe("stale");
    });
  });

  describe("repo transition", () => {
    it("applies patch + transitionTask on success", async () => {
      const chain = chainable([{ id: "task-1" }]);
      mockDbUpdate.mockReturnValue(chain);
      mockTransitionTask.mockResolvedValue({ id: "task-1", state: "cancelled" });

      const action: RepoAction = {
        kind: "transition",
        to: TaskState.CANCELLED,
        statusPatch: { errorMessage: "Cancelled by user" },
        clearControlIntent: true,
        trigger: "user_cancel",
        reason: "control_intent=cancel",
      };
      const outcome = await executeAction(action, repoSnapshot());
      expect(outcome.status).toBe("applied");
      expect(mockTransitionTask).toHaveBeenCalledWith(
        "task-1",
        TaskState.CANCELLED,
        "user_cancel",
        expect.any(String),
      );
      // Patch should include backoff reset, intent clear, plus errorMessage
      expect(chain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          errorMessage: "Cancelled by user",
          reconcileBackoffUntil: null,
          reconcileAttempts: 0,
          controlIntent: null,
        }),
      );
    });

    it("bails before transitionTask when pre-patch CAS fails", async () => {
      mockDbUpdate.mockReturnValue(chainable([])); // stale

      const action: RepoAction = {
        kind: "transition",
        to: TaskState.FAILED,
        statusPatch: { errorMessage: "oops" },
        trigger: "pr_closed",
        reason: "pr_closed",
      };
      const outcome = await executeAction(action, repoSnapshot());
      expect(outcome.status).toBe("stale");
      expect(mockTransitionTask).not.toHaveBeenCalled();
    });

    it("maps StateRaceError from transitionTask to stale", async () => {
      mockDbUpdate.mockReturnValue(chainable([{ id: "task-1" }]));
      mockTransitionTask.mockRejectedValue(new Error("StateRaceError: queued -> running"));

      const action: RepoAction = {
        kind: "transition",
        to: TaskState.RUNNING,
        trigger: "claim",
        reason: "claim",
      };
      const outcome = await executeAction(action, repoSnapshot());
      expect(outcome.status).toBe("stale");
    });

    it("surfaces other transitionTask errors as error outcomes", async () => {
      mockDbUpdate.mockReturnValue(chainable([{ id: "task-1" }]));
      mockTransitionTask.mockRejectedValue(new Error("ENOTFOUND"));

      const action: RepoAction = {
        kind: "transition",
        to: TaskState.FAILED,
        trigger: "x",
        reason: "x",
      };
      const outcome = await executeAction(action, repoSnapshot());
      expect(outcome.status).toBe("error");
    });
  });

  describe("standalone transition", () => {
    it("applies state + patch + CAS", async () => {
      const chain = chainable([{ id: "run-1" }]);
      mockDbUpdate.mockReturnValue(chain);

      const action: StandaloneAction = {
        kind: "transition",
        to: WorkflowRunState.FAILED,
        statusPatch: { errorMessage: "Cancelled by user" },
        clearControlIntent: true,
        trigger: "user_cancel",
        reason: "cancel",
      };
      const outcome = await executeAction(action, standaloneSnapshot());
      expect(outcome.status).toBe("applied");
      expect(chain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          state: WorkflowRunState.FAILED,
          errorMessage: "Cancelled by user",
          controlIntent: null,
          reconcileBackoffUntil: null,
          reconcileAttempts: 0,
        }),
      );
    });

    it("returns stale when CAS finds newer row", async () => {
      mockDbUpdate.mockReturnValue(chainable([]));
      const action: StandaloneAction = {
        kind: "transition",
        to: WorkflowRunState.RUNNING,
        trigger: "claim",
        reason: "claim",
      };
      const outcome = await executeAction(action, standaloneSnapshot());
      expect(outcome.status).toBe("stale");
    });
  });

  describe("patchStatus", () => {
    it("applies patch only, no state change", async () => {
      const chain = chainable([{ id: "task-1" }]);
      mockDbUpdate.mockReturnValue(chain);

      const action: RepoAction = {
        kind: "patchStatus",
        statusPatch: { prReviewStatus: "pending" },
        reason: "pr_status_refresh",
      };
      const outcome = await executeAction(action, repoSnapshot());
      expect(outcome.status).toBe("applied");
      expect(mockTransitionTask).not.toHaveBeenCalled();
      expect(chain.set).toHaveBeenCalledWith(
        expect.objectContaining({ prReviewStatus: "pending" }),
      );
    });

    it("stale CAS returns stale", async () => {
      mockDbUpdate.mockReturnValue(chainable([]));
      const action: RepoAction = {
        kind: "patchStatus",
        statusPatch: { prState: "open" },
        reason: "refresh",
      };
      const outcome = await executeAction(action, repoSnapshot());
      expect(outcome.status).toBe("stale");
    });

    it("patchStatus on standalone returns error (invalid combination)", async () => {
      const action: RepoAction = {
        kind: "patchStatus",
        statusPatch: {},
        reason: "x",
      };
      const outcome = await executeAction(action, standaloneSnapshot());
      expect(outcome.status).toBe("error");
    });
  });

  describe("error paths", () => {
    it("DB exception produces error outcome", async () => {
      mockDbUpdate.mockImplementation(() => {
        throw new Error("db connection lost");
      });

      const action: Action = {
        kind: "deferWithBackoff",
        untilMs: NOW.getTime() + 60_000,
        reason: "x",
      };
      const outcome = await executeAction(action, repoSnapshot());
      expect(outcome.status).toBe("error");
    });
  });
});
