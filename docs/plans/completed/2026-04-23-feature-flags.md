# Feature Flags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a per-user feature flag system and use it to gate the new /for-you V2 experience behind the `for_you_v2` flag.

**Architecture:** New `feature_flags` Insforge table → Edge Function → FastAPI endpoint → TanStack Query hook → thin router in ForYouContent.tsx that dispatches to V1 (frozen master) or V2 (current branch) based on the flag.

**Tech Stack:** Insforge PostgreSQL, Insforge Edge Functions (JS), FastAPI, TanStack Query, React

**Spec:** `docs/superpowers/specs/2026-04-23-feature-flags-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `backend/migrations/feature_flags_schema.sql` | Create | DDL for `feature_flags` table |
| `backend/app/edge_functions/feature-flags.js` | Create | Edge Function: list/check flags from DB |
| `backend/app/features/flags/__init__.py` | Create | Module init |
| `backend/app/features/flags/db.py` | Create | Call Edge Function, return flag set |
| `backend/app/features/flags/router.py` | Create | `GET /api/flags` endpoint |
| `backend/app/main.py` | Modify (line 131–152) | Register `flags_router` |
| `frontend/src/hooks/use-feature-flags.ts` | Create | TanStack Query hook for flags |
| `frontend/src/app/for-you/_components/ForYouContentV1.tsx` | Create | Frozen master version |
| `frontend/src/app/for-you/_components/ForYouContentV2.tsx` | Create | Current branch version (continues to evolve) |
| `frontend/src/app/for-you/_components/ForYouContent.tsx` | Rewrite | Thin flag router |
| `frontend/src/app/for-you/onboarding/page.tsx` | Modify (top of component) | Add flag guard |
| `frontend/src/app/for-you/portfolio/page.tsx` | Modify (top of component) | Add flag guard |

---

### Task 1: Database schema (SQL migration file)

**Files:**
- Create: `backend/migrations/feature_flags_schema.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Feature flags: per-user gradual rollout
-- Run via Insforge Dashboard → SQL Editor

CREATE TABLE IF NOT EXISTS feature_flags (
  user_id    TEXT        NOT NULL,
  flag       TEXT        NOT NULL,
  enabled    BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, flag)
);

CREATE INDEX IF NOT EXISTS idx_feature_flags_flag
  ON feature_flags (flag);
