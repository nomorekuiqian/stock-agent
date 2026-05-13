# V2 Round 2 — Hardening Fix Plan (Revised)

**Status:** Revised after independent audit surfaced 4 blockers. This version is APPROVED-READY.

**Context:** Four issues flagged in high-intensity review of `claude/for-you-v2-round2`. Each was independently verified against the code. Auditor found additional issues with v1 of this plan; this revision addresses all of them.

**Branch:** `claude/for-you-v2-round2`
**Worktree:** `/Users/xuxueyang/Documents/GitHub/stock-agent/.worktrees/for-you-v2-round2`

---

## Verdict on original 4 issues

| # | Reviewer claim | Verdict | Root cause | Fix |
|---|----|---|---|---|
| 1 | "N+1 reverse-optimization lands on V2" | **Rejected premise, accepted spirit** | `previous_digest_dates` is never in `save_data` or `DigestResponse`, so the `if not previous_digest_dates:` branch was always True. Not actually an N+1 today, but the fragile branching invites future regression. | Unconditional `cached_recent` fetch |
| 2 | "`_resolve` short-circuits without DB fallthrough" | **Accepted (real, bounded today)** | `return None` inside loop body never falls through. Also — auditor caught — `resolve_digest_id_by_date` itself only queries `limit=30`, so the fallthrough was a no-op anyway. | Fix loop logic to `continue` on ambiguous matches, then fall through to DB. **Also upgrade `resolve_digest_id_by_date` to query by a larger/unbounded limit**, otherwise fallthrough buys nothing. |
| 3 | "Agent vs Service thesis whitespace divergence" | **Accepted** | Agent uses `not (thesis or "").strip()`, service uses `not getattr(h, "thesis", None)`. `"   "` passes one but not the other. | Apply `.strip()` coercion at service layer. |
| 4 | "LLM could return action_items as dict → iteration yields keys" | **Accepted** | Python iterates dict keys. Pydantic validates fresh path via `PersonalDigestOutput`, but cache path in router.py reads raw JSON and is unprotected. | Type-coerce dict→list at both read sites. |

## New issue #5 surfaced by audit

**Persistence gap:** `backend/app/features/brew/db.py:87-92` (`save_user_digest`) drops `action_items` and `portfolio_summary` from the persisted `digest_data` blob. Consequence:
- **Fresh request** → router returns `action_items` (wired in Task 2 of round2). Works.
- **Cache-hit request** (same day, second visit) → `get_user_digest` returns a blob that never had `action_items`. Router reads `.get("action_items") or []` → empty list → **Action Bar always hidden on cache hits**.

This makes the entire round-2 action-bar feature appear broken in production after the first page load. **Must fix as part of this hardening pass.**

**Fix:** Update `save_user_digest` to include `action_items` and `portfolio_summary` in the persisted `digest_data` dict. No schema change at Insforge level needed — `digest_data` is a JSONB column that accepts arbitrary shape.

---

## Goal

Make the full action-bar pipeline robust against four edge cases **and** close the persistence gap so the feature actually works in production.

---

## File Structure

**Modify (existing):**
- `backend/app/features/brew/db.py` — `save_user_digest` persistence fix (Task 5, new)
- `backend/app/features/brew/router.py` — cache-hit + fresh-path dict coercion (Task 3 Sites 2+3)
- `backend/app/features/for_you/service.py` — all three service-layer fixes (Tasks 1, 2, 3 Site 1)
- `backend/app/features/brew/db.py` — `resolve_digest_id_by_date` limit upgrade (Task 1.5)
- `backend/tests/test_action_bar.py` — 3 regression tests
- `backend/tests/test_brew_router_unit.py` — 1 regression test (cache-hit dict coercion)
- `backend/tests/test_brew_db_unit.py` — 2 regression tests (persistence round-trip + resolver after limit bump)

**No new files. No frontend touched. No external-service actions.**

---

## Task 1 — Unconditional `cached_recent` + corrected `_resolve` fallthrough

**File:** `backend/app/features/for_you/service.py` (replace lines 176-199)

### Current (actually running code):

