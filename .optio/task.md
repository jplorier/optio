# perf: Add database indexes for common query patterns

perf: Add database indexes for common query patterns

## Problem

No indexes exist on frequently queried columns. As task volume grows, queries will degrade to full table scans.

## Missing Indexes

- `tasks(repoUrl, state)` — filtering tasks by repo and state
- `tasks(state)` — state-based filtering on task list
- `tasks(parentTaskId)` — finding subtasks
- `tasks(createdAt DESC)` — sorting by creation time
- `taskLogs(taskId, timestamp)` — fetching logs for a task
- `repoPods(repoUrl)` — finding pods by repo
- `taskEvents(taskId)` — fetching event history

## Acceptance Criteria

- [ ] Migration adds indexes for the above columns
- [ ] No noticeable regression on write performance

---

_Optio Task ID: e0c05c2e-9c70-4ea1-82c7-06f3f931c7b5_
