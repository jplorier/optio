import { describe, it, expect } from "vitest";
import { reconcileStandalone } from "./reconcile-standalone.js";
import type { WorldSnapshot, StandaloneRunSpec, StandaloneRunStatus, Run } from "./types.js";
import { WorkflowRunState } from "../types/workflow.js";

// ── Test fixtures ───────────────────────────────────────────────────────────

const NOW = new Date("2026-04-17T12:00:00Z");

function makeSpec(overrides: Partial<StandaloneRunSpec> = {}): StandaloneRunSpec {
  return {
    workflowId: "wf-1",
    workflowEnabled: true,
    agentRuntime: "claude-code",
    promptRendered: "do the thing",
    params: null,
    maxConcurrent: 5,
    maxRetries: 3,
    workspaceId: "ws-1",
    ...overrides,
  };
}

function makeStatus(overrides: Partial<StandaloneRunStatus> = {}): StandaloneRunStatus {
  return {
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
    updatedAt: new Date(NOW.getTime() - 1000),
    ...overrides,
  };
}

function snapshot(
  spec: Partial<StandaloneRunSpec>,
  status: Partial<StandaloneRunStatus>,
  extras: Partial<WorldSnapshot> = {},
): WorldSnapshot {
  const run: Run = {
    kind: "standalone",
    ref: { kind: "standalone", id: "run-1" },
    spec: makeSpec(spec),
    status: makeStatus(status),
  };
  return {
    now: NOW,
    run,
    pod: null,
    pr: null,
    dependencies: [],
    blockingSubtasks: [],
    capacity: {
      global: { running: 1, max: 5 },
    },
    heartbeat: {
      lastActivityAt: null,
      isStale: false,
      silentForMs: 0,
    },
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
    ...extras,
  };
}

// ── Backoff ─────────────────────────────────────────────────────────────────

describe("reconcileStandalone — backoff", () => {
  it("noops when reconcile_backoff_until is in the future", () => {
    const s = snapshot(
      {},
      {
        state: WorkflowRunState.RUNNING,
        reconcileBackoffUntil: new Date(NOW.getTime() + 60_000),
      },
    );
    const action = reconcileStandalone(s);
    expect(action.kind).toBe("noop");
    expect(action.reason).toBe("reconcile_backoff_active");
  });

  it("proceeds when backoff has expired", () => {
    const s = snapshot(
      {},
      {
        state: WorkflowRunState.QUEUED,
        reconcileBackoffUntil: new Date(NOW.getTime() - 1000),
      },
    );
    const action = reconcileStandalone(s);
    expect(action.kind).toBe("enqueueAgent");
  });
});

// ── World-read failures ─────────────────────────────────────────────────────

describe("reconcileStandalone — world-read failures", () => {
  it("defers with backoff when snapshot has read errors", () => {
    const s = snapshot(
      {},
      { state: WorkflowRunState.RUNNING },
      { readErrors: [{ source: "pod", message: "k8s timeout" }] },
    );
    const action = reconcileStandalone(s);
    expect(action.kind).toBe("deferWithBackoff");
    if (action.kind === "deferWithBackoff") {
      expect(action.untilMs).toBeGreaterThan(NOW.getTime());
      expect(action.reason).toBe("world_read_failed:pod");
    }
  });
});

// ── Intent ──────────────────────────────────────────────────────────────────

