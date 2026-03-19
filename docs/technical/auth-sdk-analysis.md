# InsForge SDK Cross-Domain Auth Analysis

> Date: 2026-03-06
> Project: TheMarketBrew (themarketbrew.com)
> SDK: @insforge/sdk + @insforge/nextjs
> Instance: 9wmhxyi4.us-east.insforge.app

## 1. Our Situation

Our production setup is:

- Frontend domain: `themarketbrew.com`
- InsForge instance: `*.insforge.app`
- Framework: Next.js App Router
- Rendering model: SSR + protected pages

Our goal is also simple:

- use InsForge SDK as the main auth system
- keep application auth logic as thin as possible
- if a proxy is required, keep it as a **thin app-domain auth proxy**
- avoid a large custom auth recovery layer in application code

In other words, we do **not** insist on "zero proxy".
What we want is:

- SDK-first
- thin proxy only
- one reliable session model

Today, basic sign-in works, but the full session lifecycle is still not fully owned by the SDK in this deployment shape. That is why we ended up writing a lot of manual glue code.

## 2. Our Problems

### 2.1 What users are seeing

Our production users can enter a **ghost session** state:

- the site still looks logged in
- but protected pages fail
- the app only discovers the problem when it makes a protected request

Typical production behavior:

1. User logs in successfully.
2. User leaves for a while.
3. User comes back and still sees logged-in UI.
4. User opens `/for-you` or another protected page.
5. The page fails and asks the user to recover or log in again.

This is the opposite of the behavior we want. "Looks logged in" and "actually has a usable session" should be the same thing.

### 2.2 Why these problems exist

There are two main gaps.

#### Gap A: Cross-domain refresh is not fully productized

Our frontend runs on `themarketbrew.com`, but InsForge auth runs on `*.insforge.app`.

That means when the access token expires, browser-based refresh is not something we can assume will "just work". So we had to build our own `/api/auth` bridge to:

- receive login results
- store refresh artifacts on our app domain
- proxy refresh requests
- clear cookies on sign-out

A thin proxy is fine. The issue is that this flow is not fully owned by the SDK as an official production pattern.

#### Gap B: The SDK/session model can still treat stale auth as current auth

We confirmed several specific behaviors:

- server `auth()` reads cookies, but does not verify whether the token is already expired
- browser initial state hydrates user information, but not the full token/session state
- SDK token/session retrieval does not guarantee token freshness before treating the session as current

So the app can end up in this bad state:

- SSR says the user is signed in
- SDK `user` exists
- but protected API calls still cannot use the session

That is why we had to add manual reconciliation code.

### 2.3 Problem Summary Table

| What we hit | Why it exists |
|---|---|
| Users can still look logged in after the session is already unusable | Server auth and browser auth do not fully validate token freshness |
| Protected pages fail after idle time | Cross-domain refresh is not fully productized for our deployment shape |
| We had to write manual token hydrate logic | Server auth state does not fully hydrate browser token state |
| We had to write our own stale-session cleanup logic | SDK does not fully reconcile `user`, token, and refresh state |
| We had to patch CSRF / refresh rotation ourselves | Proxy-based refresh lifecycle is not fully abstracted |

## 3. Our Requests

We want InsForge to own one of these two paths clearly.

### Option A: Official same-site / custom-domain path

If InsForge supports custom auth domains, then browser refresh and SSR could become same-site and much simpler.

### Option B: Official cross-domain + thin proxy path

If cross-domain is the intended setup, then InsForge should provide and document a first-class Next.js auth bridge that covers:

- sign-in bridge
- refresh bridge
- sign-out cleanup
- SSR auth state
- browser session hydrate
- CSRF / refresh rotation
- stale-session invalidation

Either option is acceptable.

What is not acceptable is the current middle state:

- proxy is required, but unofficial
- SSR auth exists, but can be stale
- browser provider exists, but does not fully hydrate token state
- app teams must invent recovery logic themselves

### Request Summary Table

| What we want from InsForge | Why we want it |
|---|---|
| Provide an official cross-domain auth topology for `frontend domain != insforge domain` | So teams do not have to guess the correct refresh / cookie / SSR pattern |
| Ship an official thin app-domain auth bridge for Next.js App Router | This should cover sign-in, refresh, sign-out, cookie sync, and callback cleanup |
| Make `auth()` able to return only valid auth state, not stale cookie state | SSR should not hydrate ghost sessions |
| Expose a supported `hydrateSession()` path from server auth state to browser token manager | App code should not need localStorage patches |
| Validate token freshness before returning SDK session state | "Existing token" should not mean "usable token" |
| Provide first-class stale-session recovery hooks / callbacks | App code should not invent its own reset / retry / redirect behavior |
| Document CSRF / refresh rotation behavior for proxy deployments | So app-domain proxy integrations remain correct across refresh cycles |
| Clarify which responsibilities belong to SDK vs proxy vs application | To stop auth logic from fragmenting into multiple fallback stacks |

