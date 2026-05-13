# For-You V2 Round 2 — Execution Checkpoint

**Working branch:** `claude/for-you-v2-round2`
**Worktree:** `/Users/xuxueyang/Documents/GitHub/stock-agent/.worktrees/for-you-v2-round2`
**Base commit:** `6e33af5 docs(for-you): round2 spec + implementation plan for V2 UX fixes`
**Plan:** `docs/superpowers/plans/2026-04-25-for-you-v2-round2-plan.md`
**Spec:** `docs/superpowers/specs/2026-04-25-for-you-v2-round2-design.md`

**Test account:** `voya.technologies@gmail.com` / `123456`

---

## Session Handoff

If a new session picks up this work, read this file top-to-bottom, then resume from the next ⏳ task. All task prompts and spec excerpts live in the plan file — do not re-derive them.

---

## Milestone Map

Milestones group related tasks so each has a coherent user-visible outcome. After each milestone we commit, run full test, and pause for optional human verification.

| # | Tasks | Outcome | Status |
|---|-------|---------|--------|
| M1 | 1, 2 | `ActionItem` schema + router wire-through | ✅ done |
| M2 | 3, 4, 5 | Agent context + prompt for action_items | ✅ done |
| M3 | 6, 7, 8 | For-you models + validator + db helper | ✅ done |
| M4 | 9, 10 | `build_action_bar` rewrite + template cleanup | ✅ done |
| M5 | 11, 12, 13 | Frontend types, routing helper, ActionBar component | ✅ done |
| M6 | 14 | DigestInlineReport rename + reorder | ✅ done |
| M7 | 15 | Integration tests | ✅ done |
| M8 | 16, 17 | Context docs + full regression | ✅ done (tests green; UI smoke pending user) |

**Status legend:** ⏳ pending · 🚧 in-progress · ✅ done · ⚠️ blocked

---

## Per-Task Status

| Task | Title | Implementer | Spec Reviewer | Code Reviewer | Commit SHA |
|------|-------|-------------|---------------|----------------|------------|
| 1 | ActionItem model + digest fields | ✅ | ✅ | ✅ (1 fix) | `cbbc9c7` |
| 2 | Router passes action_items | ✅ | ✅ (accepted over-build on cache path) | ✅ (1 fix) | `e29a83f` |
| 3 | build_action_context in agent.py | ✅ | ✅ (noted class rename) | ⚠️→✅ (Critical C1 fixed) | `f770bc5` |
| 4 | Inject health_latest into context | ✅ | ✅ (combined) | ✅ | `e862e71` |
| 5 | Prompt — action_items section | ✅ (prompt-only, verbatim) | n/a | n/a | `edc5462` |
| 6 | for-you models visibility + target | ✅ | n/a | n/a | `66e699b` |
| 7 | action_items validator module | ✅ | ✅ (combined) | ✅ | `3581a61` |
| 8 | resolve_digest_id_by_date helper | ✅ | n/a | n/a | `c44f9c8` |
| 9 | Rewrite build_action_bar | ✅ | ✅ (combined — 2 nits deferred) | ✅ | `b07287e` |
| 10 | Remove old templates | ✅ (+1 arch-test fix) | n/a | n/a | `3b83f2d`, `c83ce10` |
| 11 | Frontend api.ts types | ✅ | n/a | n/a | `bf1471f` |
| 12 | action-bar-routing helper | ✅ | n/a | n/a | `035b368` |
| 13 | ActionBar.tsx refactor | ✅ | n/a | n/a | `3229400` |
| 14 | DigestInlineReport rename + reorder | ✅ | n/a | n/a | `92d4eb3` |
| 15 | End-to-end integration test | ✅ | n/a | n/a | `faaeae4` |
| 16 | Update .context.md docs | ✅ | n/a | n/a | `6f6cb06` |
| 17 | Full regression + smoke | ✅ (tests only, UI smoke pending) | n/a | n/a | n/a |

---

## Non-Blocking Issues (All Resolved)

1. ✅ **[Task 9 Nit → fixed in `6d37205`] `portfolio_summary.strip()` non-string defensiveness** — now coerces to str via isinstance check; regression test added.

2. ✅ **[Task 9 Nit → fixed in `6d37205`] N+1 on legacy digests fallback** — cached the fallback `list_user_digests` result and reused it inside `_resolve` closure. Saves up to 3 redundant DB calls per action bar build on legacy digests.

