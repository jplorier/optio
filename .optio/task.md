# Make auto-resume limit configurable (default 10)

Make auto-resume limit configurable (default 10)

## Problem

The auto-resume limit in the PR watcher is hardcoded to 3 (`MAX_AUTO_RESUMES` in `apps/api/src/workers/pr-watcher-worker.ts:329`). This is too low — tasks with persistent merge conflicts or CI failures hit the limit quickly and park in `needs_attention`, requiring manual intervention.

## Proposed Changes

1. **Increase default from 3 to 10**
2. **Add per-repo setting** `maxAutoResumes` on the `repos` table (nullable, falls back to default)
3. **Add env var** `OPTIO_MAX_AUTO_RESUMES` as the global default (falls back to 10)

Priority chain: per-repo `maxAutoResumes` → `OPTIO_MAX_AUTO_RESUMES` env var → hardcoded default of 10.

## Context

Observed on task `9b6d80f5` (PR #68) — the agent kept hitting the limit after 3 conflict-resume cycles, then got manually force-restarted repeatedly, creating a long loop. A higher limit would give the agent more chances to resolve transient issues without manual intervention.

## Files to change

- `apps/api/src/db/schema.ts` — add `maxAutoResumes` to `repos` table
- `apps/api/src/workers/pr-watcher-worker.ts` — read from repo setting / env var instead of hardcoded constant
- Generate and apply migration

---

_Optio Task ID: f2c87a47-c4ca-4703-a4d8-64311ca2d264_
