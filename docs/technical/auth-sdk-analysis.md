# InsForge SDK Cross-Domain Auth Analysis

> Date: 2026-03-06
> Project: TheMarketBrew (themarketbrew.com)
> SDK: @insforge/sdk + @insforge/nextjs
> Instance: 9wmhxyi4.us-east.insforge.app

## The Problem

Our Next.js app (Vercel, `themarketbrew.com`) uses InsForge for auth. After login, the SDK's **built-in token refresh fails** across all browsers, returning:

```
401: "No refresh token provided"
```

This forces us to maintain a custom Server Proxy refresh workaround, which adds significant complexity and has caused multiple production incidents.

## Root Cause

### How Login Works (OK)

```
Browser -> SDK signInWithPassword() -> POST insforge.app/api/auth/sessions
  Response body: { accessToken, user, csrfToken }
  Response header: Set-Cookie: insforge_refresh_token=xxx (on insforge.app domain)
```

Login itself works fine. The SDK stores the access token in memory (Memory Mode, triggered by `csrfToken` in the response) and calls `syncToCookie()` to save it to our domain's cookies for SSR.

### How Refresh Fails

When the access token expires, SDK's `getCurrentSession()` tries to refresh:

```
Browser -> POST insforge.app/api/auth/refresh
  credentials: "include"
  X-CSRF-Token: (from document.cookie)
```

**The browser does NOT send the `insforge_refresh_token` cookie** with this request.

Why: The refresh cookie was set on `insforge.app` during login. When our frontend (`themarketbrew.com`) makes a cross-origin POST to `insforge.app`, the browser's default `SameSite=Lax` policy blocks the cookie from being sent. This happens in Chrome, Safari, and Firefox.

For cross-site cookie sending to work, the `Set-Cookie` header from InsForge would need `SameSite=None; Secure`. We have no control over this server-side setting.

### Verified by Direct Test

We tested in Chrome by manually calling the SDK's refresh endpoint from the browser console:

```javascript
fetch('https://9wmhxyi4.us-east.insforge.app/api/auth/refresh', {
  method: 'POST',
  headers: { 'X-CSRF-Token': csrfToken },
  credentials: 'include'
})
// Result: 401 "No refresh token provided"
```

The cookie is simply not sent.

## Impact

Because SDK refresh doesn't work cross-domain, we had to build 5 layers of workarounds:

| Workaround | Purpose | File |
|-----------|---------|------|
| `seedClientAuthFromServer()` | SSR -> client token transfer via localStorage (since SDK Memory Mode has no persistence after page refresh) | `auth-storage.ts` |
| Custom `refresh` action in route handler | Server Proxy: our Next.js server reads our own domain's httpOnly cookie and forwards to InsForge's refresh API | `app/api/auth/route.ts` |
| `isTokenExpired()` manual check | SDK's `getCurrentSession()` returns expired tokens without checking `exp` | `auth.ts` |
| 5s timeout on `getCurrentSession()` | Safety net in case SDK refresh hangs | `auth.ts` |
| `resetStaleAuthState()` | Force cleanup when auth state becomes corrupted | `auth.ts` |

This complexity has caused production bugs including: login state loss on page refresh, race conditions between SDK refresh and our proxy refresh, "ghost login" states where UI shows logged-in but all API calls return 401, and auth cookie naming mismatches.

## Questions for InsForge Team

1. **Does InsForge set `SameSite=None; Secure` on the `insforge_refresh_token` cookie?** If not, cross-domain refresh via `credentials: "include"` will never work due to browser SameSite policy.

2. **Is there a recommended pattern for cross-domain token refresh?** Our frontend (`themarketbrew.com`) and InsForge instance (`*.insforge.app`) are on different domains, which is the default deployment topology for any InsForge customer using Vercel/Netlify/etc.

3. **Does InsForge support custom domains / CNAME?** If we could point `api.themarketbrew.com` to our InsForge instance, the refresh cookie would be on our domain and everything would work natively.

4. **Is `@insforge/nextjs`'s `createAuthRouteHandlers` intended to handle refresh?** Currently it only handles `sign-in`, `sign-up`, and `sync-token` actions. Should it also proxy refresh requests?

## SDK Internals Reference

### TokenManager Dual Mode

- **Memory Mode**: activated when API response contains `csrfToken`. Token in memory only, localStorage cleared. Cookie is the persistence layer.
- **Storage Mode**: default / fallback when refresh returns 404. Token in localStorage.

`saveSessionFromResponse()` switches to Memory Mode when it sees `csrfToken`, which clears localStorage. This conflicts with any code that writes tokens to localStorage (like our `seedClientAuthFromServer`).

### Key SDK Code Paths

`getCurrentSession()` (sdk/dist/index.js:620):
```
1. Check tokenManager memory/localStorage -> return if found
2. If empty, POST baseUrl/api/auth/refresh (credentials: "include")
3. If refresh 404 -> fallback to Storage Mode
4. If refresh fails -> return null
```

`InsforgeBrowserProvider` callbacks:
- `onSignIn(token, user)` -> `syncToCookie()` -> POST `/api/auth { action: "sync-token" }`
- `onRefresh(token, user)` -> `syncToCookie()` (never triggers because refresh never succeeds)
- `onSignOut()` -> DELETE `/api/auth`

### InsForge Auth API

- Login: `POST /api/auth/sessions` -> `{ accessToken, user, csrfToken }` + `Set-Cookie: insforge_refresh_token`
- Refresh: `POST /api/auth/refresh` + Cookie `insforge_refresh_token` + Header `X-CSRF-Token`
- Validate: `GET /api/auth/sessions/current` + `Authorization: Bearer <token>`
