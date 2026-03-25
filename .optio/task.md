# fix: Auth security hardening before production

fix: Auth security hardening before production

## Summary

The OAuth auth system (#29) is functionally complete but has several security gaps that need addressing before production use.

## Issues

### Critical: CORS accepts any origin

- **File**: `apps/api/src/server.ts`
- CORS is configured with `origin: true`, allowing requests from any origin
- **Fix**: Whitelist specific origins via `OPTIO_ALLOWED_ORIGINS` env var (e.g. `http://localhost:3100,https://optio.example.com`)

### High: No `Secure` flag on session cookie

- **File**: `apps/api/src/routes/auth.ts`
- Session cookies are set with `HttpOnly` and `SameSite=Lax` but no `Secure` flag
- In production over HTTPS, cookies could be transmitted over unencrypted connections
- **Fix**: Conditionally add `Secure` when `NODE_ENV=production` or behind a config flag

### High: No expired session cleanup

- Sessions accumulate in the DB indefinitely — `validateSession()` checks expiry but never deletes old rows
- **Fix**: Add periodic cleanup (e.g. in `repo-cleanup-worker`) to delete sessions where `expires_at < now()`

### High: OAuth providers don't check response status

- **Files**: `apps/api/src/services/oauth/github.ts`, `google.ts`, `gitlab.ts`
- `exchangeCode` and `fetchUser` call `.json()` without checking `res.ok` first
- Non-2xx responses (rate limits, server errors) will throw confusing parse errors
- **Fix**: Add `if (!res.ok) throw new Error(...)` before parsing

### Medium: Unbounded in-memory OAuth state map

- **File**: `apps/api/src/routes/auth.ts`
- The `oauthStates` Map has a 10-minute TTL cleanup but no size limit
- An attacker could flood login requests to grow the map unboundedly
- **Fix**: Use a size-limited LRU cache or move state to Redis

### Medium: Error messages in redirect URLs

- **File**: `apps/api/src/routes/auth.ts`
- Raw error strings (including potential stack traces) are URL-encoded in redirect query params
- Visible in browser history and server logs
- **Fix**: Use generic error codes in redirects, fetch details via API if needed

## Acceptance Criteria

- [ ] CORS restricted to configured origins
- [ ] Session cookie has `Secure` flag in production
- [ ] Expired sessions are cleaned up periodically
- [ ] OAuth HTTP responses validated before parsing
- [ ] OAuth state map bounded or moved to Redis
- [ ] Error messages not leaked in URLs

---

_Optio Task ID: b5043ba0-5447-434b-aa87-e3baf712629d_
