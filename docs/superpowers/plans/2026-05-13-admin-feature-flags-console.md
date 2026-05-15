# Feature Flags Admin Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/admin/flags` — an admin-only console for searching / adding / removing per-user feature flag assignments, plus a reusable developer playbook for introducing and retiring future flags.

**Architecture:** Extend the existing read-only feature-flag stack (`feature-flags` EF + `app/features/flags/`) with admin write actions, expose them through a new FastAPI router gated by `verify_admin_user`, and render them via a dedicated Next.js page that mirrors the existing CRM admin pattern. The flag registry (`registry.py`) becomes the single source of truth for `KNOWN_FLAGS`, used both by the UI dropdown and the server-side validation.

**Tech Stack:** FastAPI · Insforge Edge Functions (Deno) · Next.js 16 App Router · React 19 · Tailwind · pytest · Vitest

**Spec:** `docs/plans/completed/2026-05-12-admin-feature-flags.md`

---

## Completion Status (2026-05-14)

| Phase | Status | Notes |
|---|---|---|
| Branch `feat/admin-feature-flags-console` from `origin/master` | ✅ Done | 12 commits, see `git log origin/master..HEAD` |
| Backend: registry, EF, db, admin router, main.py wiring, tests | ✅ Done | 19/19 tests pass: 5 registry + 5 db + 9 admin |
| Frontend: `/admin/flags` page, panel, AdminDashboard link | ✅ Done | tsc clean, eslint 0 errors (1 cosmetic `_initialToken` warning) |
| `.context.md` + playbook | ✅ Done | `backend/app/features/flags/.context.md`, `docs/guides/feature-flags-playbook.md` |
| EF deploy to Insforge (`insforge functions deploy feature-flags`) | ⏳ Operator | Required before admin POST/DELETE work in any env |
| Manual UI walkthrough at `/admin/flags` | ⏳ Operator | Run after EF deploy + uvicorn + `npm run dev` |
| Push branch + open PR + merge | ⏳ Operator | `gh pr create` template in Task 12 below |

**Deviations from spec (all intentional, documented in commit messages):**