3. ✅ **[Task 9 observation → fixed in `6d37205`] Watchlist source**: plan text said `portfolio_db.list_watchlist` but that function doesn't exist. Implementation from the start correctly used `brew_db.get_user_watchlist` (verified edge cases: None, empty dict, `symbols: []`, `symbols: None`, full real shape all produce sane `set`). No missing functionality. Plan doc updated to match reality.

---

## Product Improvement Ideas (Surfaced During Work)

Opportunities noticed while implementing. Presented to user at project end.

_(none yet)_

---

## External Service Actions Required

None for this project. All changes are code-level; no Insforge schema changes, no Vercel config changes, no Railway env changes.

**Hard constraint (per user):** NO Insforge data mutations without explicit user approval.

---

## Local Verification Checklist (Per Milestone)

Populated as each milestone ships. Each entry lists what to manually verify if the user wants to smoke-test that milestone.

### M1 checklist

**M1 status:** ✅ shipped, 31 tests pass locally.

**What changed visibly:** Nothing yet — M1 is backend schema plumbing only. API response now includes `action_items: []` field, always empty at this stage (agent not yet producing them).

**Verification (no manual action needed, but if you want to confirm):**

- [ ] Run backend: `cd backend && source venv/bin/activate && uvicorn app.main:app --reload`
- [ ] Log in as test user; open Network tab; trigger digest; confirm response JSON has new `action_items: []` key

**Commits in M1:**
- `47e31ef` Task 1: ActionItem schema
- `cbbc9c7` Task 1 fix: target docstring
- `1daa1a3` Task 2: router wire-through
- `e29a83f` Task 2 fix: graceful degrade + real router tests

**No external service actions required for M1.**

### M2 checklist

**M2 status:** ✅ shipped, 29 backend unit tests pass (brew agent + router).

**What changed visibly:** Still nothing user-facing. Agent now receives `action_context` (missing_thesis, days_since_*, events, digest_dates) and its prompt teaches it to produce `action_items`. The agent's output will now *include* action_items when the LLM decides to produce them; but no consumer reads them yet (Task 9/13 wire the action bar to consume them).

**Verification if starting local services:**

- [ ] Start backend: `cd backend && source venv/bin/activate && uvicorn app.main:app --reload`
- [ ] Trigger a digest generation for a user with a portfolio; check backend logs for `"Loaded health latest"` or warnings about `action_context`
- [ ] Inspect the POST /api/brew/digest response JSON — `action_items` field may now be non-empty (depends on agent output)
- [ ] No visible UI change yet

**Commits in M2:**
- `26e4919` Task 3: build_action_context helper
- `f770bc5` Task 3 fix: naive-datetime bug + richer error logging
- `e862e71` Task 4: wire health_latest into context
- `edc5462` Task 5: prompt — action_items section

**No external service actions required for M2.**

### M3 checklist

**M3 status:** ✅ shipped, 126 backend unit tests pass (cumulative M1+M2+M3).

**What changed visibly:** Still no user-visible change. Internal plumbing: `ActionChip` gains optional `target` field; `ActionBar` gains `visibility` field; new validator module can filter agent action_items; new db helper resolves date→digest uuid. `build_action_bar` in service.py still uses the old rule engine (changes in M4).

**Verification if starting local services:** None needed — no runtime behavior change yet. Optionally:

- [ ] Confirm backend still starts: `uvicorn app.main:app --reload`
- [ ] Hit `/api/for-you/signal` (or whichever action_bar endpoint) — response shape unchanged, `chips[i].target` may appear as empty string now (new default), `visibility` may appear as "visible"

**Commits in M3:**
- `66e699b` Task 6: ActionBar.visibility + ActionChip.target + expand kinds
- `3581a61` Task 7: action_items validator
- `c44f9c8` Task 8: resolve_digest_id_by_date

**No external service actions required for M3.**

### M4 checklist

**M4 status:** ✅ shipped. Full backend regression: **1369 passed, 30 skipped, 0 failed** (22 skips are legacy rule-engine action_bar tests preserved as documentation; other skips pre-existing).

**What changed visibly:** First user-visible change lands here — the `/api/for-you/signal` endpoint now returns agent-driven chips when the digest has `action_items`, or a hidden bar when silent. Backend-only milestone; frontend will render differently once M5 lands.

**Verification if starting local services:**

