# V2 UX Fixes — Execution Checkpoint

**Plan:** `docs/superpowers/plans/2026-04-25-for-you-v2-ux-fixes.md`
**Spec:** `docs/superpowers/specs/2026-04-25-for-you-v2-ux-fixes-design.md`
**Branch:** `claude/improve-exclusive-page-d7FMx`
**Started:** 2026-04-25

---

## Milestones

| # | Milestone | Tasks | Status | Commit |
|---|-----------|-------|--------|--------|
| M1 | Backend: entry_price + market_value | T1 | done | fb58347 |
| M2 | Backend: auto share conversion | T2 | done | e213c8e |
| M3 | Backend: action bar + brew models | T3, T4 | done | 8a413d1 |
| M4 | Frontend: breadcrumb + nav + thesis | T5, T6, T7 | done | 308d13c |
| M5 | Frontend: stock overview split | T8 | done | 1471b5e |
| M6 | Frontend: portfolio UI + actionbar chips | T9, T10 | done | ef75a6c |

## Manual Operations Required

| Step | When | Operation | Rollback |
|------|------|-----------|----------|
| DB Migration | Before M1 testing | Apply `u2a_entry_price.sql` to Insforge | `ALTER TABLE user_portfolios DROP COLUMN entry_price;` |
| EF Deploy | After M1 code changes | Deploy updated `portfolio.js` Edge Function | Redeploy previous version from git |

## Non-Blocking Issues (batch for developer)

(none yet)

## Developer Verification Checklists

### After M1+M2 (Backend)
- [ ] `cd backend && python -m pytest tests/test_portfolio_models.py tests/test_auto_shares.py -v` — all pass
- [ ] Start backend: `uvicorn app.main:app --reload`
- [ ] `GET /api/portfolio` returns `entry_price`, `market_value`, `unrealized_pnl` fields
- [ ] `PUT /api/portfolio/bulk` with a stock that has `cost_basis` but no `shares` → response includes auto-calculated `shares` and `entry_price`
- [ ] $CASH holding returns `market_value` equal to `cost_basis`

### After M3 (Action Bar)
- [ ] `cd backend && python -m pytest tests/test_action_bar.py -v` — all pass
- [ ] Action bar green state shows portfolio attribution (e.g. "组合今日涨 1.4%，NVDA 领涨")
- [ ] Green chips show "补充投资论点" or "查看持仓体检" (not "查看日报")

### After M4 (Breadcrumb + Nav + Thesis)
- [ ] `cd frontend && npm run build` — no TS errors
- [ ] All 6 sub-pages show "专属 / 页面名" breadcrumb
- [ ] Navbar "专属" dropdown shows 5 items (V2 flag on)
- [ ] Locked items (portfolio, health) show lock icon for free users
- [ ] Thesis prompts show varied questions with quick-select tags

### After M5+M6 (Stock Overview + Portfolio UI + Chips)
- [ ] Stock overview shows "我的持仓" (green) and "观察列表" (gray) sections
- [ ] Portfolio stocks show weight percentages
- [ ] Total market value and daily change shown in portfolio header
- [ ] Empty portfolio shows CTA to add holdings
- [ ] Action bar "补充投资论点" chip scrolls to and highlights the stock
- [ ] Portfolio save shows blue auto-conversion banner
- [ ] Entry price correction field works