1. `UpsertBody` does NOT expose `enabled` — admin can only "add" (which writes `enabled=true`) or "delete" (which removes the row). Matches spec design decision "只支持添加/删除". Commit `dbf8440`.
2. EF write failures surface as **HTTP 502** (not 500). Semantically correct (bad gateway to Insforge) and lets the UI render a useful error. Commit `dbf8440`.
3. Email-search debounce uses `useRef` to cancel prior timers (the plan's inline-cleanup pattern was a no-op). Commit `64212de`.
4. `test_flags_admin.py` ships 9 tests (not the 7 the plan originally mentioned) — two extra tests pin the 502 mapping and the `enabled=false` filter.

---

## Runbook

### 1. Run locally for end-to-end verification

```bash
# Terminal A — backend
cd backend && source venv/bin/activate && uvicorn app.main:app --reload

# Terminal B — frontend
cd frontend && npm run dev

# Terminal C — backend tests
cd backend && source venv/bin/activate && \
  pytest tests/test_flags_registry.py tests/test_flags_db.py tests/test_flags_admin.py -v
# Expected: 19 passed
```

### 2. Deploy the Edge Function (REQUIRED before merge)

```bash
cd /Users/xuxueyang/Documents/GitHub/stock-agent
insforge functions deploy feature-flags --file backend/app/edge_functions/feature-flags.js
```

Smoke-test the new actions against Insforge (replace `<INSFORGE_URL>` / `<ANON>` from `backend/.env`):

```bash
# Existing read actions (must still work):
curl -s "<INSFORGE_URL>/functions/feature-flags?action=list&user_id=any" -H "apikey: <ANON>"
# → {"success":true,"data":[]}

# New admin enumeration:
curl -s "<INSFORGE_URL>/functions/feature-flags?action=list_all&flag=for_you_v2" -H "apikey: <ANON>"
# → {"success":true,"data":[{"user_id":"...","flag":"for_you_v2","enabled":true,"created_at":"..."}, ...]}
```

If `list_all` returns `Invalid action`, the deploy didn't pick up the new revision — re-run.

### 3. Backend API smoke (admin token required)

Log in at `http://localhost:3000` as an `ADMIN_EMAILS` member (e.g. `xuxueyang1994@outlook.com`), copy the access token from cookies / DevTools, then:

```bash
export TOKEN="<paste>"

# GET, no filter
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/admin/flags | jq '.known_flags, (.assignments | length)'

# GET, email substring
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:8000/api/admin/flags?email=voya" | jq '.assignments[].email'

# GET, flag filter (returns users w/ that flag; each user keeps full flags list)
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:8000/api/admin/flags?flag=for_you_v2" | jq '.assignments[].flags'

# POST — grant
TEST_UID="<NON-self insforge user uuid>"
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"user_id\":\"$TEST_UID\",\"flag\":\"for_you_v2\"}" http://localhost:8000/api/admin/flags
# → {"ok":true,"record":{...}}

# DELETE — revoke (idempotent)
curl -s -X DELETE -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/admin/flags?user_id=$TEST_UID&flag=for_you_v2"
# → {"ok":true}

# Negative — non-admin token
NON_ADMIN_TOKEN="<token from voya.technologies@gmail.com>"
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $NON_ADMIN_TOKEN" http://localhost:8000/api/admin/flags
# → 403

# Negative — unknown flag
curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"user_id":"any","flag":"bogus"}' http://localhost:8000/api/admin/flags
# → 422
```

### 4. Manual UI walkthrough

1. Sign in at `http://localhost:3000` as admin → open `/admin`. Confirm the "灰度管理 →" link is in the dashboard header.
2. Click it → land on `/admin/flags`. Expect header "灰度管理 · 共 N 用户" and a table with one row per user.
3. **Search**: type `voya` → row list narrows within ~300 ms.
4. **Filter**: pick `for_you_v2` in the dropdown → only flagged users remain, but each user's "已开通的 Flags" column still shows their full chip list.
5. **Grant**: on a user without `for_you_v2`, pick it from the row's "添加" select, click `+ 添加`. Chip appears immediately. Refresh page → chip still there.
6. **Revoke**: click `×` on a chip → `window.confirm` → confirm → chip disappears optimistically; refresh page → still gone.
7. **Negative**: sign in as non-admin → `/admin/flags` → `notFound()`. Signed-out → same.
8. **Cross-flow**: a flagged user signs in → `/for-you` renders V2 (read path unchanged).

### 5. Production deploy

After merge to `master`:

1. Watch the deploy pipeline complete.
2. Repeat steps 3 + 4 against the production URL with a real admin account, but limit writes to one harmless grant/revoke against an internal test user.
3. Verify another flagged user's `/for-you` still shows V2.

### 6. Rollback

| Failure | Action |
|---|---|
| Frontend regression | `git revert` the merge commit; CI redeploys |
| Backend regression | `git revert` the merge commit; redeploy |
| EF regression | `git checkout master~1 -- backend/app/edge_functions/feature-flags.js && insforge functions deploy feature-flags` |
| Accidental mass grant | `DELETE FROM feature_flags WHERE flag = '<key>';` in Insforge Dashboard |

No table schema changes — DB rollback is not needed.

---

## Testing Matrix

| Layer | Test file | What it pins |
|---|---|---|
| Registry | `backend/tests/test_flags_registry.py` | `KNOWN_FLAGS` non-empty, `for_you_v2` present, unique keys, `[a-zA-Z0-9_]+` shape, `is_known_flag` true/false/empty |
| DB helpers | `backend/tests/test_flags_db.py` | EF call shape (method, params, json_body) for `list_all_assignments` (with & without flag filter), `upsert_assignment`, `delete_assignment`; safe-fallback `[]` on EF failure for the read helper |
| Admin router | `backend/tests/test_flags_admin.py` | (1) Auth: no token → 401/403; (2) GET full output shape; (3) GET email substring filter; (4) GET flag filter preserves full flag list per user; (5) POST 422 on unknown flag — upsert NOT awaited; then 200 on known flag — upsert called once with `(user_id, flag, True)`; (6) DELETE idempotent → 200, delete called once; (7) GET filters `enabled=false` rows out of every user's chips; (8) POST 502 when `upsert_assignment` raises; (9) DELETE 502 when `delete_assignment` raises |
| Frontend | `npx tsc --noEmit` + `npx eslint src/app/admin/flags` | Type + lint correctness of `page.tsx` and `FlagsAdminPanel.tsx` |

**Quick verify in one command:**

```bash
cd backend && source venv/bin/activate && \
  pytest tests/test_flags_registry.py tests/test_flags_db.py tests/test_flags_admin.py -v && \
cd ../frontend && \
  npx tsc --noEmit 2>&1 | grep -E "admin/flags" ; \
  npx eslint src/app/admin/flags
```

Expected: 19 pytest passed, no tsc output for admin/flags files, eslint 0 errors (1 cosmetic warning).

**Conftest-protected write guards**: `backend/tests/conftest.py` `DB_WRITE_FUNCTIONS` includes `app.features.flags.db.upsert_assignment` and `app.features.flags.db.delete_assignment`. Any unrelated test that triggers these paths will see a mocked no-op response rather than hitting Insforge.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `backend/app/features/flags/registry.py` | Create | Canonical `KNOWN_FLAGS` list — only place to add new flags |
| `backend/app/edge_functions/feature-flags.js` | Modify | Add `list_all` / `upsert` / `delete` actions (read actions untouched) |
| `backend/app/features/flags/db.py` | Modify | Add `list_all_assignments` / `upsert_assignment` / `delete_assignment` |
| `backend/app/features/flags/admin_router.py` | Create | `GET/POST/DELETE /api/admin/flags` — `verify_admin_user` protected |
| `backend/app/main.py` | Modify | Register `flags_admin_router` |
| `backend/app/features/flags/.context.md` | Modify | Document admin write path + point at playbook |
| `backend/tests/test_flags_admin.py` | Create | pytest coverage for admin router (auth, GET/POST/DELETE, validation) |
| `backend/tests/conftest.py` | Modify | Mock `flags.db.upsert_assignment` + `delete_assignment` in `DB_WRITE_FUNCTIONS` |
| `frontend/src/app/admin/flags/page.tsx` | Create | Server Component, fetches initial dataset |
| `frontend/src/app/admin/flags/_components/FlagsAdminPanel.tsx` | Create | Client Component — table, search, add/delete UI |
| `frontend/src/app/admin/_components/AdminDashboard.tsx` | Modify | Add "灰度管理 →" entry link |
| `docs/guides/feature-flags-playbook.md` | Create | Reusable guide: how to add a new flag, how to retire one |

---

### Task 0: Cut the feature branch

- [ ] **Step 1: Confirm clean working tree on the current branch context**

```bash
git -C /Users/xuxueyang/Documents/GitHub/stock-agent status
```

Expected: only the in-flight tracked changes documented in the session (e.g. `M backend/app/main.py`, `?? docs/plans/active/...`). If anything else is dirty, stash before proceeding.

- [ ] **Step 2: Fetch master and branch from it**

```bash
git -C /Users/xuxueyang/Documents/GitHub/stock-agent fetch origin master
git -C /Users/xuxueyang/Documents/GitHub/stock-agent checkout -b feat/admin-feature-flags-console origin/master
```

Expected: `Switched to a new branch 'feat/admin-feature-flags-console'`.

- [ ] **Step 3: Verify base parity with master**

```bash
git -C /Users/xuxueyang/Documents/GitHub/stock-agent log --oneline -1
git -C /Users/xuxueyang/Documents/GitHub/stock-agent diff origin/master --stat
```

Expected: HEAD matches `origin/master` HEAD, diff is empty.

---

### Task 1: Add the `KNOWN_FLAGS` registry

**Files:**
- Create: `backend/app/features/flags/registry.py`
- Create: `backend/tests/test_flags_registry.py`

- [ ] **Step 1: Write the failing registry test**

```python
# backend/tests/test_flags_registry.py
"""Sanity tests for the feature-flag registry."""

from app.features.flags.registry import KNOWN_FLAGS, FlagDef, is_known_flag


def test_known_flags_is_non_empty():
    assert len(KNOWN_FLAGS) >= 1


def test_for_you_v2_present():
    keys = {f.key for f in KNOWN_FLAGS}
    assert "for_you_v2" in keys


def test_flag_keys_unique():
    keys = [f.key for f in KNOWN_FLAGS]
    assert len(keys) == len(set(keys))


def test_flag_def_has_required_fields():
    for f in KNOWN_FLAGS:
        assert isinstance(f, FlagDef)
        assert f.key and f.key.replace("_", "").isalnum()
        assert f.description


def test_is_known_flag():
    assert is_known_flag("for_you_v2") is True
    assert is_known_flag("not_a_real_flag") is False
    assert is_known_flag("") is False
```

- [ ] **Step 2: Run the test, expect import error**

```bash
cd /Users/xuxueyang/Documents/GitHub/stock-agent/backend && source venv/bin/activate && \
  pytest tests/test_flags_registry.py -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'app.features.flags.registry'`.

- [ ] **Step 3: Create the registry module**

```python
# backend/app/features/flags/registry.py
"""Canonical registry of known feature flags.

This module is the single source of truth for which flag keys exist.
- Backend admin router validates POST bodies against this list.
- Frontend reads it via `GET /api/admin/flags` → `known_flags` to populate the dropdown.

When introducing a new flag, ADD A LINE HERE and follow
`docs/guides/feature-flags-playbook.md` for the integration / cleanup workflow.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class FlagDef:
    key: str
    description: str


KNOWN_FLAGS: list[FlagDef] = [
    FlagDef("for_you_v2", "新版专属页面（onboarding/portfolio/redesigned toolbar）"),
]


def is_known_flag(key: str) -> bool:
    return any(f.key == key for f in KNOWN_FLAGS)
```

- [ ] **Step 4: Run the test, expect pass**

```bash
pytest tests/test_flags_registry.py -v
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git -C /Users/xuxueyang/Documents/GitHub/stock-agent add \
  backend/app/features/flags/registry.py \
  backend/tests/test_flags_registry.py
git -C /Users/xuxueyang/Documents/GitHub/stock-agent commit -m "feat(flags): add KNOWN_FLAGS registry as single source of truth"
```

---

### Task 2: Extend the `feature-flags` Edge Function with admin actions

**Files:**
- Modify: `backend/app/edge_functions/feature-flags.js`

- [ ] **Step 1: Add `ok` / `err` helpers and admin actions while preserving existing GET behaviour**

Replace the file with this content (existing `list` / `check` logic kept verbatim; new actions appended; helper closures match `crm.js` style):

```javascript
// No import needed - createClient is injected by the Insforge worker template
module.exports = async function(request) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
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
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  function ok(data) {
    return new Response(JSON.stringify({ success: true, data }), { status: 200, headers: jsonHeaders });
  }
  function err(message, status = 400) {
    return new Response(JSON.stringify({ success: false, error: message }), { status, headers: jsonHeaders });
  }

  try {
    // GET ?action=list&user_id=xxx  (existing — per-user read)
    if (request.method === "GET" && action === "list") {
      const userId = url.searchParams.get("user_id");
      if (!userId) return err("user_id required");

      const { data, error } = await client.database
        .from("feature_flags")
        .select("flag")
        .eq("user_id", userId)
        .eq("enabled", true);

      if (error) return err(error.message, 500);
      return ok((data || []).map((row) => row.flag));
    }

    // GET ?action=check&user_id=xxx&flag=name  (existing — single flag check)
    if (request.method === "GET" && action === "check") {
      const userId = url.searchParams.get("user_id");
      const flag = url.searchParams.get("flag");
      if (!userId || !flag) return err("user_id and flag required");

      const { data, error } = await client.database
        .from("feature_flags")
        .select("enabled")
        .eq("user_id", userId)
        .eq("flag", flag)
        .maybeSingle();

      if (error) return err(error.message, 500);
      return ok({ enabled: data ? data.enabled === true : false });
    }

    // GET ?action=list_all[&flag=xxx]  (new — admin enumeration)
    if (request.method === "GET" && action === "list_all") {
      const flag = url.searchParams.get("flag");
      let query = client.database
        .from("feature_flags")
        .select("user_id, flag, enabled, created_at")
        .eq("enabled", true);
      if (flag) query = query.eq("flag", flag);
      const { data, error } = await query;
      if (error) return err(error.message, 500);
      return ok(data || []);
    }

    // POST ?action=upsert  body {user_id, flag, enabled?}
    if (request.method === "POST" && action === "upsert") {
      const body = await request.json();
      const { user_id, flag, enabled = true } = body || {};
      if (!user_id || !flag) return err("user_id and flag required");

      const { data, error } = await client.database
        .from("feature_flags")
        .upsert(
          { user_id, flag, enabled },
          { onConflict: "user_id,flag" }
        )
        .select()
        .single();

      if (error) return err(error.message, 500);
      return ok(data);
    }

    // DELETE ?action=delete&user_id=xxx&flag=xxx
    if (request.method === "DELETE" && action === "delete") {
      const userId = url.searchParams.get("user_id");
      const flag = url.searchParams.get("flag");
      if (!userId || !flag) return err("user_id and flag required");

      const { error } = await client.database
        .from("feature_flags")
        .delete()
        .eq("user_id", userId)
        .eq("flag", flag);

      if (error) return err(error.message, 500);
      return ok({ deleted: { user_id: userId, flag } });
    }

    return err("Invalid action");
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e), 500);
  }
}
```

- [ ] **Step 2: Lint-check via Node syntax parse**

```bash
cd /Users/xuxueyang/Documents/GitHub/stock-agent && node --check backend/app/edge_functions/feature-flags.js
```

Expected: no output (file parses cleanly).

- [ ] **Step 3: Commit**

```bash
git -C /Users/xuxueyang/Documents/GitHub/stock-agent add backend/app/edge_functions/feature-flags.js
git -C /Users/xuxueyang/Documents/GitHub/stock-agent commit -m "feat(flags): add list_all/upsert/delete admin actions to feature-flags EF"
```

- [ ] **Step 4: OPERATOR ACTION — deploy the EF**

> Manual deploy required. Replaces the existing function; read paths are byte-identical so nothing breaks if the new admin paths are unused.

```bash
cd /Users/xuxueyang/Documents/GitHub/stock-agent && \
  insforge functions deploy feature-flags --file backend/app/edge_functions/feature-flags.js
```

- [ ] **Step 5: Verify deploy via curl smoke tests**

Pull the Insforge base URL and anon key from `backend/.env`. Replace `<INSFORGE_URL>` / `<ANON>` below.

```bash
# Existing action still works:
curl -s "<INSFORGE_URL>/functions/feature-flags?action=list&user_id=nonexistent" \
  -H "apikey: <ANON>"
# Expected: {"success":true,"data":[]}

# New list_all (returns the existing for_you_v2 row(s)):
curl -s "<INSFORGE_URL>/functions/feature-flags?action=list_all&flag=for_you_v2" \
  -H "apikey: <ANON>"
# Expected: {"success":true,"data":[{"user_id":"...","flag":"for_you_v2","enabled":true,"created_at":"..."}]}
```

If `list_all` returns `Invalid action`, the deploy did not pick up — re-run Step 4 and confirm output mentions the new revision.

---

### Task 3: Extend `flags/db.py` with admin helpers

**Files:**
- Modify: `backend/app/features/flags/db.py`
- Create: `backend/tests/test_flags_db.py`

- [ ] **Step 1: Write failing tests for the new helpers**

```python
# backend/tests/test_flags_db.py
"""Unit tests for the admin write paths in app.features.flags.db."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.features.flags import db as flags_db


@pytest.mark.asyncio
async def test_list_all_assignments_no_filter():
    fake_service = MagicMock()
    fake_service.call_function = AsyncMock(return_value={
        "data": {"success": True, "data": [
            {"user_id": "u1", "flag": "for_you_v2", "enabled": True, "created_at": "2026-01-01"},
        ]},
    })
    with patch("app.features.flags.db.get_insforge_service", return_value=fake_service):
        result = await flags_db.list_all_assignments()
    assert result == [
        {"user_id": "u1", "flag": "for_you_v2", "enabled": True, "created_at": "2026-01-01"},
    ]
    fake_service.call_function.assert_awaited_once_with(
        "feature-flags",
        method="GET",
        params={"action": "list_all"},
    )


@pytest.mark.asyncio
async def test_list_all_assignments_with_flag_filter():
    fake_service = MagicMock()
    fake_service.call_function = AsyncMock(return_value={"data": {"success": True, "data": []}})
    with patch("app.features.flags.db.get_insforge_service", return_value=fake_service):
        await flags_db.list_all_assignments(flag="for_you_v2")
    fake_service.call_function.assert_awaited_once_with(
        "feature-flags",
        method="GET",
        params={"action": "list_all", "flag": "for_you_v2"},
    )


@pytest.mark.asyncio
async def test_upsert_assignment():
    fake_service = MagicMock()
    fake_service.call_function = AsyncMock(return_value={"data": {"success": True, "data": {"user_id": "u1", "flag": "for_you_v2", "enabled": True}}})
    with patch("app.features.flags.db.get_insforge_service", return_value=fake_service):
        result = await flags_db.upsert_assignment("u1", "for_you_v2")
    fake_service.call_function.assert_awaited_once_with(
        "feature-flags",
        method="POST",
        params={"action": "upsert"},
        json_body={"user_id": "u1", "flag": "for_you_v2", "enabled": True},
    )
    assert result["flag"] == "for_you_v2"


@pytest.mark.asyncio
async def test_delete_assignment():
    fake_service = MagicMock()
    fake_service.call_function = AsyncMock(return_value={"data": {"success": True, "data": {"deleted": {"user_id": "u1", "flag": "for_you_v2"}}}})
    with patch("app.features.flags.db.get_insforge_service", return_value=fake_service):
        result = await flags_db.delete_assignment("u1", "for_you_v2")
    fake_service.call_function.assert_awaited_once_with(
        "feature-flags",
        method="DELETE",
        params={"action": "delete", "user_id": "u1", "flag": "for_you_v2"},
    )
    assert result is True


@pytest.mark.asyncio
async def test_list_all_returns_empty_on_ef_failure():
    fake_service = MagicMock()
    fake_service.call_function = AsyncMock(return_value={"data": {"success": False, "error": "boom"}})
    with patch("app.features.flags.db.get_insforge_service", return_value=fake_service):
        result = await flags_db.list_all_assignments()
    assert result == []
```

- [ ] **Step 2: Run, expect failures (helpers undefined)**

```bash
pytest tests/test_flags_db.py -v
```

Expected: 5 failed with `AttributeError: module ... has no attribute 'list_all_assignments'` (and similar).

- [ ] **Step 3: Implement the helpers in `db.py`**

Append to `backend/app/features/flags/db.py` (keep `get_user_flags` exactly as it is):

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


# ─── Admin write helpers ────────────────────────────────────────────────────


async def list_all_assignments(flag: str | None = None) -> list[dict]:
    """List every enabled (user_id, flag) row, optionally filtered by flag key."""
    service = get_insforge_service()
    params: dict[str, str] = {"action": "list_all"}
    if flag:
        params["flag"] = flag
    result = await service.call_function(_FUNCTION, method="GET", params=params)
    data = result.get("data", {})
    if data.get("success"):
        return list(data.get("data") or [])
    logger.warning("feature-flags list_all failed (flag=%s): %s", flag, result)
    return []


async def upsert_assignment(user_id: str, flag: str, enabled: bool = True) -> dict:
    """Insert or update a flag assignment. Idempotent on (user_id, flag)."""
    service = get_insforge_service()
    result = await service.call_function(
        _FUNCTION,
        method="POST",
        params={"action": "upsert"},
        json_body={"user_id": user_id, "flag": flag, "enabled": enabled},
    )
    data = result.get("data", {})
    if not data.get("success"):
        logger.error("feature-flags upsert failed user=%s flag=%s: %s", user_id, flag, result)
        raise RuntimeError(data.get("error") or "upsert_assignment failed")
    return data.get("data") or {}


async def delete_assignment(user_id: str, flag: str) -> bool:
    """Delete a flag assignment. Idempotent — returns True even if row was absent."""
    service = get_insforge_service()
    result = await service.call_function(
        _FUNCTION,
        method="DELETE",
        params={"action": "delete", "user_id": user_id, "flag": flag},
    )
    data = result.get("data", {})
    if not data.get("success"):
        logger.error("feature-flags delete failed user=%s flag=%s: %s", user_id, flag, result)
        raise RuntimeError(data.get("error") or "delete_assignment failed")
    return True
```

- [ ] **Step 4: Run tests, expect pass**

```bash
pytest tests/test_flags_db.py -v
```

Expected: 5 passed.

- [ ] **Step 5: Add the write helpers to `DB_WRITE_FUNCTIONS` in conftest so unrelated tests can't pollute prod data**

In `backend/tests/conftest.py`, append two entries to the `DB_WRITE_FUNCTIONS` list (right before the closing `]`):

```python
    # Feature flags admin
    ("app.features.flags.db", "upsert_assignment"),
    ("app.features.flags.db", "delete_assignment"),
