# fix: Pod overview shows incorrect active agent count

fix: Pod overview shows incorrect active agent count

## Problem

The overview dashboard "Pods" section shows workspace pods with inflated active agent counts (e.g. 13 agents running) when there are actually 0 running tasks. This gives operators a false picture of cluster utilization.

## Likely Cause

The `activeTaskCount` field on `repo_pods` is incremented in `execTaskInRepoPod()` when a task starts, and decremented in `releaseRepoPodTask()` in the `finally` block. However, if the worker process is killed (server restart, crash) before the `finally` block runs, the count is never decremented. Over multiple restarts and retries, the count accumulates.

The startup reconciler resets task states but does not reset `activeTaskCount` on repo pods.

## Fix

Either:

1. **Reconcile on startup**: Reset `activeTaskCount` on all repo pods based on the actual number of tasks in `running` state for that repo
2. **Derive instead of track**: Replace the stored counter with a live query that counts tasks in `running`/`provisioning` state per repo pod

Option 2 is more robust since it can never drift, but may have performance implications if queried frequently.

## Acceptance Criteria

- [ ] Pod active agent count matches actual running tasks
- [ ] Count stays accurate across server restarts
- [ ] Overview dashboard reflects correct pod utilization

---

_Optio Task ID: b8ea6ea2-1948-4197-b90d-4b559c08423c_