```python
    previous_digest_dates = set((digest_data or {}).get("previous_digest_dates", []) or [])

    cached_recent: list[dict] | None = None
    if not previous_digest_dates:
        try:
            cached_recent = await brew_db.list_user_digests(user_id, limit=30)
            previous_digest_dates = {(d.get("digest_date") or "")[:10] for d in cached_recent}
        except Exception:
            cached_recent = None

    async def _resolve(date: str) -> str | None:
        if cached_recent is not None:
            target = date[:10]
            for d in cached_recent:
                if (d.get("digest_date") or "")[:10] == target:
                    return d.get("digest_id") or d.get("id")
            return None  # ← BUG: returns None even if we should fall through
        try:
            return await brew_db.resolve_digest_id_by_date(user_id, date)
        except Exception:
            return None
```

### New code:

```python
    # Build the authoritative date whitelist AND a memoized row cache in one
    # fetch. Previously this branched on whether digest_data carried
    # `previous_digest_dates`, but that field is never persisted — so the
    # branch was always falsy. Making the fetch unconditional prevents
    # accidental N+1 regression if someone later adds that field to save_data.
    cached_recent: list[dict] = []
    try:
        cached_recent = await brew_db.list_user_digests(user_id, limit=30)
    except Exception:
        logger.warning("action_bar: list_user_digests failed user=%s", user_id[:8])
    previous_digest_dates = {
        (d.get("digest_date") or "")[:10]
        for d in cached_recent
        if d.get("digest_date")
    }

    async def _resolve(date: str) -> str | None:
        """Two-tier lookup:
          1. Scan in-memory `cached_recent` for a row with matching date AND
             a usable id (digest_id or id key).
          2. If the loop exits without returning, fall through to a deeper
             DB query (which may use a larger limit or a direct WHERE query).
        The previous implementation returned None inside the loop when it
        found a date match but the row lacked an id, instead of trying the
        DB. This is the fallthrough fix.
        """
        target = date[:10]
        for d in cached_recent:
            if (d.get("digest_date") or "")[:10] != target:
                continue
            found = d.get("digest_id") or d.get("id")
            if found:
                return found
            # Date matches but id missing — don't give up yet; the DB may have
            # a more complete record. Break (we know only one row per date).
            break
        # Fallthrough: date not in cached_recent, OR cached row had no id.
        try:
            return await brew_db.resolve_digest_id_by_date(user_id, date)
        except Exception:
            return None
```

**Behavior changes:**
- `cached_recent` is always populated (to `[]` on failure, not `None`). Removes the null-check complexity in `_resolve`.
- `_resolve` no longer short-circuits with `None` on partial match — it `break`s and falls through.
- `previous_digest_dates` is always derived from the same source of truth.

---

## Task 1.5 — Upgrade `resolve_digest_id_by_date` to broader query

**File:** `backend/app/features/brew/db.py`

**Rationale:** Auditor caught that `resolve_digest_id_by_date` internally just calls `list_user_digests(user_id, limit=30)` — same window that already populated `cached_recent`. Falling through to it buys nothing operationally. Either upgrade this function to query unbounded (or to a higher limit), OR document the fallthrough as defensive-only with a comment.

**Decision:** Bump the internal `limit` from 30 to 180 (six months of digests). This keeps the function bounded for safety but lets LLM references up to ~6 months back still resolve via fallthrough.

### Current (db.py:357-369):

```python
async def resolve_digest_id_by_date(user_id: str, date: str) -> Optional[str]:
    """Resolve a YYYY-MM-DD date into the user's digest UUID, if one exists.

    Used by action_items validator to rewrite digest:<DATE> → digest:<uuid>
    before exposing action chips to the frontend.
    """
    target = date[:10]
    digests = await list_user_digests(user_id, limit=30)
    for d in digests:
        raw = (d.get("digest_date") or "")[:10]
        if raw == target:
            return d.get("digest_id") or d.get("id")
    return None
```

### New:

```python
async def resolve_digest_id_by_date(user_id: str, date: str) -> Optional[str]:
    """Resolve a YYYY-MM-DD date into the user's digest UUID, if one exists.

    Used by action_items validator as the fallback path when an in-memory
    cache (limit=30) misses. The broader limit lets LLM references up to
    six months back still resolve.
    """
    target = date[:10]
    # Wider window than the service.py cache (30) so the fallthrough buys real
    # range. If the user has >180 digests the corner case isn't worth
    # structured query investment.
    digests = await list_user_digests(user_id, limit=180)
    for d in digests:
        raw = (d.get("digest_date") or "")[:10]
        if raw == target:
            return d.get("digest_id") or d.get("id")
    return None
```

---

## Task 2 — Apply `.strip()` to service-side thesis check

**File:** `backend/app/features/for_you/service.py` (lines 172-175)

### Current:

```python
    missing_thesis = {
        h.symbol for h in (holdings or [])
        if h.symbol != "$CASH" and not getattr(h, "thesis", None)
    }
```

### New:

```python
    # Match the agent-side check in build_action_context (agent.py:363): a
    # thesis of "" or "   " (whitespace only) counts as missing. Without
    # .strip() the service rejects thesis:<SYM> actions that the agent
    # legitimately emitted for whitespace theses.
    missing_thesis = {
        h.symbol for h in (holdings or [])
        if h.symbol != "$CASH" and not (getattr(h, "thesis", None) or "").strip()
    }
```

---

## Task 3 — Dict-shaped action_items coercion (three sites)

### Site 1 — `backend/app/features/for_you/service.py` (lines 150-160)

#### Current:

```python
    raw_items = (digest_data or {}).get("action_items", []) or []
    portfolio_summary_raw = (digest_data or {}).get("portfolio_summary", "")
    portfolio_summary = portfolio_summary_raw if isinstance(portfolio_summary_raw, str) else ""

    parsed: list[ActionItem] = []
    for raw in raw_items:
        try:
            parsed.append(ActionItem.model_validate(raw) if not isinstance(raw, ActionItem) else raw)
        except Exception as e:
            logger.warning("action_bar: drop malformed action_item: %s", e)
```

#### New:

```python
    raw_items = (digest_data or {}).get("action_items", []) or []
    # LLM sometimes hallucinates action_items as a single dict instead of a
    # list. Iterating a dict yields keys (strings), which then fail
    # model_validate one-by-one and silently drop every chip. Normalize
    # single-dict to list.
    if isinstance(raw_items, dict):
        raw_items = [raw_items]
    elif not isinstance(raw_items, list):
        logger.warning(
            "action_bar: action_items has unexpected type %s, ignoring",
            type(raw_items).__name__,
        )
        raw_items = []

    portfolio_summary_raw = (digest_data or {}).get("portfolio_summary", "")
    portfolio_summary = portfolio_summary_raw if isinstance(portfolio_summary_raw, str) else ""

    parsed: list[ActionItem] = []
    for raw in raw_items:
        try:
            parsed.append(ActionItem.model_validate(raw) if not isinstance(raw, ActionItem) else raw)
        except Exception as e:
            logger.warning("action_bar: drop malformed action_item: %s", e)
```

### Site 2 — `backend/app/features/brew/router.py` cache-hit path

Current (around line 318):

```python
            cached_action_items_raw = digest_data.get("action_items") or []
            cached_action_items: list[ActionItem] = []
            for item in cached_action_items_raw:
                ...
```

New:

```python
            cached_action_items_raw = digest_data.get("action_items") or []
            # LLM hallucination safety: a dict at this position would iterate
            # its keys. Coerce single-dict to list; log+skip other non-list
            # shapes.
            if isinstance(cached_action_items_raw, dict):
                cached_action_items_raw = [cached_action_items_raw]
            elif not isinstance(cached_action_items_raw, list):
                logger.warning(
                    "Cached action_items has unexpected type %s for user %s..., ignoring",
                    type(cached_action_items_raw).__name__,
                    user_id[:8] if user_id else "unknown",
                )
                cached_action_items_raw = []

            cached_action_items: list[ActionItem] = []
            for item in cached_action_items_raw:
                ...  # existing body unchanged
```