```

- [ ] **Step 6: Re-run the full suite to confirm no regressions**

```bash
pytest -x -q
```

Expected: green (or pre-existing failures only — verify by diffing against `pytest -x -q` on `origin/master`).

- [ ] **Step 7: Commit**

```bash
git -C /Users/xuxueyang/Documents/GitHub/stock-agent add \
  backend/app/features/flags/db.py \
  backend/tests/test_flags_db.py \
  backend/tests/conftest.py
git -C /Users/xuxueyang/Documents/GitHub/stock-agent commit -m "feat(flags): add list_all/upsert/delete db helpers + mock-write guards"
```

---

### Task 4: Build `admin_router.py`

**Files:**
- Create: `backend/app/features/flags/admin_router.py`
- Create: `backend/tests/test_flags_admin.py`

- [ ] **Step 1: Write the failing admin-router tests**

```python
# backend/tests/test_flags_admin.py
"""Tests for the /api/admin/flags router."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def admin_user():
    return {"user_id": "admin-1", "email": "xuxueyang1994@outlook.com"}


@pytest.fixture
def fake_subscriptions():
    """Mock `subscriptions list_all` -> 3 users."""
    return [
        {"user_id": "u1", "email": "alpha@voya.tech", "name": "Alpha", "plan": "pro"},
        {"user_id": "u2", "email": "beta@example.com", "name": "Beta", "plan": "max"},
        {"user_id": "u3", "email": "voyageur@example.com", "name": "Charlie", "plan": "free"},
    ]


@pytest.fixture
def fake_assignments():
    """Mock `list_all_assignments` -> u1 has for_you_v2, u3 has for_you_v2."""
    return [
        {"user_id": "u1", "flag": "for_you_v2", "enabled": True, "created_at": "2026-01-01"},
        {"user_id": "u3", "flag": "for_you_v2", "enabled": True, "created_at": "2026-01-02"},
    ]


@pytest.fixture
def client_with_admin(admin_user, fake_subscriptions):
    """TestClient with admin auth bypass + subscriptions.list_all mock."""
    from app.core import deps

    async def _admin():
        return admin_user

    app.dependency_overrides[deps.verify_admin_user] = _admin

    fake_service = MagicMock()
    fake_service.call_function = AsyncMock(return_value={
        "data": {"success": True, "data": fake_subscriptions}
    })
    with patch("app.features.flags.admin_router.get_insforge_service", return_value=fake_service):
        yield TestClient(app)
    app.dependency_overrides.clear()


def test_get_requires_admin():
    # Without override, hitting the endpoint with no auth header → 401
    with TestClient(app) as c:
        r = c.get("/api/admin/flags")
        assert r.status_code in (401, 403)


def test_get_returns_known_flags_and_assignments(client_with_admin, fake_assignments):
    with patch(
        "app.features.flags.admin_router.list_all_assignments",
        AsyncMock(return_value=fake_assignments),
    ):
        r = client_with_admin.get("/api/admin/flags")
    assert r.status_code == 200
    body = r.json()
    assert body["known_flags"][0]["key"] == "for_you_v2"
    rows = {row["user_id"]: row for row in body["assignments"]}
    assert rows["u1"]["flags"][0]["flag"] == "for_you_v2"
    assert rows["u2"]["flags"] == []
    assert rows["u3"]["flags"][0]["flag"] == "for_you_v2"


def test_get_email_filter(client_with_admin, fake_assignments):
    with patch(
        "app.features.flags.admin_router.list_all_assignments",
        AsyncMock(return_value=fake_assignments),
    ):
        r = client_with_admin.get("/api/admin/flags?email=voya")
    assert r.status_code == 200
    emails = sorted(row["email"] for row in r.json()["assignments"])
    # "voya" substring matches alpha@voya.tech and voyageur@example.com
    assert emails == ["alpha@voya.tech", "voyageur@example.com"]


def test_get_flag_filter_keeps_full_flags_per_user(client_with_admin, fake_assignments):
    # Even when filtering by flag, the returned users still carry their full flag list.
    with patch(
        "app.features.flags.admin_router.list_all_assignments",
        AsyncMock(return_value=fake_assignments),
    ):
        r = client_with_admin.get("/api/admin/flags?flag=for_you_v2")
    assert r.status_code == 200
    user_ids = sorted(row["user_id"] for row in r.json()["assignments"])
    assert user_ids == ["u1", "u3"]


def test_post_requires_known_flag(client_with_admin):
    with patch(
        "app.features.flags.admin_router.upsert_assignment",
        AsyncMock(return_value={"user_id": "u1", "flag": "for_you_v2"}),
    ) as up:
        bad = client_with_admin.post("/api/admin/flags", json={"user_id": "u1", "flag": "bogus"})
        assert bad.status_code == 422
        up.assert_not_awaited()

        good = client_with_admin.post("/api/admin/flags", json={"user_id": "u1", "flag": "for_you_v2"})
        assert good.status_code == 200
        up.assert_awaited_once_with("u1", "for_you_v2", True)


def test_delete_is_idempotent(client_with_admin):
    with patch(
        "app.features.flags.admin_router.delete_assignment",
        AsyncMock(return_value=True),
    ) as dl:
        r = client_with_admin.delete("/api/admin/flags?user_id=u1&flag=for_you_v2")
        assert r.status_code == 200
        dl.assert_awaited_once_with("u1", "for_you_v2")
```

- [ ] **Step 2: Run, expect failures (router missing)**

```bash
pytest tests/test_flags_admin.py -v
```

Expected: every test fails — either 404 from the test client or `ModuleNotFoundError` from the patch target.

- [ ] **Step 3: Implement `admin_router.py`**

```python
# backend/app/features/flags/admin_router.py
"""Admin write API for per-user feature flag assignments.