describe("reconcileStandalone — control intent", () => {
  it("cancel from QUEUED transitions to FAILED", () => {
    const s = snapshot({}, { state: WorkflowRunState.QUEUED, controlIntent: "cancel" });
    const action = reconcileStandalone(s);
    expect(action.kind).toBe("transition");
    if (action.kind === "transition") {
      expect(action.to).toBe(WorkflowRunState.FAILED);
      expect(action.clearControlIntent).toBe(true);
      expect(action.statusPatch?.errorMessage).toBe("Cancelled by user");
    }
  });

  it("cancel from RUNNING transitions to FAILED", () => {
    const s = snapshot({}, { state: WorkflowRunState.RUNNING, controlIntent: "cancel" });
    const action = reconcileStandalone(s);
    expect(action.kind).toBe("transition");
    if (action.kind === "transition") {
      expect(action.to).toBe(WorkflowRunState.FAILED);
    }
  });

  it("cancel on terminal COMPLETED clears intent without transitioning", () => {
    const s = snapshot({}, { state: WorkflowRunState.COMPLETED, controlIntent: "cancel" });
    const action = reconcileStandalone(s);
    expect(action.kind).toBe("clearControlIntent");
  });

  it("retry from FAILED with retries remaining → QUEUED", () => {
    const s = snapshot(
      { maxRetries: 3 },
      {
        state: WorkflowRunState.FAILED,
        controlIntent: "retry",
        retryCount: 1,
        errorMessage: "transient error",
      },
    );
    const action = reconcileStandalone(s);
    expect(action.kind).toBe("transition");
    if (action.kind === "transition") {
      expect(action.to).toBe(WorkflowRunState.QUEUED);
      expect(action.statusPatch?.errorMessage).toBeNull();
      expect(action.statusPatch?.retryCount).toBe(2);
      expect(action.clearControlIntent).toBe(true);
    }
  });

  it("retry exhausted clears intent without transitioning", () => {
    const s = snapshot(
      { maxRetries: 3 },
      {
        state: WorkflowRunState.FAILED,
        controlIntent: "retry",
        retryCount: 3,
      },
    );
    const action = reconcileStandalone(s);
    expect(action.kind).toBe("clearControlIntent");
    expect(action.reason).toBe("intent_retry_exhausted");
  });

  it("retry from non-FAILED state clears intent (invalid)", () => {
    const s = snapshot({}, { state: WorkflowRunState.RUNNING, controlIntent: "retry" });
    const action = reconcileStandalone(s);
    expect(action.kind).toBe("clearControlIntent");
  });

  it("resume/restart on standalone clears intent (unsupported)", () => {
    const resumeS = snapshot({}, { state: WorkflowRunState.RUNNING, controlIntent: "resume" });
    const restartS = snapshot({}, { state: WorkflowRunState.FAILED, controlIntent: "restart" });
    expect(reconcileStandalone(resumeS).kind).toBe("clearControlIntent");
    expect(reconcileStandalone(restartS).kind).toBe("clearControlIntent");
  });
});

// ── QUEUED ──────────────────────────────────────────────────────────────────

describe("reconcileStandalone — QUEUED", () => {
  it("enqueues agent when capacity is available", () => {
    const action = reconcileStandalone(snapshot({}, {}));
    expect(action.kind).toBe("enqueueAgent");
  });

  it("fails when workflow is disabled", () => {
    const s = snapshot({ workflowEnabled: false }, {});
    const action = reconcileStandalone(s);
    expect(action.kind).toBe("transition");
    if (action.kind === "transition") {
      expect(action.to).toBe(WorkflowRunState.FAILED);
      expect(action.statusPatch?.errorMessage).toBe("Workflow is disabled");
    }
  });

  it("requeues when global capacity is saturated", () => {
    const s = snapshot({}, {}, { capacity: { global: { running: 5, max: 5 } } });
    const action = reconcileStandalone(s);
    expect(action.kind).toBe("requeueSoon");
    if (action.kind === "requeueSoon") {
      expect(action.delayMs).toBeGreaterThanOrEqual(10_000);
      expect(action.reason).toContain("global_capacity_saturated");
    }
  });

  it("requeues when per-workflow capacity is saturated", () => {
    const s = snapshot(
      {},
      {},
      {
        capacity: {
          global: { running: 1, max: 5 },
          repo: { running: 2, max: 2 },
        },
      },
    );
    const action = reconcileStandalone(s);
    expect(action.kind).toBe("requeueSoon");
    if (action.kind === "requeueSoon") {
      expect(action.reason).toContain("workflow_capacity_saturated");
    }
  });
});

