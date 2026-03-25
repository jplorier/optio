# feat: Scheduled and recurring tasks

feat: Scheduled and recurring tasks

## Problem

No way to run tasks on a schedule (nightly tests, weekly refactors, periodic dependency updates).

## Solution

### API

- `POST /api/schedules` — create schedule (name, cron expression, task template or inline config)
- `GET /api/schedules` — list schedules
- `PATCH /api/schedules/:id` — update (enable/disable, change cron)
- `DELETE /api/schedules/:id`
- `POST /api/schedules/:id/trigger` — manually trigger a scheduled run

### Implementation

- New BullMQ repeating job that checks schedules every minute
- On cron match, creates a task from the schedule's template
- Track last run time, next run time, run history

### Web UI

- Schedule management page (create, edit, enable/disable, view history)
- Cron expression builder with human-readable preview
- Schedule indicator on task cards ("triggered by: nightly-tests")

### Database

- New `schedules` table (id, name, cron, taskConfig JSON, enabled, lastRunAt, nextRunAt, createdAt)

## Acceptance Criteria

- [ ] CRUD for schedules with cron expressions
- [ ] Automatic task creation on schedule
- [ ] Manual trigger support
- [ ] Web UI for schedule management
- [ ] Run history tracking

---

_Optio Task ID: 54ddc6e6-2e2a-4361-80fe-6030ed625c23_