- [ ] `cd backend && source venv/bin/activate && uvicorn app.main:app --reload`
- [ ] Log in as test account; generate a digest for today; inspect the /api/for-you/signal response:
  - When `digest.action_items` non-empty → chips contain the agent items with `target` and `link`
  - When neither action_items nor portfolio_summary → `visibility: "hidden"` and chips empty
  - `source` field should be `"agent"` (was `"template"` before)
- [ ] Old rule-engine triggers (drawdown/staleness/etc.) no longer produce chips — this is intentional per spec

**Commits in M4:**
- `b07287e` Task 9: rewrite build_action_bar to consume agent action_items
- `3b83f2d` Task 10: remove green/staleness template helpers
- `c83ce10` Arch-test allowlist: brew → portfolio_health (intentional dependency)

**No external service actions required for M4.**

### M5 checklist

**M5 status:** ✅ shipped. Frontend wires to new backend contract.

**What changed visibly:**
- Action bar now hides entirely on quiet days (`visibility: hidden`)
- Chip clicks route via `resolveChipUrl` — new targets: `thesis:<SYM>` → anchor `#stock-<SYM>`, `section:<id>` → anchor `#section-<id>`, `digest:<uuid>` → `/for-you/<uuid>`, `stock:<SYM>` → `/stock/<SYM>`, bare `portfolio`/`health`/`watchlist` → respective pages
- Mobile (<sm): shows only top-priority chip; desktop (sm+): up to 3 chips
- Anchor scrolling is smooth with 72px navbar offset

**Verification if starting local services:**

- [ ] `cd backend && source venv/bin/activate && uvicorn app.main:app --reload`
- [ ] `cd frontend && npm run dev`
- [ ] Log in (test: `voya.technologies@gmail.com` / `123456`); go to `/for-you`
- [ ] Observe action bar state:
  - If today's digest has agent-produced `action_items` + `portfolio_summary` → bar shows both
  - If digest empty → bar is hidden (not "今天没有需要特别关注的事" like before)
  - If only summary → headline renders, no chips
- [ ] Click a chip:
  - `thesis:<SYM>` chips smooth-scroll to stock panel (no navbar overlap)
  - `digest:<uuid>` chips navigate to history page
  - `portfolio` / `health` chips navigate to respective pages
- [ ] Mobile viewport (<640px): only one chip visible; desktop: up to 3

**Caveat for manual testing:**
- Since anchor scrolling depends on `id="stock-<SYM>"` and `id="section-*"` in DOM, and Task 14 is still pending, `section:notes` anchor won't work until M6 lands. Other anchors already work in today's DOM structure.

**Commits in M5:**
- `bf1471f` Task 11: api.ts types
- `035b368` Task 12: action-bar-routing helper
- `3229400` Task 13: ActionBar.tsx refactor

**No external service actions required for M5.**

### M6 checklist

**M6 status:** ✅ shipped. 440 frontend vitest tests pass.

**What changed visibly:**
- The 总结 section is now titled **"给你的复盘笔记"** with subtitle *"综合你的持仓、关注列表与今日相关新闻"*
- Moved from the bottom of the page to directly below 持仓概览 (position 3, before 头条新闻)
- Added anchor IDs to headlines (`#section-headlines`), briefs (`#section-briefs`), events (`#section-events`), notes (`#section-notes`) so agent-produced `section:*` chips can smooth-scroll

**Verification if starting local services:**

- [ ] `cd frontend && npm run dev`
- [ ] Log in as test user, open `/for-you`
- [ ] Confirm new section order: Header → 持仓概览 → 给你的复盘笔记 → 头条新闻 → 更多新闻 → 重要事件 → Disclaimer
- [ ] The subtitle "综合你的持仓、关注列表与今日相关新闻" renders as small muted text under the heading
- [ ] If action bar has a `section:*` chip, clicking smooth-scrolls to the target section with 72px navbar offset

**Commits in M6:**
- `92d4eb3` Task 14: rename + reorder + section anchors

**No external service actions required for M6.**

### M7 checklist

**M7 status:** ✅ shipped. 2 integration tests pass.

**What changed visibly:** Nothing user-visible — tests only.

**Commits in M7:**
- `faaeae4` Task 15: end-to-end integration test

### M8 checklist

**M8 status:** ✅ shipped (code + tests). Manual UI smoke test pending user.