### Site 3 — `backend/app/features/brew/router.py` fresh-generation path

Search for `action_items_raw = result.get("action_items", []) or []` (around line 380-390).

Current:

```python
        action_items_raw = result.get("action_items", []) or []
        action_items: list[ActionItem] = []
        for item in action_items_raw:
            ...
```

New:

```python
        action_items_raw = result.get("action_items", []) or []
        # Dict-coercion guard (matches cache-hit path): ADK/Pydantic should
        # reject dict-shaped action_items at validation time, but if an older
        # ADK version or a custom runner bypasses that, we still want to
        # surface the single action instead of iterating dict keys.
        if isinstance(action_items_raw, dict):
            action_items_raw = [action_items_raw]
        elif not isinstance(action_items_raw, list):
            logger.warning(
                "Fresh action_items has unexpected type %s for user %s..., ignoring",
                type(action_items_raw).__name__,
                user_id[:8] if user_id else "unknown",
            )
            action_items_raw = []

        action_items: list[ActionItem] = []
        for item in action_items_raw:
            ...  # existing body unchanged
```

---

## Task 5 (NEW) — Persist `action_items` and `portfolio_summary` in `digest_data`

**File:** `backend/app/features/brew/db.py` (lines 87-92)

### Current:

```python
            # Full structured data
            "digest_data": {
                "stocks": digest_data.get("stocks", []),
                "news": digest_data.get("news", {}),
                "events": digest_data.get("events", []),
                "summary": digest_data.get("summary", {}),
            },
```

### New:

```python
            # Full structured data. Round-2 fields (action_items,
            # portfolio_summary) must be here so cache-hit reads in router
            # and service see the same shape as fresh-generation reads.
            # Without this, Action Bar appears empty on any cached digest.
            "digest_data": {
                "stocks": digest_data.get("stocks", []),
                "news": digest_data.get("news", {}),
                "events": digest_data.get("events", []),
                "summary": digest_data.get("summary", {}),
                "action_items": digest_data.get("action_items", []),
                "portfolio_summary": digest_data.get("portfolio_summary", ""),
            },
```

**Note on caller:** `router.py:363-374` `save_data` dict already has both `action_items` and `portfolio_summary` keys (added in round-2 Task 2). So no change needed in the caller. The save_user_digest function reads from `digest_data` (its parameter name) which is the full dict passed by router.

Wait — let me verify. Look at router.py line 374:

```python
                "action_items": result.get("action_items", []),
```

and save_user_digest receives this dict as `digest_data` parameter, and db.py:87-92 constructs a new inner dict that picks only a subset of keys. The fix above extends that inner dict to include the missing keys. ✓

---

## Task 6 — Regression tests

### Test suite 1 — `backend/tests/test_action_bar.py`

Append to `TestBuildActionBarAgentDriven` class:

#### Test 6.1 — Whitespace thesis (fixes #3)

```python
    @pytest.mark.asyncio
    async def test_whitespace_thesis_treated_as_missing(self):
        """Service must agree with agent: thesis='   ' (whitespace only) means missing.

        Previously the service-side missing_thesis check used `not thesis`
        which treats "   " as Truthy → rejected thesis:<SYM> actions the
        agent emitted for whitespace theses.
        """
        from app.features.for_you.service import build_action_bar

        holdings = [make_holding("NVDA", 60), make_holding("AAPL", 40)]
        holdings[0].thesis = "   "  # whitespace only — agent treats as missing
        holdings[1].thesis = "Real thesis"

        digest = {
            "action_items": [
                {"label": "补 NVDA 论点", "target": "thesis:NVDA", "reason": "x", "priority": 1},
            ],
            "portfolio_summary": "",
        }

        with patch("app.features.portfolio.db.get_profile", new=AsyncMock(return_value=make_profile())), \
             patch("app.features.brew.db.get_user_watchlist", new=AsyncMock(return_value={"symbols": []})), \
             patch("app.features.brew.db.list_user_digests", new=AsyncMock(return_value=[])), \
             patch("app.features.brew.db.resolve_digest_id_by_date", new=AsyncMock(return_value=None)):
            bar = await build_action_bar("user-1", digest_data=digest, holdings=holdings)

        assert len(bar.chips) == 1
        assert bar.chips[0].target == "thesis:NVDA"
```

