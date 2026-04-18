import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { tasks, workflowRuns } from "../db/schema.js";
import type { Action, RepoAction, StandaloneAction, WorldSnapshot } from "@optio/shared";
import { TaskState, WorkflowRunState } from "@optio/shared";
import * as taskService from "./task-service.js";
import { logger } from "../logger.js";

/**
 * Outcome of executing a reconcile action.
 *
 * `applied` — the action ran to completion, state was mutated (if any).
 * `stale`   — the CAS guard found a newer updated_at; caller should re-enqueue.
 * `skipped` — action was a noop / clearControlIntent that produced no mutation.
 * `shadow`  — shadow mode, action was logged but not applied.
 * `error`   — something threw; caller should record + re-enqueue with backoff.
 */
export type ExecuteOutcome =
  | { status: "applied"; reason: string }
  | { status: "stale"; reason: string }
  | { status: "skipped"; reason: string }
  | { status: "shadow"; action: Action; reason: string }
  | { status: "error"; reason: string; error: unknown };

export interface ExecuteOptions {
  /** When true, log decisions but do not mutate DB or fire side effects. */
  shadow?: boolean;
}

/**
 * Apply a reconcile action. All DB mutations are CAS-gated on
 * updated_at == snapshot.run.status.updatedAt so a decision made from
 * a stale snapshot cannot overwrite a concurrent transition.
 *
 * For Phase A–B, this executor wraps taskService.transitionTask for state
 * transitions. That keeps the existing downstream fan-out (events, webhooks,
 * Slack, issue closure, dependency cascade) intact. Phase D will flip the
 * internal/external boundary.
 */
export async function executeAction(
  action: Action,
  snapshot: WorldSnapshot,
  opts: ExecuteOptions = {},
): Promise<ExecuteOutcome> {
  const shadow = opts.shadow === true;
  const log = logger.child({
    reconcile: true,
    kind: snapshot.run.kind,
    runId: snapshot.run.ref.id,
    actionKind: action.kind,
    shadow,
  });

  if (shadow) {
    log.info({ reason: action.reason }, "reconcile.shadow");
    return { status: "shadow", action, reason: action.reason };
  }

  try {
    switch (action.kind) {
      case "noop":
        return { status: "skipped", reason: action.reason };

      case "requeueSoon":
        // Caller (worker) handles re-enqueue with the returned delay.
        log.info({ delayMs: action.delayMs, reason: action.reason }, "reconcile.requeueSoon");
        return { status: "skipped", reason: action.reason };

      case "deferWithBackoff":
        return await applyDeferWithBackoff(action.untilMs, snapshot);

      case "clearControlIntent":
        return await applyClearControlIntent(snapshot);

      case "transition":
        return await applyTransition(action, snapshot);

      case "patchStatus":
        return await applyPatchStatus(action, snapshot);

      case "requeueForAgent":
      case "enqueueAgent":
      case "resumeAgent":
      case "launchReview":
      case "autoMergePr":
        // Phase A–B: we log these intended side effects but don't fire them.
        // The existing workers still drive the real work. Phase C flips.
        log.info(
          { reason: action.reason, actionKind: action.kind },
          "reconcile.sideEffectDeferred",
        );
        return { status: "skipped", reason: `phase_b_defer:${action.kind}` };

      default: {
        const _exhaustive: never = action;
        return {
          status: "error",
          reason: `unknown_action:${JSON.stringify(_exhaustive)}`,
          error: new Error("unknown action"),
        };
      }
    }
  } catch (err) {
    log.error({ err, reason: action.reason }, "reconcile.executeAction failed");
    return { status: "error", reason: action.reason, error: err };
  }
}

// ── Applicators ─────────────────────────────────────────────────────────────

async function applyTransition(
  action: RepoAction | StandaloneAction,
  snapshot: WorldSnapshot,
): Promise<ExecuteOutcome> {
  if (action.kind !== "transition") {
    return { status: "error", reason: "bad_action", error: new Error("not a transition") };
  }
  if (snapshot.run.kind === "repo") {
    return applyRepoTransition(action as Extract<RepoAction, { kind: "transition" }>, snapshot);
  }
  return applyStandaloneTransition(
    action as Extract<StandaloneAction, { kind: "transition" }>,
    snapshot,
  );
}