**Regression summary:**
- Backend: **1371 passed, 30 skipped, 0 failed** (82s). Skips = legacy rule-engine action_bar tests marked during Task 9/10.
- Frontend: **440 passed** (17s).

**Manual smoke test checklist (please verify in browser):**

- [ ] Start backend: `cd backend && source venv/bin/activate && uvicorn app.main:app --reload`
- [ ] Start frontend: `cd frontend && npm run dev`
- [ ] Log in (`voya.technologies@gmail.com` / `123456`)
- [ ] Navigate to `/for-you`
- [ ] **Section order**: Header → 持仓概览 → 给你的复盘笔记 → 头条新闻 → 更多新闻 → 重要事件 → Disclaimer
- [ ] **Section title and subtitle**: `给你的复盘笔记` with muted subtitle `综合你的持仓、关注列表与今日相关新闻`
- [ ] **Action bar**: depends on today's digest content. Look at /api/for-you/signal JSON in DevTools to confirm `visibility`, `chips`, `source: "agent"`.
  - If bar hidden: confirm no empty placeholder renders
  - If bar visible with chips: click each chip — should navigate/scroll correctly without navbar overlap
- [ ] **Mobile viewport (<640px)**: only 1 chip visible per action bar; desktop shows up to 3

**Commits in M8:**
- `6f6cb06` Task 16: update .context.md docs

**No external service actions required for M8.**

---

## Post-M8 Follow-ups

- **Feature flag gating review** → `docs/superpowers/plans/2026-04-25-for-you-v2-round2-flag-review.md`
- **Option A implementation** (DigestInlineReport variant prop) — commit `8d525be`
- **Non-blocking fixes** — commit `6d37205`
- **User acceptance checklist** → `docs/superpowers/plans/2026-04-25-for-you-v2-round2-acceptance.md`

**Final state:** 35 commits on `claude/for-you-v2-round2`. Backend 1372 passed / 30 skipped. Frontend 443 passed.

---

## Hardening Round (2026-04-26)

Second-round adversarial review of the branch surfaced 4 issues in agent-service interaction + 1 discovered during audit. Plan: `2026-04-26-for-you-v2-round2-hardening-plan.md` (v2, audit-approved).

Fixed in two commits:

**`680b905`** — main hardening pass
- Persist `action_items` + `portfolio_summary` in `digest_data` (db.py) so cache hits surface Action Bar
- Bump `resolve_digest_id_by_date` limit 30→180 (db.py) so service-layer fallthrough buys real range
- Unconditional `cached_recent` fetch + fixed `_resolve` fallthrough semantics (service.py)
- `.strip()` applied to service-side `missing_thesis` check (service.py)
- Dict→list coercion at 3 action_items read sites (service.py + router.py × 2)
- 6 regression tests (thesis whitespace, dict coercion × 2, fallthrough, persistence, limit bump)

**`5eb632f`** — C1 fixup (post-implementation review found)
- `router.py:389`: `save_data` now includes `portfolio_summary`
- `router.py:356`: cache-hit `DigestResponse` now passes `portfolio_summary`
- `router.py:442`: fresh-path `DigestResponse` now passes `portfolio_summary`
- 2 regression tests: fresh-path save captures both keys, cache-hit response surfaces portfolio_summary

**Final test state:** Backend 1380 passed / 30 skipped / 0 failed. Frontend 443 passed.

### Non-blocking gap surfaced (not fixed — separate ticket)

- `backend/app/features/subscription/email_service.py:867-880` calls `save_user_digest` with a payload that omits `action_items` and `portfolio_summary`. Not a regression from this branch — pre-existing gap — but the same shape as C1. Broadcast-generated cached digests will show empty Action Bar when user later visits. Worth a separate one-line fix; out of scope for this round.

---

## Rollback Instructions

If anything goes wrong and you need to roll back to pre-implementation state:

```bash
# From repo root
cd /Users/xuxueyang/Documents/GitHub/stock-agent
git worktree remove .worktrees/for-you-v2-round2 --force
git branch -D claude/for-you-v2-round2
```

Spec + plan commit on main working branch (`6e33af5`) is doc-only and safe to leave. If you want to discard the docs too:

```bash
git -C /Users/xuxueyang/Documents/GitHub/stock-agent checkout claude/improve-exclusive-page-d7FMx
git reset --hard HEAD~1  # drops the docs commit; you've been warned it's destructive
```

**Do NOT** use `git reset --hard` unless you're sure nothing else in the working tree matters.
