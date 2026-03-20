# CLAUDE.md

Context and conventions for AI assistants working on the Optio codebase.

## What is Optio?

Optio is a workflow orchestration system for AI coding agents. Think of it as "CI/CD where the build step is an AI agent." Users submit tasks (manually or from GitHub Issues), and Optio:

1. Spins up an isolated Kubernetes pod for the repository
2. Creates a git worktree for the task
3. Runs Claude Code or OpenAI Codex with a configurable prompt
4. Streams structured logs back to a web UI in real time
5. Tracks the lifecycle through to PR creation, CI monitoring, and merge

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────────┐
│   Web UI    │────→│  API Server  │────→│   K8s Pods          │
│  Next.js    │     │   Fastify    │     │                     │
│  :3000      │     │   :4000      │     │  ┌─ Repo Pod A ──┐  │
│             │←ws──│              │     │  │ clone + sleep  │  │
│             │     │ - BullMQ     │     │  │ ├─ worktree 1  │  │
│             │     │ - Drizzle    │     │  │ ├─ worktree 2  │  │
│             │     │ - WebSocket  │     │  │ └─ worktree N  │  │
└─────────────┘     └──────┬───────┘     └─────────────────────┘
                           │
                    ┌──────┴───────┐
                    │  Postgres    │  State, logs, secrets
                    │  Redis       │  Job queue, pub/sub
                    └──────────────┘
```

### Pod-per-repo with worktrees

This is the central optimization. Instead of one pod per task (slow, wasteful), we run one long-lived pod per repository:

- The pod clones the repo once on creation, then runs `sleep infinity`
- When a task arrives, we `exec` into the pod: `git worktree add` → run agent → cleanup worktree
- Multiple tasks can run concurrently in the same pod (one per worktree)
- Pods idle for 10 minutes (configurable) before being cleaned up
- On the next task for that repo, a new pod is created automatically

The entrypoint scripts are in `scripts/`:
- `repo-init.sh` — pod entrypoint: clone repo, run `.optio/setup.sh` if present, sleep forever
- `agent-entrypoint.sh` — legacy per-task entrypoint (kept for compatibility)

### Task lifecycle (state machine)

```
pending → queued → provisioning → running → pr_opened → completed
                                    ↓  ↑        ↓  ↑
                               needs_attention   needs_attention
                                    ↓                ↓
                                 cancelled         cancelled
                               running → failed → queued (retry)
