# InsForge SDK Cross-Domain Auth Analysis

> Date: 2026-03-06
> Project: TheMarketBrew (themarketbrew.com)
> SDK: @insforge/sdk + @insforge/nextjs
> Instance: 9wmhxyi4.us-east.insforge.app

## Updated Position (2026-03-07)

After another production debugging round, our position is more precise:

- A **thin app-domain auth proxy** is not inherently a hack. In SSR + httpOnly-cookie auth systems, it is a normal pattern.
- The real issue is not "having `/api/auth`". The issue is that the current InsForge integration leaves too much session bridging and refresh recovery to application code.
- We want to move to **SDK-first + thin proxy only**, not "large custom auth layer".

In other words:

- Acceptable: a small Next.js route layer that lives on `themarketbrew.com` and only handles cookie/session bridging that the browser cannot do cross-domain.
- Not acceptable: app code having to manually coordinate multiple fallback paths for `user`, `token`, refresh, localStorage hydration, redirect recovery, and forced logout behavior.

## Why We No Longer Treat the Proxy as the Core Problem

We initially framed the proxy as an abnormal workaround. After comparing with mainstream auth stacks, that framing is too simplistic.

For SSR-capable auth products, an app-domain auth layer is common when the browser cannot safely or reliably complete the full session lifecycle by itself:

- **Auth0 Next.js SDK** mounts auth routes on the application domain such as `/auth/login`, `/auth/callback`, `/auth/profile`, and `/auth/access-token`, instead of asking each app to wire raw browser auth flows directly against Auth0 APIs.
- **Supabase SSR for Next.js** explicitly documents that Server Components cannot write cookies, so a proxy/middleware layer is required to refresh expired auth tokens and write the refreshed cookies back to both server and browser state.
- **Clerk** treats multi-domain auth as a product-level domain model problem (`primary domain` + `satellite domains`), not as something "the browser SDK will just handle automatically" across arbitrary domains.

References:

- Auth0 Next.js Quickstart:
  - https://auth0.com/docs/quickstart/webapp/nextjs/interactive
- Supabase SSR Next.js:
  - https://supabase.com/docs/guides/auth/server-side/nextjs
  - https://supabase.com/docs/guides/with-nextjs
- Clerk satellite domains:
  - https://clerk.com/docs/advanced-usage/satellite-domains
  - https://clerk.com/docs/guides/dashboard/dns-domains/satellite-domains

So our ask is not "remove every proxy forever". Our ask is:

1. Let the SDK own the canonical session lifecycle.
2. If a proxy is required, make it an official, minimal, productized part of the SDK flow.
3. Do not force application teams to invent their own auth recovery stack.

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

## What We Believe the Correct Responsibility Split Should Be

### What the application is willing to own

We are willing to keep a **thin** `app-domain` auth route, for example `/api/auth`, if its responsibilities are limited to:

1. Receiving auth callbacks or sign-in bridge requests on `themarketbrew.com`
2. Writing first-party cookies for our app domain
3. Forwarding refresh requests server-to-server when the browser cannot send the refresh cookie cross-domain
4. Clearing app-domain cookies on sign-out

### What the SDK should own

We believe the SDK should own:

1. A single canonical session model for `user`, `accessToken`, and refresh state
2. Hydration from server state to browser state without requiring app code to write localStorage patches
3. Official refresh bridging for cross-domain deployments
4. Consistent callbacks/hooks for sign-in, refresh, sign-out, and auth failure
5. A documented deployment story for:
   - same-origin auth
   - cross-domain auth
   - custom domain auth
   - SSR + App Router + Server Components

## Recommended Target Architecture for TheMarketBrew

Our preferred architecture is now:

```text
Browser UI
  -> InsForge SDK / BrowserProvider
  -> single client auth state

App-domain auth route (/api/auth on themarketbrew.com)
  -> only bridges browser-unfriendly steps
  -> writes/clears first-party cookies
  -> proxies refresh when needed

InsForge Auth API
  -> source of truth for identity
  -> validates tokens
  -> issues session artifacts
```

### Design principles

1. **SDK-first**
   - UI should read one canonical auth state from the SDK/provider layer.

2. **Thin proxy only**
   - The proxy should be transport glue, not custom business logic.

3. **Single source of truth**
   - "Logged in" must mean both:
     - UI has a valid user
     - protected API calls have a valid access token

4. **No dual recovery stacks**
   - The app should not need separate manual recovery paths for:
     - `sdk.user`
     - localStorage token
     - custom cached token
     - forced refresh polling

## What Is Currently Going Wrong in Our App

This is important context for InsForge because it shows how SDK gaps turn into application-level bugs.

Today, our app has drifted into a split-brain auth model:

- UI login success can be driven by `sdk.setUser(...)`
- protected API success depends on whether `getAccessToken()` can recover a valid token
- SSR page refresh uses `auth()` + `initialState`
- browser token restoration still needs custom `localStorage` injection

That means "user exists" and "session is usable" are not guaranteed to be the same moment.

This is how we end up with production behaviors like:

- homepage says login succeeded
- redirect page says login failed
- protected page renders as authenticated
- protected API immediately returns 401

The app can and should be simplified, but the simplification requires a more official SDK contract for cross-domain session bridging.

## Questions for InsForge Team

1. **What is the officially supported cross-domain auth topology for production apps?**
   - Frontend on `themarketbrew.com`
   - InsForge instance on `*.insforge.app`
   - SSR + App Router + Server Components

2. **Does InsForge set `SameSite=None; Secure` on the `insforge_refresh_token` cookie?**
   - If not, browser-initiated cross-domain refresh via `credentials: "include"` will not work.

3. **If cross-domain browser refresh is not the intended path, what is the official proxy pattern?**
   - Should `createAuthRouteHandlers` own refresh bridging?
   - Should there be a first-party helper for sign-in + refresh + sign-out cookie sync?

4. **Can the SDK expose a supported `hydrateSession()` or equivalent?**
   - Today, `auth()` on the server can return `{ userId, user, token }`, but the browser provider does not appear to hydrate the token manager from that same state.

5. **Does InsForge support custom domains / CNAME for auth endpoints?**
   - If we could serve auth on `auth.themarketbrew.com` or `api.themarketbrew.com`, same-site behavior may eliminate most of this complexity.

6. **Can InsForge document a responsibility split similar to Auth0/Supabase?**
   - What the SDK owns
   - What middleware/route handlers own
   - What the application should never need to patch manually

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

## Our Current Ask to InsForge

We do not need InsForge to promise "zero proxy".

We need InsForge to provide one of these two supported paths:

### Option A: Official thin-proxy architecture

- `@insforge/nextjs` owns the app-domain auth route contract
- refresh bridging is built in
- server `auth()` state can fully hydrate browser auth state
- the SDK documents cross-domain production as a first-class setup

### Option B: Same-site/custom-domain architecture

- InsForge supports custom domains for auth endpoints
- refresh cookies become same-site to the application
- SDK browser refresh works natively without extra bridging

Either path is acceptable. What is difficult to maintain is the current middle state, where cross-domain deployments work only after each app implements its own recovery glue.