// ── RUNNING ─────────────────────────────────────────────────────────────────

describe("reconcileStandalone — RUNNING", () => {
  it("noops when agent is healthy", () => {
    const s = snapshot(
      {},
      {
        state: WorkflowRunState.RUNNING,
        startedAt: new Date(NOW.getTime() - 30_000),
      },
      {
        pod: { podName: "p1", phase: "running", lastError: null },
        heartbeat: {
          lastActivityAt: new Date(NOW.getTime() - 5000),
          isStale: false,
          silentForMs: 5000,
        },
      },
    );
    const action = reconcileStandalone(s);
    expect(action.kind).toBe("noop");
    expect(action.reason).toBe("running_healthy");
  });

  it("transitions to COMPLETED when finishedAt is set without error", () => {
    const s = snapshot(
      {},
      {
        state: WorkflowRunState.RUNNING,
        finishedAt: NOW,
        errorMessage: null,
      },
    );
    const action = reconcileStandalone(s);
    expect(action.kind).toBe("transition");
    if (action.kind === "transition") {
      expect(action.to).toBe(WorkflowRunState.COMPLETED);
    }
  });

  it("transitions to FAILED when finishedAt is set with error", () => {
    const s = snapshot(
      {},
      {
        state: WorkflowRunState.RUNNING,
        finishedAt: NOW,
        errorMessage: "agent crashed",
      },
    );
    const action = reconcileStandalone(s);
    expect(action.kind).toBe("transition");
    if (action.kind === "transition") {
      expect(action.to).toBe(WorkflowRunState.FAILED);
    }
  });

  it("transitions to FAILED when heartbeat is stale", () => {
    const s = snapshot(
      {},
      { state: WorkflowRunState.RUNNING },
      {
        heartbeat: {
          lastActivityAt: new Date(NOW.getTime() - 600_000),
          isStale: true,
          silentForMs: 600_000,
        },
      },
    );
    const action = reconcileStandalone(s);
    expect(action.kind).toBe("transition");
    if (action.kind === "transition") {
      expect(action.to).toBe(WorkflowRunState.FAILED);
      expect(action.trigger).toBe("stall_detected");
      expect(action.statusPatch?.errorMessage).toContain("stalled");
    }
  });

  it("transitions to FAILED when pod is terminated", () => {
    const s = snapshot(
      {},
      { state: WorkflowRunState.RUNNING },
      {
        pod: {
          podName: "p1",
          phase: "terminated",
          lastError: "OOMKilled",
        },
      },
    );
    const action = reconcileStandalone(s);
    expect(action.kind).toBe("transition");
    if (action.kind === "transition") {
      expect(action.to).toBe(WorkflowRunState.FAILED);
      expect(action.statusPatch?.errorMessage).toBe("OOMKilled");
    }
  });

  it("transitions to FAILED when pod is in error phase", () => {
    const s = snapshot(
      {},
      { state: WorkflowRunState.RUNNING },
      {
        pod: { podName: "p1", phase: "error", lastError: null },
      },
    );
    const action = reconcileStandalone(s);
    expect(action.kind).toBe("transition");
    if (action.kind === "transition") {
      expect(action.statusPatch?.errorMessage).toBe("Pod error");
    }
  });
});

// ── Terminal states ─────────────────────────────────────────────────────────

describe("reconcileStandalone — terminal states", () => {
  it("COMPLETED is a no-op", () => {
    const s = snapshot({}, { state: WorkflowRunState.COMPLETED });
    expect(reconcileStandalone(s).kind).toBe("noop");
  });

  it("FAILED without retry intent is a no-op", () => {
    const s = snapshot({}, { state: WorkflowRunState.FAILED });
    expect(reconcileStandalone(s).kind).toBe("noop");
  });
});
