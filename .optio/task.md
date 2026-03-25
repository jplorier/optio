# fix: Page titles should reflect current page, not project name

fix: Page titles should reflect current page, not project name

## Problem

The browser tab/title bar shows the project name and description on every page (e.g. "Optio — AI Agent Orchestration") instead of the current page context. When multiple Optio tabs are open, they all look identical.

## Fix

Set dynamic page titles based on the current route:

- `/` → "Overview — Optio"
- `/tasks` → "Tasks — Optio"
- `/tasks/[id]` → "{task title} — Optio"
- `/repos` → "Repositories — Optio"
- `/repos/[id]` → "{repo name} — Optio"
- `/cluster` → "Cluster — Optio"
- `/costs` → "Costs — Optio"
- `/secrets` → "Secrets — Optio"
- `/settings` → "Settings — Optio"

Use Next.js `metadata` exports or `<title>` in each page for static titles, and `generateMetadata()` for dynamic ones (task detail, repo detail).

## Acceptance Criteria

- [ ] Each page has a unique, descriptive title
- [ ] Task and repo detail pages show the entity name in the title
- [ ] "Optio" appears as suffix for brand recognition

---

_Optio Task ID: 4bdee718-0e03-48d5-ad1e-909e5f6c3103_
