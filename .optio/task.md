# feat: Add authentication with multi-provider OAuth support

feat: Add authentication with multi-provider OAuth support

## Summary

Optio currently has no authentication on the web UI or API — all endpoints are open to anyone with network access. We need a proper auth layer that supports multiple OAuth providers, is admin-configurable, and can be disabled for local development.

## Motivation

- **Security**: Anyone with network access can submit tasks, view logs, cancel jobs, and read secrets
- **Audit trail**: No way to know who submitted a task or performed an action
- **Production readiness**: Auth is a prerequisite for any non-localhost deployment

## Design

### Multi-Provider OAuth

Support GitHub, Google, and GitLab as OAuth providers. All three use standard OAuth2 flows and share a common interface:

```ts
interface OAuthProvider {
  name: string;
  authorizeUrl(state: string): string;
  exchangeCode(code: string): Promise<{ accessToken: string; refreshToken?: string }>;
  fetchUser(
    accessToken: string,
  ): Promise<{ externalId: string; email: string; displayName: string; avatarUrl?: string }>;
}
```

Auth flow:

1. User clicks "Sign in with {Provider}" on `/login`
2. Redirected to `/api/auth/:provider/login` → provider's OAuth consent screen
3. Provider redirects back to `/api/auth/:provider/callback`
4. API exchanges code for token, fetches user profile, creates/updates user record, creates session
5. Session cookie set, user redirected to `/`

### Admin Configuration

Provider credentials are stored as env vars or in the existing secrets system:

```
GITHUB_OAUTH_CLIENT_ID / GITHUB_OAUTH_CLIENT_SECRET
GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET
GITLAB_OAUTH_CLIENT_ID / GITLAB_OAUTH_CLIENT_SECRET
```

A new "Authentication" section on the `/settings` page allows admins to:

- See which providers are available (auto-detected from configured client IDs)
- Toggle individual providers on/off
- Set an allowed email domain filter (e.g. `@yourcompany.com`)
- Set a GitHub org restriction (e.g. only members of `my-org` can log in)

### Disable Auth for Local Dev

A single env var disables all auth checks:

```
OPTIO_AUTH_DISABLED=true
```

- The Fastify auth `preHandler` hook short-circuits when this is set
- `setup-local.sh` sets this in `.env` by default
- The Helm chart defaults it to `false`
- The web UI shows a "Authentication is disabled" banner and a "Local Dev" placeholder avatar
- The Next.js middleware skips the login redirect

## Database Changes

Three schema changes (one new migration):

1. **`users` table** — id, provider, externalId, email, displayName, avatarUrl, lastLoginAt
2. **`sessions` table** — id, userId (FK), tokenHash, expiresAt (server-side sessions allow revocation)
3. **`tasks.createdBy`** — nullable FK to users (null when auth is disabled)

## Implementation Scope

### API (`apps/api`) ~8 files

- [ ] `services/oauth/provider.ts` — OAuthProvider interface
- [ ] `services/oauth/github.ts` — GitHub OAuth implementation
- [ ] `services/oauth/google.ts` — Google OAuth implementation
- [ ] `services/oauth/gitlab.ts` — GitLab OAuth implementation
- [ ] `services/session-service.ts` — create, validate, revoke sessions
- [ ] `routes/auth.ts` — extend with `/:provider/login`, `/:provider/callback`, `/me`, `/logout`
- [ ] `plugins/auth.ts` — Fastify `preHandler` hook (validate session cookie, skip if `OPTIO_AUTH_DISABLED`)
- [ ] DB migration for users, sessions tables, and tasks.createdBy column

### Web (`apps/web`) ~4 files

- [ ] `middleware.ts` — check session cookie, redirect to `/login` if missing (skip if auth disabled)
- [ ] `app/login/page.tsx` — login page with provider buttons (fetches enabled providers from API)
- [ ] `components/layout/user-menu.tsx` — avatar dropdown with user info + logout in sidebar
- [ ] Settings page — new "Authentication" section for provider management

### Config / Infra

- [ ] `setup-local.sh` — add `OPTIO_AUTH_DISABLED=true` to generated `.env`
- [ ] `.env.example` — add OAuth env vars and `OPTIO_AUTH_DISABLED`
- [ ] Helm `values.yaml` — add auth config section (OAuth secrets, `authDisabled: false`)

## Non-Goals (for now)

- **Roles/permissions** — all authenticated users are equal. RBAC can come later.
- **API keys for programmatic access** — can add `/api/auth/api-keys` CRUD in a follow-up.
- **SAML/OIDC enterprise SSO** — out of scope for v1, but the provider interface makes it easy to add.

## Acceptance Criteria

- [ ] At least one OAuth provider (GitHub) works end-to-end: login → session → protected routes → logout
- [ ] Google and GitLab providers implemented and tested
- [ ] Unauthenticated requests to protected API routes return 401
- [ ] Unauthenticated web access redirects to `/login`
- [ ] `OPTIO_AUTH_DISABLED=true` bypasses all auth (local dev works unchanged)
- [ ] Admin can see and toggle providers on the settings page
- [ ] Tasks show who created them (`createdBy`)
- [ ] Helm chart supports OAuth configuration

---

_Optio Task ID: 9ed465eb-5796-45c8-8104-df2be1d286e2_