## What Mainstream Auth Products Provide More Clearly

Our point is not that Auth0, Clerk, or Supabase are "magic" or that they never need a proxy.

Our point is that mainstream auth products usually define the responsibility split much more clearly. If a bridge layer is needed, it is usually:

- official
- documented
- minimal
- integrated into the auth product contract

### Comparison Table

| Product | What is clear / official | What app teams usually do not need to invent themselves |
|---|---|---|
| Auth0 | Next.js SDK mounts official app-domain auth routes such as login, callback, profile, and access-token routes | Teams usually do not invent their own base login/callback/token-sync route structure |
| Clerk | Multi-domain auth is treated as an official product model, such as primary domain + satellite domains | Teams usually do not invent their own domain-topology rules for cross-domain login behavior |
| Supabase | SSR docs explicitly explain that middleware / proxy is needed to refresh and write cookies in Next.js SSR setups | Teams usually do not have to guess whether a proxy is normal or what it is responsible for |
| InsForge (current experience) | Basic sign-in works, but cross-domain refresh + SSR + browser hydrate + stale-session handling are not yet one clearly owned path | Teams still need to write their own bridge, hydrate patches, stale-session reconciliation, and recovery logic |

### Why this matters to us

The difference is not "they have more APIs".

The difference is that mainstream auth products usually give application teams a more complete answer to these questions:

- What is the official architecture for this deployment shape?
- Which layer owns refresh?
- Which layer owns SSR auth state?
- Which layer owns browser hydrate?
- What counts as a valid current session?
- What should happen when session state becomes stale?

That is what we are asking InsForge to make clearer.

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
| `clearStaleAuthStateWithoutRedirect()` | Force cleanup when auth state becomes corrupted | `auth.ts` |

This complexity has caused production bugs including: login state loss on page refresh, race conditions between SDK refresh and our proxy refresh, "ghost login" states where UI shows logged-in but all API calls return 401, and auth cookie naming mismatches.

## Additional Findings Confirmed Today

These are the most important findings from today's debugging round:

1. **Server-side auth state is stale-cookie based, not validity based**
   - `@insforge/nextjs/server` `auth()` reads `insforge-session` and `insforge-user` cookies and returns them directly.
   - It does not validate whether the access token is already expired.
   - Result: SSR and Navbar can continue to show "logged in" after the session is already unusable.

2. **Client session restore is incomplete without app patches**
   - Server `auth()` can provide `{ userId, user, token }`.
   - Browser provider initial state only restores `user` / `userId`.
   - App code still has to seed token state into localStorage for SDK restore behavior to work consistently.

3. **SDK/browser session retrieval does not guarantee token freshness**
   - `TokenManager.getSession()` returns stored token + user.
   - It does not validate JWT expiry before treating that as a current session.
   - Result: the app can temporarily believe a stale token is still a usable session.

4. **The app had to add session reconciliation logic that should not be app-level**
   - We now have to reconcile:
     - SSR cookie state
     - SDK `user`
     - token manager state
     - refresh proxy result
   - This is exactly the kind of auth split-brain state we want the SDK contract to prevent.

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

   Follow-up from today's debugging:
   - We now also need to know whether InsForge plans to make server auth state freshness-aware.
   - Returning stale cookie-backed auth state is not sufficient for SSR products.

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

`auth()` (`@insforge/nextjs/server`) currently:
```
1. Read insforge-session cookie
2. Read insforge-user cookie
3. Return { userId, token, user }
4. No token validity check
```

That behavior is convenient for basic SSR hydration, but it is not strong enough for production auth correctness when stale cookies remain present.

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

We are willing to keep a **thin app-domain auth route**, for example `/api/auth`, if its responsibilities are limited to:

1. Receiving auth callbacks or sign-in bridge requests on `themarketbrew.com`
2. Writing first-party cookies for our app domain
3. Forwarding refresh requests server-to-server when the browser cannot send the refresh cookie cross-domain
4. Clearing app-domain cookies on sign-out

What we need from InsForge is for one of these two paths to become official:

1. **Same-site / custom-domain auth**
   - Where browser refresh and SSR state are first-class and require minimal app code

2. **Official cross-domain + thin proxy auth**
   - Where InsForge documents and supports:
     - sign-in bridge
     - refresh bridge
     - sign-out cleanup
     - SSR auth state
     - browser hydrate
     - CSRF / refresh rotation
     - stale-session invalidation

What we do **not** want is the current middle ground:

- proxy is needed, but unofficial
- SSR auth exists, but can be stale
- browser provider exists, but does not fully hydrate token state
- app teams must invent reconciliation logic themselves

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