#### Test 6.2 — Dict-shaped action_items coercion (fixes #4 site 1)

```python
    @pytest.mark.asyncio
    async def test_action_items_as_dict_coerced_to_list(self):
        """LLM hallucinates action_items as dict → coerce to single-element list.

        Without coercion, `for raw in raw_items` iterates dict keys (strings)
        and every ActionItem.model_validate raises, silently dropping the chip.
        """
        from app.features.for_you.service import build_action_bar

        digest = {
            "action_items": {"label": "补论点", "target": "portfolio", "reason": "test", "priority": 1},
            "portfolio_summary": "",
        }

        with patch("app.features.portfolio.db.get_profile", new=AsyncMock(return_value=make_profile())), \
             patch("app.features.brew.db.get_user_watchlist", new=AsyncMock(return_value={"symbols": []})), \
             patch("app.features.brew.db.list_user_digests", new=AsyncMock(return_value=[])), \
             patch("app.features.brew.db.resolve_digest_id_by_date", new=AsyncMock(return_value=None)):
            bar = await build_action_bar("user-1", digest_data=digest, holdings=[])

        assert len(bar.chips) == 1
        assert bar.chips[0].target == "portfolio"
```

#### Test 6.3 — `_resolve` fallthrough when cached row lacks id (fixes #2, correctly)

**Audit-corrected design:** Put the target date IN `cached_recent` so the whitelist passes, but the cached row lacks `digest_id`/`id` — forcing `_resolve` to break from the loop and fall through to `resolve_digest_id_by_date`. The mocked resolver returns a valid uuid to confirm the fallthrough ran.

```python
    @pytest.mark.asyncio
    async def test_resolve_falls_through_to_db_when_cached_row_lacks_id(self):
        """When the cached_recent row with matching date has no digest_id/id,
        _resolve must fall through to resolve_digest_id_by_date instead of
        returning None (previously it returned None inside the loop)."""
        from app.features.for_you.service import build_action_bar

        # cached_recent contains the target date but no id fields on that row
        cached = [
            {"digest_date": "2026-04-21"},  # matches target but no digest_id/id
            {"digest_id": "uuid-other", "digest_date": "2026-01-01"},
        ]

        resolve_mock = AsyncMock(return_value="uuid-fresh")

        digest = {
            "action_items": [
                {"label": "回看日报", "target": "digest:2026-04-21", "reason": "x", "priority": 1},
            ],
            "portfolio_summary": "",
        }

        with patch("app.features.portfolio.db.get_profile", new=AsyncMock(return_value=make_profile())), \
             patch("app.features.brew.db.get_user_watchlist", new=AsyncMock(return_value={"symbols": []})), \
             patch("app.features.brew.db.list_user_digests", new=AsyncMock(return_value=cached)), \
             patch("app.features.brew.db.resolve_digest_id_by_date", new=resolve_mock):
            bar = await build_action_bar("user-1", digest_data=digest, holdings=[])

        # Fallthrough called once with the target date
        assert resolve_mock.await_count == 1
        resolve_mock.assert_awaited_with("user-1", "2026-04-21")
        # Chip made it through with the resolved uuid
        assert len(bar.chips) == 1
        assert bar.chips[0].target == "digest:uuid-fresh"
```

### Test suite 2 — `backend/tests/test_brew_router_unit.py`

Append to `TestGenerateDigestEndpoint` (after `test_cache_hit_malformed_action_item_is_dropped_not_500`):

#### Test 6.4 — Router cache-hit dict coercion (fixes #4 site 2)

Following the exact scaffolding of `test_cache_hit_response_includes_action_items`:

```python
    async def test_cache_hit_action_items_as_dict_coerced(self, monkeypatch):
        """LLM hallucination safety: cached action_items shaped as a dict
        (instead of a list) must be coerced to a single-item list instead of
        iterating dict keys and losing every chip."""

        async def _mock_get_user_digest(user_id: str, digest_date: str):
            return {
                "user_id": user_id,
                "created_at": "2026-03-06T08:00:00Z",
                "symbols": ["NVDA"],
                "greeting": "cached-greet",
                "one_line_summary": "cached-summary",
                "digest_data": {
                    "stocks": [],
                    "news": {"headlines": [], "briefs": []},
                    "events": [],
                    "summary": {"content": "cached"},
                    # Dict instead of list — simulating LLM hallucination
                    "action_items": {
                        "label": "看组合",
                        "target": "portfolio",
                        "reason": "cached reason",
                        "priority": 2,
                    },
                },
            }

        monkeypatch.setattr("app.features.brew.router.get_user_digest", _mock_get_user_digest)

        response = await generate_digest(
            request=self._request(),
            body=DigestRequest(symbols=["NVDA"]),
            user_id="token-user",
        )

        assert response.success is True
        assert response.from_cache is True
        # One item, coerced from dict
        assert len(response.action_items) == 1
        assert response.action_items[0].target == "portfolio"
```

### Test suite 3 — `backend/tests/test_brew_db_unit.py`

#### Test 6.5 — Persistence round-trip (fixes #5)

```python
class TestSaveUserDigestPersistsRoundTwoFields:
    """Verify save_user_digest includes action_items and portfolio_summary in
    the persisted digest_data blob. Without this, cache hits return empty
    Action Bar on V2 path."""

    @pytest.mark.asyncio
    async def test_action_items_persisted_in_digest_data(self):
        from app.features.brew import db as brew_db

        captured_body: dict = {}

        class FakeResponse:
            status_code = 201
            def json(self):
                return {"success": True, "data": {"id": "uuid-new"}}

        class FakeClient:
            async def __aenter__(self):
                return self
            async def __aexit__(self, *a):
                return False
            async def post(self, url, headers=None, json=None, timeout=None):
                captured_body.update(json)
                return FakeResponse()

        with patch("httpx.AsyncClient", new=FakeClient):
            await brew_db.save_user_digest({
                "user_id": "u",
                "digest_date": "2026-04-26",
                "symbols": ["NVDA"],
                "greeting": "g",
                "one_line_summary": "ols",
                "stocks": [],
                "news": {"headlines": [], "briefs": []},
                "events": [],
                "summary": {"content": "s"},
                "action_items": [
                    {"label": "x", "target": "portfolio", "reason": "r", "priority": 1},
                ],
                "portfolio_summary": "组合涨 1%",
            })

        # digest_data is the JSONB blob persisted at Insforge
        persisted_blob = captured_body.get("digest_data", {})
        assert "action_items" in persisted_blob
        assert len(persisted_blob["action_items"]) == 1
        assert persisted_blob["action_items"][0]["target"] == "portfolio"
        assert persisted_blob.get("portfolio_summary") == "组合涨 1%"
```

#### Test 6.6 — `resolve_digest_id_by_date` uses broader limit (fixes #2 operational bit)

```python
    @pytest.mark.asyncio
    async def test_resolve_uses_broader_limit_than_service_cache(self):
        """resolve_digest_id_by_date must query with a limit larger than
        service.py's cached_recent limit (30) so the fallthrough buys real
        range. Target: limit=180 (six months)."""
        from app.features.brew import db as brew_db

        captured_limit = []

        async def _mock_list(user_id: str, limit: int):
            captured_limit.append(limit)
            return []

        with patch("app.features.brew.db.list_user_digests", new=_mock_list):
            await brew_db.resolve_digest_id_by_date("user-1", "2026-04-21")

        assert captured_limit == [180]
```

---

## Execution order (matters)

Strict order — don't reorder:

1. **Task 5 first** (db.py persistence) — unblocks cache-hit test scenario in production.
2. **Task 1.5** (db.py limit bump) — prerequisite for Task 6.6 test to pass.
3. **Task 1** (service.py cached_recent + _resolve).
4. **Task 2** (service.py thesis strip).
5. **Task 3 Site 1** (service.py dict coercion).
6. **Task 3 Site 2** (router.py cache-hit dict coercion).
7. **Task 3 Site 3** (router.py fresh-path dict coercion).
8. **Task 6 tests** — all 6 regression tests.
9. Run focused suite:
   ```
   cd backend && source venv/bin/activate
   pytest tests/test_action_bar.py tests/test_brew_router_unit.py \
          tests/test_for_you_action_integration.py \
          tests/test_action_items_validator.py \
          tests/test_brew_db_unit.py -v
   ```
10. Run full backend regression:
    ```
    pytest -q --ignore=tests/e2e --ignore=tests/integration
    ```
11. Expected: previous baseline (1372) + 6 new = 1378 passed, 30 skipped, 0 failed.
12. Single commit:
    ```
    git add backend/app/features/for_you/service.py \
            backend/app/features/brew/router.py \
            backend/app/features/brew/db.py \
            backend/tests/test_action_bar.py \
            backend/tests/test_brew_router_unit.py \
            backend/tests/test_brew_db_unit.py
    git commit -m "fix(for-you): hardening pass — persistence gap, dict coercion, thesis strip, resolver fallthrough"
    ```

---

## Success Criteria

1. All 4 original issues verifiably fixed, each with a regression test that fails against old code and passes against new.
2. New issue #5 (persistence gap) fixed with a round-trip test.
3. `_resolve` has explicit 2-tier lookup with correct fallthrough semantics.
4. `resolve_digest_id_by_date` uses `limit=180` so fallthrough buys real range.
5. `missing_thesis` at service layer matches agent layer character-for-character.
6. All three action_items read sites (service, router-cache, router-fresh) guard against dict hallucination.
7. All pre-existing tests still pass: 1372 → 1378 expected.
8. Single commit on `claude/for-you-v2-round2`; checkpoint updated.

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Persistence fix (Task 5) changes shape of stored `digest_data` blob | JSONB column accepts anything. Old cached rows without the new keys default to `[]` / `""` via existing `.get(key, default)` patterns in the read paths. Backward compatible. |
| `resolve_digest_id_by_date(limit=180)` may exceed Insforge EF default page size | Check `list_user_digests` URL construction — it uses query-string `?limit=180`. Insforge edge function defaults are usually 100, but explicit `limit` param should honor it. If not, fallthrough just returns None, which is the pre-patch behavior (no regression). |
| Whitespace thesis change surfaces MORE chips than before | Desired behavior. Users with `"   "` thesis genuinely need to fix it. |
| Dict-coercion test 6.2 might pass against old code by accident | Verified by thought experiment: old code `for raw in {...}` iterates keys, all `ActionItem.model_validate("label")` raise with "Input should be a valid dictionary" — result: 0 chips, `bar.visibility == "hidden"` (no chips, empty headline). New code: 1 chip. Test asserts `len(bar.chips) == 1`. Would fail against old, pass against new. ✓ |
| Fallthrough test 6.3 might pass against old code by accident | Old code's `_resolve` returns `None` inside loop when row matches but has no id. New code breaks and falls through. In the test, `resolve_mock.await_count == 1` (new) vs. `0` (old). ✓ |

---

## Rollback

If anything regresses:

```bash
cd /Users/xuxueyang/Documents/GitHub/stock-agent/.worktrees/for-you-v2-round2
git revert <commit-sha>
```

No Insforge schema changes (JSONB column is already flexible). No external-service coordination. Pure local rollback.

---

## Non-goals / Out of scope

- Do NOT touch `build_action_context` in agent.py (correctness verified).
- Do NOT alter `PersonalDigestOutput` schema (the list-vs-dict hallucination is caught at fresh-path validation; this fix targets cache-path and downstream consumers).
- Do NOT revive rule-engine behavior (Task 9/10 of round-2 removed it intentionally).
- Do NOT modify the frontend. All fixes are backend-side.
- Do NOT address Insforge EF pagination beyond bumping `limit=180` (if the EF caps at 100, we accept bounded fallthrough range).
