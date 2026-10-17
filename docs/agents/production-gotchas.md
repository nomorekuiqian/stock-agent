## Known Gotchas & Production Lessons

Critical lessons from production incidents. **Read these before making changes to related areas.**

### Auth & Security

- **`verify_user_token` is the standard pattern**: In `core/deps.py`, use `Depends(verify_user_token)` on endpoints. Frontend sends Bearer token via `_authHeaders()`. Token cached 60s in memory.
- **Insforge is NOT Supabase**: API paths differ. Login: `POST /api/auth/sessions`. Verify: `GET /api/auth/sessions/current`. Refresh: `POST /api/auth/refresh` with Cookie + X-CSRF-Token + Authorization Bearer anonKey. Check SDK source (`node_modules/@insforge/sdk/dist/index.js`) for actual paths.
- **Refresh tokens come in Set-Cookie header, not response body**: Login response body only has `{ accessToken, user, csrfToken }`. Cross-origin fetch can't read Set-Cookie, so server proxy is required.
- **SDK `reloadAuth()` doesn't work with server proxy login**: Use `sdk.setUser()` instead to directly inject user state.
- **Token expiry check is mandatory**: `getAccessToken()` must check JWT `exp` field. "Having a session object" != "having a valid token".
- **Auth state recovery race condition**: `isRecovering` state must initialize as `true`, so `isLoading` stays true until cookie recovery completes. Otherwise auth guard incorrectly redirects for one frame.
- **Page refresh token persistence**: On refresh, SDK memory is cleared. Tokens from server-side cookies are injected into localStorage in `Providers.tsx` before SDK init, so `tokenManager.loadFromStorage()` finds the session.

### Data Flow

- **Three-layer chain**: Edge Function (JS) -> db.py (Python) -> router.py -> Frontend. Changes to any layer require checking upstream/downstream. Common mistake: edge function returns new fields but db.py drops them.
- **Distinguish "empty result" from "query failure"**: `data === null` (network/token failure) != "user has no data". Treating failures as empty data causes data loss (e.g., watchlist overwritten with `[]`).

### Broadcasting & Notifications

- **Never use URL matching to determine environment**: Use explicit `ENVIRONMENT` env var. URL strings (`www.` vs no `www.`) silently break matching.
- **Agent exceptions must not produce "fake success"**: If AI agent fails, return `None` / raise, never stuff error messages into content fields. Broadcast pipelines need independent content quality gates.
- **External service calls need retry**: Transient network failures are normal. Without retry on `get_user_watchlist()`, 17/22 users missed their daily report. For retry-safe operations, the previously used baseline is 2 retries + 3s interval; respect API limits and avoid blindly retrying non-idempotent writes.
- **Re-sends need idempotency**: Before re-sending, check delivery records to confirm the user hasn't already received the email.

### General

- **`.env.local` is a single point of failure**: Gitignored, can't recover via `git checkout`. After worktree ops or file cleanup, verify `.env*` files exist.
- **Use `logger.exception` not `logger.error`**: Only `exception` captures full traceback.
- **Production domain**: Brand domain is `themarketbrew.com` (frontend Vercel). Backend Railway: `stock-agent-production.up.railway.app`. No other domains should appear in code.

### Insforge Auth API Reference

- Login: `POST /api/auth/sessions` -> `{ accessToken, user, csrfToken }`
- Verify user: `GET /api/auth/sessions/current` + `Authorization: Bearer <token>` -> `{ user: { id, email } }`
- Refresh: `POST /api/auth/refresh` + Cookie `insforge_refresh_token` + `X-CSRF-Token` + `Authorization: Bearer <anonKey>`
- Logout: `POST /api/auth/logout`
- Profiles: `GET /api/auth/profiles/{userId}`, `PUT /api/auth/profiles/current`
- All requests need `apikey` header (anon key)