```

- [ ] **Step 2: Commit**

```bash
git add backend/migrations/feature_flags_schema.sql
git commit -m "feat(flags): add feature_flags schema migration"
```

- [ ] **Step 3: OPERATOR ACTION — Create the table in Insforge**

> **This step requires the developer to manually execute in Insforge Dashboard → SQL Editor.** It is an irreversible DDL operation (creates a new table). It does NOT modify any existing tables.

```sql
-- Paste the contents of backend/migrations/feature_flags_schema.sql
-- into Insforge Dashboard → SQL Editor and execute.
```

Verify: run `SELECT * FROM feature_flags LIMIT 1;` — should return 0 rows, no error.

---

### Task 2: Edge Function

**Files:**
- Create: `backend/app/edge_functions/feature-flags.js`

- [ ] **Step 1: Create the Edge Function**

```javascript
module.exports = async function(request) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const client = createClient({
    baseUrl: Deno.env.get("INSFORGE_INTERNAL_URL") || "http://insforge:7130",
    anonKey: Deno.env.get("ANON_KEY"),
  });

  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  try {
    // GET ?action=list&user_id=xxx
    if (request.method === "GET" && action === "list") {
      const userId = url.searchParams.get("user_id");
      if (!userId) {
        return new Response(
          JSON.stringify({ success: false, error: "user_id required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data, error } = await client.database
        .from("feature_flags")
        .select("flag")
        .eq("user_id", userId)
        .eq("enabled", true);

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const flags = (data || []).map((row) => row.flag);

      return new Response(
        JSON.stringify({ success: true, data: flags }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // GET ?action=check&user_id=xxx&flag=for_you_v2
    if (request.method === "GET" && action === "check") {
      const userId = url.searchParams.get("user_id");
      const flag = url.searchParams.get("flag");
      if (!userId || !flag) {
        return new Response(
          JSON.stringify({ success: false, error: "user_id and flag required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data, error } = await client.database
        .from("feature_flags")
        .select("flag")
        .eq("user_id", userId)
        .eq("flag", flag)
        .eq("enabled", true)
        .maybeSingle();

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, data: { enabled: !!data } }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: "Invalid action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/edge_functions/feature-flags.js
git commit -m "feat(flags): add feature-flags Edge Function"
```

- [ ] **Step 3: OPERATOR ACTION — Deploy the Edge Function**

> **This step requires the developer to run from terminal.** It deploys a new Edge Function (does not modify existing ones).

```bash
insforge functions deploy feature-flags --file backend/app/edge_functions/feature-flags.js
```

Verify with curl (replace `YOUR_INSFORGE_URL`):

```bash
curl "YOUR_INSFORGE_URL/functions/feature-flags?action=list&user_id=nonexistent"
# Expected: {"success":true,"data":[]}
```

---

### Task 3: Backend — flags module

**Files:**
- Create: `backend/app/features/flags/__init__.py`
- Create: `backend/app/features/flags/db.py`
- Create: `backend/app/features/flags/router.py`
- Modify: `backend/app/main.py` (lines 131, 152)

- [ ] **Step 1: Create module init**

Create empty file: `backend/app/features/flags/__init__.py`

- [ ] **Step 2: Create db.py**

```python
"""Feature flags database access via Edge Function."""

from typing import Set

from app.core.database import get_insforge_service
from app.core.logging import get_logger

logger = get_logger(__name__)

_FUNCTION = "feature-flags"


async def get_user_flags(user_id: str) -> Set[str]:
    """Fetch all enabled flags for a user."""
    service = get_insforge_service()
    result = await service.call_function(
        _FUNCTION,
        method="GET",
        params={"action": "list", "user_id": user_id},
    )
    data = result.get("data", {})
    if data.get("success"):
        return set(data.get("data") or [])
    logger.warning("feature-flags EF failed for user %s: %s", user_id, result)
    return set()
```

- [ ] **Step 3: Create router.py**

```python
"""Feature flags API — returns current user's active flags."""

from fastapi import APIRouter, Depends

from app.core.deps import verify_user_token
from app.features.flags.db import get_user_flags

router = APIRouter(prefix="/api/flags", tags=["flags"])


@router.get("")
async def list_my_flags(user_id: str = Depends(verify_user_token)):
    flags = await get_user_flags(user_id)
    return {"flags": sorted(flags)}
```

- [ ] **Step 4: Register router in main.py**

In `backend/app/main.py`, add the import alongside the other feature router imports (after line 131):

```python
from app.features.flags.router import router as flags_router
```

And add the `include_router` call alongside the others (after line 152):

```python
app.include_router(flags_router)
```

- [ ] **Step 5: Verify the backend starts without errors**

```bash
cd backend && source venv/bin/activate && python -c "from app.features.flags.router import router; print('OK')"
```

Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add backend/app/features/flags/ backend/app/main.py
git commit -m "feat(flags): add backend flags module with GET /api/flags endpoint"
```

---

### Task 4: Frontend — useFeatureFlags hook

**Files:**
- Create: `frontend/src/hooks/use-feature-flags.ts`

- [ ] **Step 1: Create the hook**

```typescript
import { useQuery } from '@tanstack/react-query';
import { getAccessTokenAsync } from '@/contexts/AuthContext';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

async function fetchFlags(): Promise<string[]> {
  const token = await getAccessTokenAsync();
  if (!token) return [];
  const res = await fetch(`${API}/flags`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.flags || [];
}

export function useFeatureFlags() {
  const { data: flags = [], isLoading } = useQuery({
    queryKey: ['feature-flags'],
    queryFn: fetchFlags,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const flagSet = new Set(flags);

  return {
    flags: flagSet,
    isLoading,
    has: (flag: string) => flagSet.has(flag),
  };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/use-feature-flags.ts
git commit -m "feat(flags): add useFeatureFlags TanStack Query hook"
```

---

### Task 5: Frontend — Split ForYouContent into V1 / V2

**Files:**
- Create: `frontend/src/app/for-you/_components/ForYouContentV1.tsx`
- Create: `frontend/src/app/for-you/_components/ForYouContentV2.tsx`
- Rewrite: `frontend/src/app/for-you/_components/ForYouContent.tsx`

- [ ] **Step 1: Create ForYouContentV1.tsx (frozen master version)**

This is the exact master version of ForYouPageContent, renamed to `ForYouPageContentV1` and exported. **This file must not be modified after creation.**

```tsx
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { DigestResponse } from '@/lib/api';
import { clearStaleAuthAction } from '@/app/actions/auth';
import { getAuthErrorPresentation } from '@/lib/auth-error-presentation';
import { userDigestToResponse } from '@/lib/digest-utils';
import DigestInlineReport from '@/components/for-you/DigestInlineReport';
import RecentReports from '@/components/for-you/RecentReports';
import { AiChatLink } from '@/components/AiChatLink';
import { useWatchlist } from '@/hooks/queries/use-watchlist';
import { useDigestList } from '@/hooks/queries/use-digest-data';

import { ForYouSkeleton } from './ForYouSkeleton';
import WatchlistPreview from './WatchlistPreview';

export function ForYouPageContentV1() {
  const router = useRouter();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();

  const {
    data: watchlistData,
    isLoading: loadingWatchlist,
    isError: watchlistLoadFailed,
    error: watchlistError,
  } = useWatchlist(user?.id, !!user?.id);
  const { data: digestData, isLoading: loadingDigest, error: digestError } = useDigestList(user?.id ?? '', 10, 0, !!user?.id);

  const symbols = useMemo(() => {
    if (!watchlistData?.symbols || watchlistData.symbols.length === 0) return [];
    return [...new Set(watchlistData.symbols.map((s: string) => s.toUpperCase()))];
  }, [watchlistData]);

  const history = digestData?.data ?? [];
  const totalHistory = digestData?.total ?? 0;

  const displayDigest: DigestResponse | null = useMemo(() => {
    if (history.length === 0) return null;
    const best = history.find((d) => d.analysis && d.analysis.length > 0) ?? history[0];
    return userDigestToResponse(best);
  }, [history]);

  const [isReauthenticating, setIsReauthenticating] = useState(false);

  const filteredHistory = useMemo(() => {
    if (!displayDigest || history.length === 0) return history;
    return history.slice(1);
  }, [history, displayDigest]);

  const loadErrorMessage = getAuthErrorPresentation(
    watchlistError ?? digestError,
    '无法连接到服务器，请刷新页面重试。'
  ).message;

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login?redirect=/for-you');
    }
  }, [authLoading, isAuthenticated, router]);

  const handleReLogin = async () => {
    setIsReauthenticating(true);
    try {
      await clearStaleAuthAction();
    } finally {
      window.location.assign('/login?redirect=/for-you');
    }
  };

  if (authLoading) {
    return <ForYouSkeleton />;
  }

  if (!isAuthenticated) {
    return null;
  }

  const dataLoading = loadingWatchlist || loadingDigest;
  const isOnboarding = !dataLoading && !watchlistLoadFailed && symbols.length === 0;

  return (
    <main className="min-h-screen bg-background">
      <section className="border-b border-border/50">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 md:py-12">
          <div className="space-y-4">
            <div className="flex items-center gap-3 animate-fade-in-up">
              <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-primary to-transparent animate-line-expand" />
              <span className="text-primary text-xs font-semibold tracking-[0.25em] uppercase">MyBrew</span>
              {!dataLoading && symbols.length > 0 && (
                <span className="text-muted-foreground text-xs font-semibold tracking-[0.2em] ml-2">/ {symbols.length} Stocks</span>
              )}
            </div>

            {dataLoading ? (
              <>
                <div className="h-10 w-44 bg-muted rounded-lg animate-pulse" />
                <div className="h-4 w-60 bg-muted rounded-lg animate-pulse" />
                <div className="flex items-center gap-3 pt-1">
                  <div className="h-9 w-24 bg-muted rounded-lg animate-pulse" />
                  <div className="h-9 w-24 bg-muted rounded-lg animate-pulse" />
                  <div className="h-9 w-28 bg-muted rounded-lg animate-pulse" />
                </div>
              </>
            ) : (
              <>
                <h1 className="text-3xl md:text-5xl font-editorial text-foreground tracking-tight leading-[1.1] animate-fade-in-up delay-100">
                  {isOnboarding ? 'MyBrew' : '持仓总览'}
                </h1>
                <p className="text-muted-foreground text-sm md:text-base max-w-lg leading-relaxed animate-fade-in-up delay-200">
                  {isOnboarding
                    ? '添加你的持仓，获取专属投资日报'
                    : '你的持仓和市场动态，一目了然'}
                </p>

                {!isOnboarding && symbols.length > 0 && (
                  <div className="flex flex-wrap items-center gap-3 pt-1 animate-fade-in-up delay-300">
                    <Link
                      href="/for-you/watchlist"
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border/50 bg-card hover:border-primary/30 hover:bg-card/80 text-sm text-foreground transition-all"
                    >
                      <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                      </svg>
                      管理持仓
                    </Link>

                    {displayDigest && (
                      <AiChatLink href="/research?context=brew" />
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </section>

      {dataLoading && (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 space-y-4">
          <div className="h-72 bg-muted/60 rounded-xl animate-pulse" />
          <div className="h-32 bg-muted/40 rounded-xl animate-pulse" />
          <div className="h-32 bg-muted/40 rounded-xl animate-pulse" />
        </div>
      )}

      {!dataLoading && watchlistLoadFailed && (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-12">
          <div className="flex flex-col items-center justify-center gap-4 py-12 rounded-xl border border-dashed border-red-500/30 bg-red-500/5">
            <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
              <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <p className="text-sm text-red-400 font-medium">加载持仓数据失败</p>
            <p className="text-xs text-muted-foreground text-center max-w-sm">
              {loadErrorMessage}
            </p>
            <button
              type="button"
              onClick={handleReLogin}
              disabled={isReauthenticating}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-red-500/20 bg-background/80 text-sm font-medium text-foreground transition-all hover:border-primary/30 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isReauthenticating ? '跳转中...' : '重新登录'}
            </button>
          </div>
          {displayDigest && <DigestInlineReport digest={displayDigest} />}
          {history.length > 0 && <RecentReports history={history} totalHistory={totalHistory} />}
        </div>
      )}

      {!dataLoading && isOnboarding && user && (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-16">
          <div className="flex flex-col items-center justify-center gap-6 py-16 rounded-xl border border-dashed border-border/50 bg-card/30 animate-fade-in-up">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center animate-float">
              <svg className="w-7 h-7 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <div className="text-center space-y-2">
              <h2 className="text-lg font-editorial text-foreground">
                添加你的持仓
              </h2>
              <p className="text-sm text-muted-foreground max-w-sm">
                搜索并添加你关注的股票，我们将为你生成专属的每日投资分析
              </p>
            </div>
            <Link
              href="/for-you/watchlist"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium transition-all hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/20 active:scale-[0.97]"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              管理我的持仓
            </Link>
          </div>
        </div>
      )}

      {!dataLoading && symbols.length > 0 && !displayDigest && (
        <WatchlistPreview symbols={symbols} />
      )}

      {!dataLoading && symbols.length > 0 && displayDigest && (
        <>
          <DigestInlineReport digest={displayDigest} />
          <RecentReports history={filteredHistory} totalHistory={totalHistory} />
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Create ForYouContentV2.tsx**

Move the current `ForYouPageContent` function from `ForYouContent.tsx` into this new file, renaming the export to `ForYouPageContentV2`. The content is the current branch version — the full file with `useSubscription`, `useInvestmentProfile`, the new toolbar buttons, etc.

The current `ForYouContent.tsx` already has the function as `ForYouPageContent()`. Copy the entire function body, change the export name:

```tsx
// Top of file: same imports as current ForYouContent.tsx, minus PaywallGuard
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { DigestResponse } from '@/lib/api';
import { clearStaleAuthAction } from '@/app/actions/auth';
import { getAuthErrorPresentation } from '@/lib/auth-error-presentation';
import { userDigestToResponse } from '@/lib/digest-utils';
import DigestInlineReport from '@/components/for-you/DigestInlineReport';
import RecentReports from '@/components/for-you/RecentReports';
import { AiChatLink } from '@/components/AiChatLink';
import { useWatchlist } from '@/hooks/queries/use-watchlist';
import { useDigestList } from '@/hooks/queries/use-digest-data';
import { useInvestmentProfile } from '@/hooks/queries/use-portfolio';

import { ForYouSkeleton } from './ForYouSkeleton';
import WatchlistPreview from './WatchlistPreview';

export function ForYouPageContentV2() {
  // ... entire current ForYouPageContent function body from ForYouContent.tsx
  // (This is the version with useSubscription, useInvestmentProfile,
  //  "MyBrew · 专属日报" title, 投资画像/关注列表/模拟持仓 toolbar buttons,
  //  and profileData-aware onboarding logic)
}
```

Concrete instruction: copy lines 23–261 from the current `ForYouContent.tsx` (the `ForYouPageContent` function), paste into this file, and rename the function to `ForYouPageContentV2`.

- [ ] **Step 3: Rewrite ForYouContent.tsx as thin flag router**

Replace the entire contents of `ForYouContent.tsx` with:

```tsx
'use client';

import { useFeatureFlags } from '@/hooks/use-feature-flags';
import PaywallGuard from '@/components/PaywallGuard';
import { ForYouPageContentV1 } from './ForYouContentV1';
import { ForYouPageContentV2 } from './ForYouContentV2';
import { ForYouSkeleton } from './ForYouSkeleton';

export function ForYouContent() {
  const { has, isLoading } = useFeatureFlags();

  return (
    <PaywallGuard requiredFeature="for_you_website">
      {isLoading ? (
        <ForYouSkeleton />
      ) : has('for_you_v2') ? (
        <ForYouPageContentV2 />
      ) : (
        <ForYouPageContentV1 />
      )}
    </PaywallGuard>
  );
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/for-you/_components/ForYouContentV1.tsx \
       frontend/src/app/for-you/_components/ForYouContentV2.tsx \
       frontend/src/app/for-you/_components/ForYouContent.tsx
git commit -m "feat(flags): split ForYouContent into V1/V2 with flag-based routing"
```

---

### Task 6: Frontend — Flag guards on new pages

**Files:**
- Modify: `frontend/src/app/for-you/onboarding/page.tsx` (top of component function)
- Modify: `frontend/src/app/for-you/portfolio/page.tsx` (top of component function)

- [ ] **Step 1: Add flag guard to onboarding page**

> **React Rules of Hooks:** All hooks must be called unconditionally in the same order on every render. The flag guard must be placed AFTER all hook calls, not before them. The early-return redirect goes after all hooks but before the JSX rendering logic.

In `frontend/src/app/for-you/onboarding/page.tsx`, add the import at the top of the file (with the other imports):

```typescript
import { useFeatureFlags } from '@/hooks/use-feature-flags';
```

Then inside the inner component function that uses hooks, add `useFeatureFlags()` alongside the other hooks at the top (the exact position among hooks doesn't matter, but it must be at top level, not inside a condition):

```typescript
// Add alongside existing hooks (useRouter, useAuth, etc.) — NOT as an early return before them:
const { has: hasFlag, isLoading: flagsLoading } = useFeatureFlags();
```

Then add the redirect check AFTER all hooks are called but BEFORE the JSX return / rendering logic (e.g. right before or alongside the existing `if (authLoading)` early-return block):

```typescript
// Flag guard — placed AFTER all hook calls, BEFORE rendering
if (!flagsLoading && !hasFlag('for_you_v2')) {
  router.push('/for-you');
  return null;
}
```

- [ ] **Step 2: Add flag guard to portfolio page**

In `frontend/src/app/for-you/portfolio/page.tsx`, same pattern. Add the import:

```typescript
import { useFeatureFlags } from '@/hooks/use-feature-flags';
```

Inside `PortfolioEditorContent` (the inner component, line 36), add `useFeatureFlags()` alongside the other hooks at the top level:

```typescript
const { has: hasFlag, isLoading: flagsLoading } = useFeatureFlags();
```

Then add the redirect AFTER all hooks but BEFORE rendering logic:

```typescript
// Flag guard — placed AFTER all hook calls, BEFORE rendering
if (!flagsLoading && !hasFlag('for_you_v2')) {
  router.push('/for-you');
  return null;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Verify build passes**

```bash
cd frontend && npm run build
```

Expected: build succeeds

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/for-you/onboarding/page.tsx \
       frontend/src/app/for-you/portfolio/page.tsx
git commit -m "feat(flags): add for_you_v2 flag guard to onboarding and portfolio pages"
```

---

### Task 7: End-to-end verification

- [ ] **Step 1: OPERATOR ACTION — Insert test flag**

> **Requires manual SQL execution in Insforge Dashboard.**

First, find the test account's user ID. In Insforge Dashboard → Authentication → Users, find `voya.technologies@gmail.com` and copy the UUID.

```sql
INSERT INTO feature_flags (user_id, flag)
VALUES ('THE-USER-UUID-HERE', 'for_you_v2')
ON CONFLICT (user_id, flag) DO NOTHING;
```

- [ ] **Step 2: Start backend and frontend dev servers**

Terminal 1:
```bash
cd backend && source venv/bin/activate && uvicorn app.main:app --reload
```

Terminal 2:
```bash
cd frontend && npm run dev
```

- [ ] **Step 3: Verify V2 user sees new page**

1. Open `http://localhost:3000/for-you`
2. Log in with test account (`voya.technologies@gmail.com` / `123456`)
3. Confirm you see the V2 page: title "MyBrew · 专属日报", toolbar with "投资画像", "关注列表", "模拟持仓" buttons
4. Navigate to `/for-you/onboarding` — should load normally
5. Navigate to `/for-you/portfolio` — should load normally

- [ ] **Step 4: Verify non-flagged user sees V1 page**

Either:
- Create a second test account, or
- Remove the flag: `DELETE FROM feature_flags WHERE user_id = 'THE-UUID' AND flag = 'for_you_v2';`

Then verify:
1. `/for-you` shows the V1 page: title "持仓总览" or "MyBrew" (onboarding state), toolbar with only "管理持仓"
2. Manually navigating to `/for-you/onboarding` redirects back to `/for-you`
3. Manually navigating to `/for-you/portfolio` redirects back to `/for-you`

- [ ] **Step 5: Verify flag API endpoint**

```bash
# Get a valid token first by logging in via the frontend, then:
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:8000/api/flags
# Expected (if flag is set): {"flags":["for_you_v2"]}
# Expected (if no flag):     {"flags":[]}
```

- [ ] **Step 6: Re-insert flag for test account if removed in Step 4**

```sql
INSERT INTO feature_flags (user_id, flag)
VALUES ('THE-USER-UUID-HERE', 'for_you_v2')
ON CONFLICT (user_id, flag) DO NOTHING;
```

---

## Operator Action Summary

These steps require human intervention (database changes or CLI deploys). They are **NOT** automated by the implementation tasks:

| Step | Task | Action | Reversible? |
|------|------|--------|-------------|
| 1 | Task 1 Step 3 | Execute `feature_flags_schema.sql` in Insforge SQL Editor | Yes (DROP TABLE) |
| 2 | Task 2 Step 3 | Deploy Edge Function via `insforge functions deploy` | Yes (redeploy old version) |
| 3 | Task 7 Step 1 | INSERT flag for test user | Yes (DELETE) |

All operator actions are additive (new table, new function, new row) — none modify or delete existing data.

---

## Rollback Plan

If something goes wrong after deployment:

1. **Frontend rollback**: Revert the ForYouContent split commit — the page will go back to showing only V2 to everyone (current branch behavior before this plan)
2. **Backend rollback**: The `/api/flags` endpoint is standalone — removing it doesn't affect anything else
3. **Database rollback**: `DROP TABLE IF EXISTS feature_flags;` — no other table references it
4. **Edge Function**: Can be deleted via Insforge Dashboard without affecting other functions