All routes require `verify_admin_user` (email must be in `ADMIN_EMAILS`).
"""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.core.database import get_insforge_service
from app.core.deps import verify_admin_user
from app.core.logging import get_logger
from app.features.flags.db import (
    delete_assignment,
    list_all_assignments,
    upsert_assignment,
)
from app.features.flags.registry import KNOWN_FLAGS, is_known_flag

logger = get_logger(__name__)

router = APIRouter(
    prefix="/api/admin/flags",
    tags=["admin-flags"],
    dependencies=[Depends(verify_admin_user)],
)


class UpsertBody(BaseModel):
    user_id: str
    flag: str
    enabled: bool = True


async def _load_subscriptions() -> list[dict[str, Any]]:
    service = get_insforge_service()
    result = await service.call_function(
        "subscriptions",
        method="GET",
        params={"action": "list_all"},
        timeout=60.0,
    )
    data = result.get("data", {})
    if not data.get("success"):
        logger.error("subscriptions.list_all failed: %s", result)
        raise HTTPException(status_code=502, detail="Failed to load user roster")
    return list(data.get("data") or [])


@router.get("")
async def list_flags(
    email: str | None = Query(None, description="Case-insensitive email substring filter"),
    flag: str | None = Query(None, description="Limit to users who have this flag"),
):
    if flag and not is_known_flag(flag):
        raise HTTPException(status_code=422, detail=f"Unknown flag '{flag}'")

    users = await _load_subscriptions()
    assignments = await list_all_assignments()  # always fetch all; filter in-memory

    by_user: dict[str, list[dict[str, Any]]] = {}
    for a in assignments:
        if not a.get("enabled"):
            continue
        by_user.setdefault(a["user_id"], []).append({
            "flag": a["flag"],
            "created_at": a.get("created_at"),
        })

    rows: list[dict[str, Any]] = []
    for u in users:
        rows.append({
            "user_id": u.get("user_id"),
            "email": u.get("email"),
            "name": u.get("name"),
            "plan": u.get("plan"),
            "flags": by_user.get(u.get("user_id"), []),
        })

    if email:
        needle = email.lower()
        rows = [r for r in rows if needle in (r.get("email") or "").lower()]
    if flag:
        rows = [r for r in rows if any(f["flag"] == flag for f in r["flags"])]

    return {
        "known_flags": [{"key": f.key, "description": f.description} for f in KNOWN_FLAGS],
        "assignments": rows,
    }


@router.post("")
async def grant_flag(body: UpsertBody):
    if not is_known_flag(body.flag):
        raise HTTPException(status_code=422, detail=f"Unknown flag '{body.flag}'")
    record = await upsert_assignment(body.user_id, body.flag, body.enabled)
    return {"ok": True, "record": record}


@router.delete("")
async def revoke_flag(
    user_id: str = Query(..., min_length=1),
    flag: str = Query(..., min_length=1),
):
    if not is_known_flag(flag):
        raise HTTPException(status_code=422, detail=f"Unknown flag '{flag}'")
    await delete_assignment(user_id, flag)
    return {"ok": True}
```

- [ ] **Step 4: Run, expect pass**

```bash
pytest tests/test_flags_admin.py -v
```

Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git -C /Users/xuxueyang/Documents/GitHub/stock-agent add \
  backend/app/features/flags/admin_router.py \
  backend/tests/test_flags_admin.py
git -C /Users/xuxueyang/Documents/GitHub/stock-agent commit -m "feat(flags): /api/admin/flags router with GET/POST/DELETE + tests"
```

---

### Task 5: Wire the router into `main.py`

**Files:**
- Modify: `backend/app/main.py` (around line 137 imports + line 164 include block)

- [ ] **Step 1: Add the import next to existing flags import**

In `backend/app/main.py`, locate the line:

```python
from app.features.flags.router import router as flags_router
```

Add directly below it:

```python
from app.features.flags.admin_router import router as flags_admin_router
```

- [ ] **Step 2: Add the `include_router` call**

After:

```python
app.include_router(flags_router)
```

Add:

```python
app.include_router(flags_admin_router)
```

- [ ] **Step 3: Verify import + route is wired**

```bash
cd /Users/xuxueyang/Documents/GitHub/stock-agent/backend && source venv/bin/activate && \
  python -c "from app.main import app; print(sorted(r.path for r in app.routes if '/admin/flags' in r.path))"
```

Expected: `['/api/admin/flags', '/api/admin/flags', '/api/admin/flags']` (one per method) or similar — three entries with the same path.

- [ ] **Step 4: Commit**

```bash
git -C /Users/xuxueyang/Documents/GitHub/stock-agent add backend/app/main.py
git -C /Users/xuxueyang/Documents/GitHub/stock-agent commit -m "feat(flags): register admin flags router"
```

---

### Task 6: Backend end-to-end smoke test against dev server

- [ ] **Step 1: Start the backend**

Terminal A:

```bash
cd /Users/xuxueyang/Documents/GitHub/stock-agent/backend && \
  source venv/bin/activate && uvicorn app.main:app --reload
```

Wait for `Uvicorn running on http://127.0.0.1:8000`.

- [ ] **Step 2: Grab an admin access token**

Sign in at `http://localhost:3000` (or via curl `/api/auth/...`) with `xuxueyang1994@outlook.com`. Copy the access token from the cookie or DevTools (`accessToken`).

```bash
export TOKEN="<paste-here>"
```

- [ ] **Step 3: GET (no filter)**

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/admin/flags | jq '.known_flags, (.assignments | length)'
```

Expected: `known_flags` lists `for_you_v2`, and `assignments` length matches the user roster.

- [ ] **Step 4: GET (email filter)**

```bash
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:8000/api/admin/flags?email=voya" | jq '.assignments[].email'
```

Expected: only emails containing `voya`.

- [ ] **Step 5: POST + DELETE round-trip on a test user**

```bash
TEST_UID="<insforge-user-uuid-NOT-yourself>"

# Add the flag
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"user_id\":\"$TEST_UID\",\"flag\":\"for_you_v2\"}" \
  http://localhost:8000/api/admin/flags

# Verify it shows up
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:8000/api/admin/flags?flag=for_you_v2" \
  | jq ".assignments[] | select(.user_id==\"$TEST_UID\")"

# Remove it
curl -s -X DELETE -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/admin/flags?user_id=$TEST_UID&flag=for_you_v2"
```

Expected: each call returns `{"ok": true, ...}`, and the row appears and disappears in the verification query.

- [ ] **Step 6: Negative test — non-admin token**

Sign in as `voya.technologies@gmail.com` (not in `ADMIN_EMAILS`), grab the token, and run:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $NONADMIN" http://localhost:8000/api/admin/flags
```

Expected: `403`.

---

### Task 7: Frontend page shell — `app/admin/flags/page.tsx`

**Files:**
- Create: `frontend/src/app/admin/flags/page.tsx`

- [ ] **Step 1: Create the server component**

```tsx
// frontend/src/app/admin/flags/page.tsx
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getAuthCookies } from '@/lib/auth-cookies';
import { FlagsAdminPanel, type FlagsAdminData } from './_components/FlagsAdminPanel';

export const dynamic = 'force-dynamic';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api';

export const metadata: Metadata = {
  title: 'Feature Flags · Admin',
  robots: { index: false, follow: false },
};

async function getValidAccessToken(): Promise<string | null> {
  const { accessToken, refreshToken } = await getAuthCookies();
  if (accessToken) return accessToken;
  if (!refreshToken) return null;
  const { createServerClient } = await import('@/lib/insforge-server');
  try {
    const client = createServerClient();
    const { data } = await client.auth.refreshSession({ refreshToken });
    if (data?.accessToken) {
      const { setAuthCookies } = await import('@/lib/auth-cookies');
      await setAuthCookies(data.accessToken, data.refreshToken);
      return data.accessToken;
    }
  } catch { /* refresh failed */ }
  return null;
}

async function getInitialData(accessToken: string): Promise<FlagsAdminData | null> {
  try {
    const res = await fetch(`${API_BASE}/admin/flags`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });
    if (res.status === 401 || res.status === 403) return null;
    if (!res.ok) return null;
    return (await res.json()) as FlagsAdminData;
  } catch {
    return null;
  }
}

export default async function FlagsAdminPage() {
  const token = await getValidAccessToken();
  if (!token) notFound();

  const data = await getInitialData(token);
  if (!data) notFound();

  return <FlagsAdminPanel initialData={data} accessToken={token} />;
}
```

- [ ] **Step 2: Verify TypeScript compiles (will fail until the panel exists — expected)**

```bash
cd /Users/xuxueyang/Documents/GitHub/stock-agent/frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: errors about missing `./_components/FlagsAdminPanel`. We'll fix in the next task.

---

### Task 8: Frontend panel — `FlagsAdminPanel.tsx`

**Files:**
- Create: `frontend/src/app/admin/flags/_components/FlagsAdminPanel.tsx`

- [ ] **Step 1: Implement the client component**

```tsx
'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { getAccessTokenAsync, getAccessTokenSync } from '@/contexts/AuthContext';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api';

export interface KnownFlag {
  key: string;
  description: string;
}

export interface FlagsAdminRow {
  user_id: string;
  email: string | null;
  name: string | null;
  plan: string | null;
  flags: { flag: string; created_at: string | null }[];
}

export interface FlagsAdminData {
  known_flags: KnownFlag[];
  assignments: FlagsAdminRow[];
}

interface Props {
  initialData: FlagsAdminData;
  accessToken: string;
}

export function FlagsAdminPanel({ initialData, accessToken: _initialToken }: Props) {
  const [data, setData] = useState<FlagsAdminData>(initialData);
  const [emailSearch, setEmailSearch] = useState('');
  const [flagFilter, setFlagFilter] = useState<string>('');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const knownFlags = data.known_flags;

  const refresh = useCallback(async (email: string, flag: string) => {
    const token = getAccessTokenSync() ?? (await getAccessTokenAsync());
    if (!token) return;
    const qs = new URLSearchParams();
    if (email.trim()) qs.set('email', email.trim());
    if (flag) qs.set('flag', flag);
    const res = await fetch(`${API_BASE}/admin/flags?${qs}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (res.ok) {
      const next = (await res.json()) as FlagsAdminData;
      setData(next);
      setError(null);
    } else {
      setError(`刷新失败: HTTP ${res.status}`);
    }
  }, []);

  // Debounced email search
  const onEmailChange = useCallback((value: string) => {
    setEmailSearch(value);
    const handle = setTimeout(() => { void refresh(value, flagFilter); }, 300);
    return () => clearTimeout(handle);
  }, [refresh, flagFilter]);

  const onFlagFilterChange = useCallback((value: string) => {
    setFlagFilter(value);
    void refresh(emailSearch, value);
  }, [emailSearch, refresh]);

  const grantFlag = useCallback(async (userId: string, flag: string) => {
    setBusyKey(`${userId}:${flag}:add`);
    setError(null);
    try {
      const token = getAccessTokenSync() ?? (await getAccessTokenAsync());
      if (!token) return;
      const res = await fetch(`${API_BASE}/admin/flags`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, flag }),
      });
      if (!res.ok) {
        const text = await res.text();
        setError(`添加失败: ${text}`);
        return;
      }
      // Optimistic update
      setData((prev) => ({
        ...prev,
        assignments: prev.assignments.map((row) =>
          row.user_id === userId && !row.flags.some((f) => f.flag === flag)
            ? { ...row, flags: [...row.flags, { flag, created_at: new Date().toISOString() }] }
            : row,
        ),
      }));
      // Then re-fetch for canonical state
      await refresh(emailSearch, flagFilter);
    } finally {
      setBusyKey(null);
    }
  }, [emailSearch, flagFilter, refresh]);

  const revokeFlag = useCallback(async (userId: string, flag: string) => {
    if (!window.confirm(`确认移除用户 ${userId.slice(0, 8)}… 的 "${flag}" 灰度？`)) return;
    setBusyKey(`${userId}:${flag}:del`);
    setError(null);
    try {
      const token = getAccessTokenSync() ?? (await getAccessTokenAsync());
      if (!token) return;
      const qs = new URLSearchParams({ user_id: userId, flag });
      const res = await fetch(`${API_BASE}/admin/flags?${qs}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setError(`移除失败: HTTP ${res.status}`);
        return;
      }
      // Optimistic update
      setData((prev) => ({
        ...prev,
        assignments: prev.assignments.map((row) =>
          row.user_id === userId
            ? { ...row, flags: row.flags.filter((f) => f.flag !== flag) }
            : row,
        ),
      }));
      await refresh(emailSearch, flagFilter);
    } finally {
      setBusyKey(null);
    }
  }, [emailSearch, flagFilter, refresh]);

  const rows = data.assignments;
  const totalUsersWithFlag = useMemo(() => {
    if (!flagFilter) return rows.length;
    return rows.filter((r) => r.flags.some((f) => f.flag === flagFilter)).length;
  }, [rows, flagFilter]);

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link href="/admin" className="text-sm text-muted-foreground hover:text-primary">
              ← 返回 Admin
            </Link>
            <h1 className="mt-2 text-2xl md:text-3xl font-editorial text-foreground">灰度管理</h1>
            <p className="text-sm text-muted-foreground mt-1">
              共 {rows.length} 用户 · 命中筛选 {totalUsersWithFlag}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-4">
          <input
            type="search"
            placeholder="搜索邮箱（子串）"
            value={emailSearch}
            onChange={(e) => onEmailChange(e.target.value)}
            className="px-3 py-2 rounded-lg border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 min-w-[260px]"
          />
          <select
            value={flagFilter}
            onChange={(e) => onFlagFilterChange(e.target.value)}
            className="px-3 py-2 rounded-lg border border-border bg-card text-sm text-foreground"
          >
            <option value="">所有 flag</option>
            {knownFlags.map((f) => (
              <option key={f.key} value={f.key}>{f.key}</option>
            ))}
          </select>
        </div>

        {error && (
          <div className="mb-4 px-3 py-2 rounded-lg border border-red-500/30 bg-red-500/10 text-sm text-red-400">
            {error}
          </div>
        )}

        <div className="rounded-xl border border-border/60 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-card/40 text-muted-foreground text-xs uppercase tracking-wide">
              <tr>
                <th className="px-3 py-2 text-left">Email</th>
                <th className="px-3 py-2 text-left">姓名</th>
                <th className="px-3 py-2 text-left">Plan</th>
                <th className="px-3 py-2 text-left">已开通的 Flags</th>
                <th className="px-3 py-2 text-left">添加</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <FlagsRow
                  key={row.user_id}
                  row={row}
                  knownFlags={knownFlags}
                  busyKey={busyKey}
                  onGrant={grantFlag}
                  onRevoke={revokeFlag}
                />
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">无匹配用户</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

interface RowProps {
  row: FlagsAdminRow;
  knownFlags: KnownFlag[];
  busyKey: string | null;
  onGrant: (userId: string, flag: string) => void;
  onRevoke: (userId: string, flag: string) => void;
}

function FlagsRow({ row, knownFlags, busyKey, onGrant, onRevoke }: RowProps) {
  const [draftFlag, setDraftFlag] = useState<string>('');
  const availableFlags = knownFlags.filter((f) => !row.flags.some((rf) => rf.flag === f.key));

  return (
    <tr className="border-t border-border/40">
      <td className="px-3 py-2 text-foreground">{row.email ?? '—'}</td>
      <td className="px-3 py-2 text-muted-foreground">{row.name ?? '—'}</td>
      <td className="px-3 py-2 text-muted-foreground">{row.plan ?? '—'}</td>
      <td className="px-3 py-2">
        {row.flags.length === 0 && <span className="text-muted-foreground text-xs">无</span>}
        <div className="flex flex-wrap gap-1.5">
          {row.flags.map((f) => {
            const key = `${row.user_id}:${f.flag}:del`;
            return (
              <button
                key={f.flag}
                type="button"
                onClick={() => onRevoke(row.user_id, f.flag)}
                disabled={busyKey === key}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-primary/30 bg-primary/10 text-xs text-primary hover:bg-primary/20 disabled:opacity-50"
                title="点击移除"
              >
                {f.flag}
                <span aria-hidden className="text-primary/70">×</span>
              </button>
            );
          })}
        </div>
      </td>
      <td className="px-3 py-2">
        {availableFlags.length === 0 ? (
          <span className="text-muted-foreground text-xs">全部已开通</span>
        ) : (
          <div className="flex items-center gap-2">
            <select
              value={draftFlag}
              onChange={(e) => setDraftFlag(e.target.value)}
              className="px-2 py-1 rounded-md border border-border bg-background text-xs"
            >
              <option value="">选择 flag…</option>
              {availableFlags.map((f) => (
                <option key={f.key} value={f.key}>{f.key}</option>
              ))}
            </select>
            <button
              type="button"
              disabled={!draftFlag || busyKey === `${row.user_id}:${draftFlag}:add`}
              onClick={() => { onGrant(row.user_id, draftFlag); setDraftFlag(''); }}
              className="px-2 py-1 rounded-md bg-primary text-primary-foreground text-xs disabled:opacity-50"
            >
              + 添加
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}
```

- [ ] **Step 2: TypeScript + lint sweep**

```bash
cd /Users/xuxueyang/Documents/GitHub/stock-agent/frontend && npx tsc --noEmit && npm run lint
```

Expected: zero errors, no new lint warnings.

- [ ] **Step 3: Commit**

```bash
git -C /Users/xuxueyang/Documents/GitHub/stock-agent add frontend/src/app/admin/flags
git -C /Users/xuxueyang/Documents/GitHub/stock-agent commit -m "feat(flags): /admin/flags page + FlagsAdminPanel UI"
```

---

### Task 9: Surface the entry in `AdminDashboard.tsx`

**Files:**
- Modify: `frontend/src/app/admin/_components/AdminDashboard.tsx`

- [ ] **Step 1: Locate the page header**

Open the file, find the top-level header section that renders the dashboard title (search for "Admin" or summary cards near the top of the rendered JSX). The exact line will vary as the file evolves, so identify the right insertion point visually — somewhere alongside other header links or near the top toolbar.

- [ ] **Step 2: Add a `<Link>` near the header**

Insert:

```tsx
<Link
  href="/admin/flags"
  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
>
  灰度管理 →
</Link>
```

Make sure `import Link from 'next/link';` exists at the top — it should already be there. Place the link where it fits the existing header style (near the page title or in a corner of the toolbar).

- [ ] **Step 3: Verify build + lint**

```bash
cd /Users/xuxueyang/Documents/GitHub/stock-agent/frontend && npx tsc --noEmit && npm run lint
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git -C /Users/xuxueyang/Documents/GitHub/stock-agent add frontend/src/app/admin/_components/AdminDashboard.tsx
git -C /Users/xuxueyang/Documents/GitHub/stock-agent commit -m "feat(admin): add 灰度管理 entry link to AdminDashboard"
```

---

### Task 10: Manual UI verification

- [ ] **Step 1: Run both servers**

Terminal A:
```bash
cd /Users/xuxueyang/Documents/GitHub/stock-agent/backend && source venv/bin/activate && uvicorn app.main:app --reload
```

Terminal B:
```bash
cd /Users/xuxueyang/Documents/GitHub/stock-agent/frontend && npm run dev
```

- [ ] **Step 2: Walk the happy path in the browser**

1. Sign in at `http://localhost:3000` as `xuxueyang1994@outlook.com`.
2. Open `/admin` — confirm the new "灰度管理 →" link is visible.
3. Click it; you should land on `/admin/flags` and see:
   - Header "灰度管理" with user counts.
   - Email search input and flag filter `<select>`.
   - One table row per user, with flag chips for any user already flagged into `for_you_v2`.
4. **Search**: type `voya` → list narrows to matching emails within ~300 ms.
5. **Filter**: pick `for_you_v2` → only the users with that flag remain.
6. **Add**: pick a row without `for_you_v2`, select it from the row's "添加" dropdown, click `+ 添加`. The chip appears immediately. Refresh the page → chip persists.
7. **Remove**: click `×` on a flag chip → confirm dialog → chip disappears. Refresh → still gone.

- [ ] **Step 3: Negative paths**

1. Sign in as `voya.technologies@gmail.com` (non-admin), visit `/admin/flags` → expect `notFound()` (matches `/admin` behaviour).
2. Sign out completely, visit `/admin/flags` → expect `notFound()`.

- [ ] **Step 4: Cross-flow regression**

Sign in as a user whose flag you just added through the UI, visit `/for-you` → confirm V2 experience renders (the read path `GET /api/flags` still works through the unchanged EF actions).

- [ ] **Step 5: Build**

```bash
cd /Users/xuxueyang/Documents/GitHub/stock-agent/frontend && npm run build
```

Expected: build succeeds with no new errors.

- [ ] **Step 6: Run frontend tests**

```bash
cd /Users/xuxueyang/Documents/GitHub/stock-agent/frontend && npm test -- --run
```

Expected: existing tests (Navbar/MobileMenu using `useFeatureFlags`) still pass.

---

### Task 11: Update module context + ship the playbook

**Files:**
- Modify: `backend/app/features/flags/.context.md`
- Create: `docs/guides/feature-flags-playbook.md`

- [ ] **Step 1: Patch the flags `.context.md`**

Edit `backend/app/features/flags/.context.md`:

1. Replace the "Architecture" section with:

```markdown
## Architecture

`feature_flags` table (Insforge) → `feature-flags.js` Edge Function → `db.py` →
two routers: `router.py` (`GET /api/flags`, user-side read) and
`admin_router.py` (`GET/POST/DELETE /api/admin/flags`, admin-only write).

The flag list is **registered in code**, not the DB: `registry.py::KNOWN_FLAGS`
is the single source of truth. Both the admin UI dropdown and server-side
validation read from it. Adding/retiring flags: see
[../../../docs/guides/feature-flags-playbook.md](../../../docs/guides/feature-flags-playbook.md).
```

2. Update "Key Constraints" — remove the "read-only" statement, add:

```markdown
- Writes are restricted to `verify_admin_user` callers via `/api/admin/flags`.
- Manual SQL in Insforge Dashboard remains a fallback but is discouraged — the
  admin UI catches typos against `KNOWN_FLAGS`.
```

3. Append to "Current Flags" table a hint: `*Add new flags in registry.py.*`

- [ ] **Step 2: Write the playbook**

The playbook content has already been authored at `docs/guides/feature-flags-playbook.md` (delivered alongside this plan). Verify it exists and review for any project-specific tweaks:

```bash
ls -la /Users/xuxueyang/Documents/GitHub/stock-agent/docs/guides/feature-flags-playbook.md
head -40 /Users/xuxueyang/Documents/GitHub/stock-agent/docs/guides/feature-flags-playbook.md
```

If it's missing (e.g. cherry-pick to a fresh branch lost it), regenerate by following the structure documented in this plan's "Companion deliverable" section: 7 sections covering When to use → Mental model → Integration steps → Cleanup checklist → Anti-patterns → Troubleshooting → File map.

- [ ] **Step 3: Commit**

```bash
git -C /Users/xuxueyang/Documents/GitHub/stock-agent add \
  backend/app/features/flags/.context.md \
  docs/guides/feature-flags-playbook.md
git -C /Users/xuxueyang/Documents/GitHub/stock-agent commit -m "docs(flags): admin write path + reusable feature-flags playbook"
```

---

### Task 12: Deployment

> Backend and frontend are deployed independently. EF was already deployed in Task 2 Step 4.

- [ ] **Step 1: Open a PR against `master`**

```bash
git -C /Users/xuxueyang/Documents/GitHub/stock-agent push -u origin feat/admin-feature-flags-console
gh pr create --base master --title "feat(flags): admin feature-flags console" --body "$(cat <<'EOF'
## Summary
- New `/admin/flags` page lets admins search, grant, and revoke per-user feature flags without SQL.
- Backend: `/api/admin/flags` (GET/POST/DELETE) + extended `feature-flags` EF + `KNOWN_FLAGS` registry.
- Docs: feature-flag playbook covering integration + cleanup workflows.

## Test plan
- [ ] `pytest backend/tests/test_flags_registry.py backend/tests/test_flags_db.py backend/tests/test_flags_admin.py -v`
- [ ] Manual: grant + revoke `for_you_v2` against a non-admin test account through `/admin/flags`
- [ ] Manual: signed-out and non-admin sessions hit `notFound()` on `/admin/flags`
- [ ] Read regression: another user with `for_you_v2` still sees V2 `/for-you`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 2: CI verification**

Wait for the project's CI workflows (frontend lint/build + backend pytest + Insforge function checks) to go green. If any check fails, fix in this branch — do not bypass.

- [ ] **Step 3: Merge + verify production**

After merge to `master`:

1. Confirm the production deploy pipeline succeeds.
2. In production, sign in as admin → `/admin/flags`. Repeat Task 10 Step 2 happy path, but for **read-only** verification first (no writes). Then perform a single grant + revoke against a known internal test user.
3. Verify the unrelated read path is still healthy: another flagged user's `/for-you` still renders V2.

- [ ] **Step 4: Rollback plan (documented; do not execute unless needed)**

- Frontend regression: revert the merge commit; CI redeploys instantly.
- Backend regression: revert the merge commit; restart uvicorn / redeploy.
- EF regression: redeploy the prior revision via `insforge functions deploy feature-flags` from the `master~1` checkout.
- Data: writes only touch `feature_flags`; rows can be deleted with `DELETE FROM feature_flags WHERE flag = '<key>';` if a runaway grant happens.

---

## Self-review checklist (run before opening PR)

1. **Spec coverage**: every section of `docs/plans/active/2026-05-12-admin-feature-flags.md` is implemented (registry ✅, EF actions ✅, db helpers ✅, admin router ✅, page + panel ✅, AdminDashboard link ✅, tests ✅, context updates ✅).
2. **No placeholders**: every step shows the exact code/command to run.
3. **Type / name consistency**: `KNOWN_FLAGS`, `is_known_flag`, `FlagsAdminData`, `list_all_assignments`, `upsert_assignment`, `delete_assignment` are spelled the same across backend, tests, and frontend types.
4. **No accidental admin escape**: the only path that calls `upsert_assignment` / `delete_assignment` is the `verify_admin_user`-gated router (grep `upsert_assignment` to confirm).

---

## Companion deliverable: Feature Flag Playbook

`docs/guides/feature-flags-playbook.md` is shipped together with this plan. It is the long-lived reference for **every future flag** the team introduces and should be the first link in any new feature-flag PR description. Structure:

1. **When to use / not use** a feature flag.
2. **Mental model** — registry → DB → EF → admin UI / hook.
3. **Step-by-step integration** (registry → backend branch → frontend branch → route guard → nav → roster mgmt → tests → PR template).
4. **Cleanup checklist** (preconditions → 6 ordered steps + verification → retirement PR template).
5. **Anti-patterns** to flag in code review.
6. **Troubleshooting** table for common runtime issues.
7. **File map** for newcomers.

If the playbook structure ever changes (new front-end framework, different admin UX, etc.), update both the playbook and this plan's File Map.

---

## Plan complete

**Plan saved to:** `docs/superpowers/plans/2026-05-13-admin-feature-flags-console.md`
**Playbook saved to:** `docs/guides/feature-flags-playbook.md`

Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task with two-stage review between tasks. Fast iteration, clean checkpoints.
2. **Inline Execution** — I execute tasks in this session using superpowers:executing-plans, with batch checkpoints for your review.

Which approach?