```

The state machine is in `packages/shared/src/utils/state-machine.ts`. All transitions are validated — invalid transitions throw `InvalidTransitionError`. The retry path is `failed → queued` (or `cancelled → queued`), which resets error fields.

### How a task runs (detailed flow)

1. User creates task via UI or ticket sync
2. `POST /api/tasks` → inserts row, transitions `pending → queued`, adds BullMQ job
3. Task worker picks up job:
   - Reads `CLAUDE_AUTH_MODE` secret to determine auth method
   - Loads prompt template for the repo (repo override → global default → hardcoded)
   - Renders prompt with `{{TASK_FILE}}`, `{{BRANCH_NAME}}`, etc.
   - Renders task file (markdown with title + description)
   - Calls `adapter.buildContainerConfig()` which produces env vars + setup files
   - Calls `repoPool.getOrCreateRepoPod()` — finds existing pod or creates one
   - Calls `repoPool.execTaskInRepoPod()` which execs a bash script:
     - `git fetch origin && git worktree add /workspace/tasks/{taskId}`
     - Decodes `OPTIO_SETUP_FILES` (base64 JSON) → writes `.optio/task.md` + auth helpers
     - Runs `claude -p "..." --dangerously-skip-permissions --output-format stream-json --verbose --max-turns 50`
     - Cleanup: `git worktree remove`
4. Worker streams exec session stdout, parsing each NDJSON line via `agent-event-parser.ts`
5. Session ID is captured from the first event and stored on the task
6. PR URLs are detected in log output and stored
7. On completion: `running → pr_opened` or `running → completed` or `running → failed`
8. The repo pod stays alive for the next task

### Authentication (Claude Code)

Two modes, selected during setup:

**API Key mode**: `ANTHROPIC_API_KEY` is injected as an env var into the container. Simple.

**Max Subscription mode**: The Optio API server reads the host machine's Claude OAuth credentials from the macOS Keychain (`Claude Code-credentials` service) or `~/.claude/.credentials.json` on Linux. It serves the token via `GET /api/auth/claude-token`. Inside the container, a `claude-key-helper.sh` script curls this endpoint, and Claude Code's `apiKeyHelper` setting points to that script.

The auth service is at `apps/api/src/services/auth-service.ts`. Tokens are cached for 30 seconds and auto-refresh.

### Prompt templates

System prompts use a simple template language:
- `{{VARIABLE}}` — replaced with the variable value
- `{{#if VAR}}...{{else}}...{{/if}}` — conditional blocks (truthy if non-empty, not "false", not "0")

The template is rendered in the task worker before being passed to the agent adapter. The task description is written as a separate file (`.optio/task.md`) in the worktree, and the prompt tells the agent to read it.

Priority: repo-level override (`repos.promptTemplateOverride`) → global default (`prompt_templates` table) → hardcoded fallback in `packages/shared/src/prompt-template.ts`.

### Structured log parsing

Claude Code's `--output-format stream-json` produces NDJSON. Each line is parsed by `agent-event-parser.ts` into typed `AgentLogEntry` objects with types: `text`, `tool_use`, `tool_result`, `thinking`, `system`, `error`, `info`. The session ID is extracted from the first event. These are stored in `task_logs` with `log_type` and `metadata` columns.

### Error classification

When tasks fail, the error message is pattern-matched by `packages/shared/src/error-classifier.ts` into categories (image, auth, network, timeout, agent, state, resource) with human-readable titles, descriptions, and suggested remedies. This powers both the task detail error panel and the task card previews.

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Monorepo | Turborepo + pnpm | 6 packages, workspace protocol |
| API | Fastify 5 | Plugins, schema validation, WebSocket |
| ORM | Drizzle | PostgreSQL, generated migrations in `apps/api/src/db/migrations/` |
| Queue | BullMQ + Redis | Also used for pub/sub (log streaming to WebSocket clients) |
| Web | Next.js 15 App Router | Tailwind CSS v4, Zustand, Lucide icons, sonner toasts |
| K8s client | @kubernetes/client-node | Pod lifecycle, exec, log streaming, metrics |
| Validation | Zod | API request schemas |
| Testing | Vitest | State machine tests in `packages/shared` |
| CI | GitHub Actions | Typecheck, test, build-web, build-image |
| Deploy | Helm | Chart at `helm/optio/` |

## Directory Layout

```
apps/
  api/
    src/
      routes/         health, tasks, secrets, repos, tickets, setup, auth, cluster, resume, prompt-templates
      services/       task-service, repo-pool-service, secret-service, auth-service, container-service,
                      prompt-template-service, repo-service, ticket-sync-service, event-bus, agent-event-parser
      workers/        task-worker (main job processor), ticket-sync-worker, repo-cleanup-worker
      ws/             log-stream (per-task), events (global)
      db/             schema.ts (Drizzle), client.ts, migrations/
    drizzle.config.ts
  web/
    src/
      app/            Pages: / (overview), /tasks, /tasks/new, /tasks/[id], /repos, /repos/[id],
                      /cluster, /cluster/[id], /secrets, /settings, /setup
      components/     task-card, task-list, log-viewer, web-terminal, event-timeline, state-badge,
                      layout/ (sidebar, layout-shell, setup-check, ws-provider)
      hooks/          use-store (Zustand), use-websocket, use-task, use-logs
      lib/            api-client, ws-client, utils

packages/
  shared/             Types (task, agent, container, secret, ticket, events, image, agent-events),
                      state machine, prompt template renderer, error classifier, constants
  container-runtime/  ContainerRuntime interface, DockerContainerRuntime, KubernetesContainerRuntime
  agent-adapters/     AgentAdapter interface, ClaudeCodeAdapter, CodexAdapter
  ticket-providers/   TicketProvider interface, GitHubTicketProvider, Linear/Notion stubs

images/               Dockerfiles: base, node, python, go, rust, full + build.sh
helm/optio/           Helm chart: api, web, postgres, redis, ingress, rbac, secrets
k8s/                  Local dev manifests: namespace.yaml, infrastructure.yaml
scripts/              repo-init.sh, agent-entrypoint.sh, setup-local.sh
```

## Database Schema

7 tables (Drizzle, 5 migrations):

- **tasks** — id, title, prompt, repoUrl, repoBranch, state (enum), agentType, containerId, sessionId, prUrl, resultSummary, errorMessage, ticketSource, ticketExternalId, metadata (jsonb), retryCount, timestamps
- **task_events** — id, taskId (FK), fromState, toState, trigger, message, createdAt (audit trail)
- **task_logs** — id, taskId (FK), stream, content, logType, metadata (jsonb), timestamp
- **secrets** — id, name, scope, encryptedValue (bytea), iv, authTag (AES-256-GCM)
- **repos** — id, repoUrl (unique), fullName, defaultBranch, isPrivate, imagePreset, extraPackages, autoMerge, promptTemplateOverride
- **repo_pods** — id, repoUrl (unique), repoBranch, podName, podId, state (enum), activeTaskCount, lastTaskAt
- **ticket_providers** — id, source, config (jsonb), enabled
- **prompt_templates** — id, name, template, isDefault, repoUrl, autoMerge

## Helm Chart

At `helm/optio/`. Deploys the full stack to any K8s cluster.

Key `values.yaml` settings:
- `postgresql.enabled` / `redis.enabled` — set to `false` and use `externalDatabase.url` / `externalRedis.url` for managed services
- `encryption.key` — **required**, generate with `openssl rand -hex 32`
- `agent.imagePullPolicy` — `Never` for local dev, `IfNotPresent` or `Always` for registries
- `ingress.enabled` — set to `true` with hosts for production

The chart creates: namespace, ServiceAccount + RBAC (pod/exec/secret management), API deployment + service (with health probes), web deployment + service, conditional Postgres + Redis, configurable Ingress.

```bash
# Local dev
helm install optio helm/optio --set encryption.key=$(openssl rand -hex 32)

# Production with managed services
helm install optio helm/optio \
  --set postgresql.enabled=false \
  --set externalDatabase.url="postgres://..." \
  --set redis.enabled=false \
  --set externalRedis.url="redis://..." \
  --set encryption.key=... \
  --set ingress.enabled=true \
  --set ingress.hosts[0].host=optio.example.com
```

## Commands

```bash
# Development
pnpm install                          # Install all deps
./scripts/setup-local.sh              # Bootstrap K8s infra + DB + .env
pnpm dev                              # Start API (:4000) + Web (:3000)
docker build -t optio-agent:latest -f Dockerfile.agent .  # Build agent image

# Quality
pnpm turbo typecheck                  # Typecheck all 6 packages
pnpm turbo test                       # Run tests (vitest)
cd apps/web && npx next build         # Verify production build

# Database
cd apps/api && npx drizzle-kit generate  # Generate migration after schema change
cd apps/api && npx drizzle-kit migrate   # Apply migrations

# Images
./images/build.sh                     # Build all image presets (base, node, python, go, rust, full)

# Helm
helm lint helm/optio --set encryption.key=test
helm install optio helm/optio --set encryption.key=$(openssl rand -hex 32)
helm upgrade optio helm/optio

# Teardown
pkill -f 'kubectl port-forward.*optio'
kubectl delete namespace optio
```

## Conventions

- **ESM everywhere**: all packages use `"type": "module"` with `.js` extensions in imports (TypeScript resolves them to `.ts`)
- **Tailwind CSS v4**: `@import "tailwindcss"` + `@theme` block in CSS, no `tailwind.config` file
- **Drizzle ORM**: schema in `apps/api/src/db/schema.ts`, run `drizzle-kit generate` after changes
- **Zod**: API request validation in route handlers
- **Zustand**: use `useStore.getState()` in callbacks/effects, not hook selectors (avoids infinite re-renders)
- **WebSocket events**: published to Redis pub/sub channels, relayed to browser clients
- **Next.js webpack config**: `extensionAlias` in `next.config.ts` resolves `.js` → `.ts` for workspace packages
- **Error handling**: use the error classifier for user-facing error messages, raw errors in logs
- **State transitions**: always go through `taskService.transitionTask()` which validates, updates DB, records event, and publishes to WebSocket
- **Secrets**: never log or return secret values, only names/scopes. Encrypted at rest with AES-256-GCM.

## Known Issues / TODO

- Agent image must be built locally (`docker build`) — K8s can't pull it from a registry yet. Set `OPTIO_IMAGE_PULL_POLICY=Never`.
- Docker Desktop K8s needs `metrics-server` installed manually for resource usage display: `kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml` then patch with `--kubelet-insecure-tls`.
- The `pnpm dev` script should be set up to run both API and web via turborepo but currently requires starting them separately.
- No auth on the web UI or API — all endpoints are open. Production needs JWT/OAuth.
- Linear and Notion ticket providers are stubs.