async function applyRepoTransition(
  action: Extract<RepoAction, { kind: "transition" }>,
  snapshot: WorldSnapshot,
): Promise<ExecuteOutcome> {
  const id = snapshot.run.ref.id;
  const version = snapshot.run.status.updatedAt;

  // Apply any supporting status fields first, CAS-gated on version. If the
  // CAS fails, we bail before issuing the transition so we don't emit events
  // based on stale decisions. Clear backoff + intent atomically.
  const patch: Record<string, unknown> = {
    ...(action.statusPatch ?? {}),
    reconcileBackoffUntil: null,
    reconcileAttempts: 0,
  };
  if (action.clearControlIntent) {
    patch.controlIntent = null;
  }
  const casResult = await casUpdate("tasks", id, version, patch);
  if (casResult === "stale") {
    return { status: "stale", reason: "cas_failed_pre_transition" };
  }

  // Delegate the state transition to the existing service so all downstream
  // fan-out (events, webhooks, Slack, issue close, dependency cascade) runs.
  try {
    await taskService.transitionTask(id, action.to, action.trigger, action.reason);
    return { status: "applied", reason: `transition:${action.to}` };
  } catch (err) {
    // StateRaceError means another worker won; treat as stale.
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("StateRace") || msg.includes("Invalid state transition")) {
      return { status: "stale", reason: msg };
    }
    return { status: "error", reason: msg, error: err };
  }
}

async function applyStandaloneTransition(
  action: Extract<StandaloneAction, { kind: "transition" }>,
  snapshot: WorldSnapshot,
): Promise<ExecuteOutcome> {
  const id = snapshot.run.ref.id;
  const version = snapshot.run.status.updatedAt;
  const currentState = snapshot.run.status.state;

  const patch: Record<string, unknown> = {
    state: action.to,
    updatedAt: new Date(),
    reconcileBackoffUntil: null,
    reconcileAttempts: 0,
    ...(action.statusPatch ?? {}),
  };
  if (action.clearControlIntent) {
    patch.controlIntent = null;
  }
  const rows = await db
    .update(workflowRuns)
    .set(patch)
    .where(
      and(
        eq(workflowRuns.id, id),
        eq(workflowRuns.updatedAt, version),
        eq(workflowRuns.state, currentState),
      ),
    )
    .returning();

  if (rows.length === 0) {
    return { status: "stale", reason: "cas_failed_standalone_transition" };
  }

  // For Phase A–B, we don't fire workflow run events or webhooks from here —
  // the existing workflow-worker still drives the real transitions. Once we
  // flip in Phase C, this is the place to call publishWorkflowRunEvent and
  // enqueueWebhookEvent.

  return { status: "applied", reason: `standalone_transition:${action.to}` };
}

async function applyPatchStatus(
  action: Extract<RepoAction, { kind: "patchStatus" }>,
  snapshot: WorldSnapshot,
): Promise<ExecuteOutcome> {
  if (snapshot.run.kind !== "repo") {
    return { status: "error", reason: "patchStatus_on_non_repo", error: new Error("not repo") };
  }
  const id = snapshot.run.ref.id;
  const version = snapshot.run.status.updatedAt;
  const casResult = await casUpdate(
    "tasks",
    id,
    version,
    action.statusPatch as Record<string, unknown>,
  );
  if (casResult === "stale") return { status: "stale", reason: "cas_failed_patch" };
  return { status: "applied", reason: action.reason };
}

async function applyClearControlIntent(snapshot: WorldSnapshot): Promise<ExecuteOutcome> {
  const id = snapshot.run.ref.id;
  const version = snapshot.run.status.updatedAt;
  const casResult = await casUpdate(
    snapshot.run.kind === "repo" ? "tasks" : "workflow_runs",
    id,
    version,
    { controlIntent: null },
  );
  if (casResult === "stale") return { status: "stale", reason: "cas_failed_clear_intent" };
  return { status: "applied", reason: "cleared_control_intent" };
}

async function applyDeferWithBackoff(
  untilMs: number,
  snapshot: WorldSnapshot,
): Promise<ExecuteOutcome> {
  const id = snapshot.run.ref.id;
  const version = snapshot.run.status.updatedAt;
  const casResult = await casUpdate(
    snapshot.run.kind === "repo" ? "tasks" : "workflow_runs",
    id,
    version,
    {
      reconcileBackoffUntil: new Date(untilMs),
      reconcileAttempts: snapshot.run.status.reconcileAttempts + 1,
    },
  );
  if (casResult === "stale") {
    return { status: "stale", reason: "cas_failed_defer_backoff" };
  }
  return { status: "applied", reason: "backoff_written" };
}

// ── CAS helpers ─────────────────────────────────────────────────────────────

async function casUpdate(
  table: "tasks" | "workflow_runs",
  id: string,
  version: Date,
  patch: Record<string, unknown>,
): Promise<"applied" | "stale"> {
  const payload = { ...patch, updatedAt: new Date() };
  if (table === "tasks") {
    const rows = await db
      .update(tasks)
      .set(payload)
      .where(and(eq(tasks.id, id), eq(tasks.updatedAt, version)))
      .returning({ id: tasks.id });
    return rows.length > 0 ? "applied" : "stale";
  }
  const rows = await db
    .update(workflowRuns)
    .set(payload)
    .where(and(eq(workflowRuns.id, id), eq(workflowRuns.updatedAt, version)))
    .returning({ id: workflowRuns.id });
  return rows.length > 0 ? "applied" : "stale";
}

// Re-export for convenience.
export { TaskState, WorkflowRunState };
