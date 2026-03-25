# feat: Interactive sessions — terminal + agent chat for repo pods

feat: Interactive sessions — terminal + agent chat for repo pods

## Summary

Add a first-class **Session** concept to Optio — persistent, interactive workspaces scoped to a repository pod. Sessions give users direct access to repo pods via a web terminal and (in phase 2) an interactive Claude Code chat, with full PR lifecycle tracking.

## Motivation

Currently Optio is fire-and-forget: submit a task, wait for a PR. Users have no way to interactively work within a repo pod — explore code, run commands, iterate with an agent, or manage multiple PRs in a single working session.

## Design

### Sessions as a first-class entity

- **Not a task** — sessions are tracked separately with their own data model, lifecycle, and UI
- **Own worktree**: each session creates a worktree off latest main on a branch named `session/<username>/<short-id>`
- **Persist until closed**: sessions stay active until the user explicitly ends them (no auto-timeout)
- **Don't count against task concurrency** (`maxConcurrentTasks`)
- **Cost tracking**: token spend tracked per session

### Phase 1: Terminal + PR tracking

- **Data model**: `sessions` table — id, repoUrl, userId, worktreePath, branch, state (active/ended), podId, costUsd, createdAt, endedAt
- **Session PRs**: `session_prs` table — tracks all PRs opened during a session with CI status, review status, merge state
- **xterm.js web terminal**: full terminal connected to pod exec, landing in repo root worktree
- **PR detection**: same approach as tasks — parse output for PR URLs
- **PR lifecycle badges**: CI status, review status, merged/closed — follows repo settings (review trigger, auto-merge)
- **UI notifications**: alert users when CI passes, PR merges, or review requests changes (no auto-fix, just notify)
- **Session list**: shown on overview page and repo detail page, separate from task list
- **Session detail page** (`/sessions/:id`): terminal + PR tracker + "End Session" button
- **End session warning**: popup warns that all un-pushed work will be lost
- **Active session count**: displayed per-repo and globally

### Phase 2: Agent chat + split pane

- **Long-running Claude Code process**: interactive `claude` session exec'd in the pod, stdin/stdout piped through WebSocket
- **Chat UI**: streaming responses rendered in a chat pane
- **Split pane layout**: agent chat (left) + terminal (right), resizable, either pane collapsible
- **Review triggers**: users can request review agent on any session PR
- **Cost tracking**: per-session token spend displayed in UI

### API routes (planned)

- `POST /api/sessions` — create a new session (provisions worktree)
- `GET /api/sessions` — list sessions (filterable by repo, state)
- `GET /api/sessions/:id` — session detail
- `POST /api/sessions/:id/end` — end session (cleanup worktree, warn about unpushed work)
- `GET /api/sessions/:id/prs` — list PRs tracked in this session
- `WS /ws/sessions/:id/terminal` — xterm.js WebSocket connection
- `WS /ws/sessions/:id/chat` — agent chat WebSocket connection (phase 2)

### UI entry points

- "New Session" button on repo detail page (next to repo pod)
- "New Session" button on overview page per workspace pod
- Sessions section on overview and repo detail pages (separate from tasks)

## Non-goals (for now)

- Control plane agent ("chat with Optio") — separate feature
- Multiple terminal tabs per session
- Auto-fix CI failures from sessions

---

_Optio Task ID: f51bb0bb-27e5-4dd8-8996-f7e06206950e_
