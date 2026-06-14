# Freemium Transition — Verification Plan

Verification harness for the freemium transition (Phase 0+1+2).
Plan: [`freemium-lifecycle-email.md`](./freemium-lifecycle-email.md)
Contract: [`../../constraints/subscription-model.md`](../../constraints/subscription-model.md)

## Automated Tests (run before manual)

```bash
# Backend
cd backend && source venv/bin/activate
pytest tests/test_cta_tier_unit.py tests/test_lifecycle_templates_unit.py tests/test_lifecycle_scheduler_unit.py -v

# Frontend (when added)
cd frontend && npm test
```

Expected (as of 2026-05-31):
- **Backend: 2020 passed, 40 skipped, 1 unrelated e2e flake** (`tests/e2e/test_macro_risk_e2e.py::test_custom_days` — hits FRED external API, not in any freemium code path)
- **Frontend: 563 passed across 49 test files** (`npm test`, ~9 sec)

Direct freemium-related coverage:
- `is_real_paid_sub` — new rule (access_expires_at no longer gates) → `test_cta_tier_unit.py` (13 tests)
- `lifecycle_templates.render` — all 8 days produce valid email payloads → `test_lifecycle_templates_unit.py` (18 tests)
- `lifecycle_scheduler` pure helpers — `_days_since`, `_already_sent`, `_pick_sample_ticker`, `_behavior_hint` → `test_lifecycle_scheduler_unit.py` (18 tests)
- Updated `test_quota_unit.py` (DAILY_LIMIT=2), `test_personal_digest_cta_unit.py`, `test_sync_resend_unit.py`, `test_brew_router_unit.py`, `AIPaywall.test.tsx`, `for-you/watchlist/page.test.tsx` — all reflect post-freemium expectations
- Deleted obsolete: `test_redeem_entitlements_unit.py`, `test_invites_unit.py`, `TestCreateTrialSubscription` class in `test_funnel_unit.py`

Does NOT cover (needs manual / integration):
- Stripe Checkout redirect from Step 3 modal
- Twitter Digest content fetch in scheduler (D0/D1/D2)
- Resend email actually delivers
- Insforge edge function `update_lifecycle_state` end-to-end
- PaywallGuard copy renders correctly across feature pages

## Manual E2E Checklist

### Prerequisites

1. Backend running locally: `uvicorn app.main:app --reload`
2. Frontend running locally: `npm run dev`
3. Test account: **a fresh account, NOT** `voya.technologies@gmail.com` (that account is backfilled as onboarding-complete)
4. Insforge production DB (migration already applied — confirmed by `npx @insforge/cli db query "SELECT lifecycle_state, reactivation_state, onboarding_completed_at FROM public.subscriptions LIMIT 1"`)

### Group A — New user onboarding flow

| # | Step | Expected |
|---|------|----------|
| A1 | Sign up with brand new email | After email-verification, redirect lands on `/?tour=1` (not `/today`) |
| A2 | Guided Tour starts | Top nav entries `AI 研究助手` / `每日简报` / `投研` / `我的` are highlighted in sequence, and the final step reminds the user to add watchlist stocks |
| A3 | Complete or skip the tour | `POST /api/user/onboarding/complete` fires best-effort; URL cleans back to `/` |
| A4 | Verify in DB: `SELECT onboarding_completed_at FROM public.subscriptions WHERE user_id = '<test-uid>'` | Non-null timestamp when backend completion succeeds |
| A5 | Visit `/?tour=1` again after completion | Tour does not start; URL cleans back to `/` |
| A6 | Visit `/?tour=home` after completion | Tour starts for manual QA/debug preview |
| A7 | Visit `/onboarding` directly afterwards | Route no longer exists; user is not bounced into a stale standalone onboarding flow |

### Group B — For-You setup after signup

Use a second fresh signup.

| # | Step | Expected |
|---|------|----------|
| B1 | Visit `/for-you` with no watchlist | Empty state CTA points to `/for-you/watchlist` |
| B2 | Add symbols in `/for-you/watchlist` | Watchlist persists and `/for-you` can render the preview/digest path |
| B3 | Visit `/for-you/onboarding` | Investment profile page is still available as the real profile setup surface |

### Group C — Existing user backfill

Use a known existing paid user (any of the 146 backfilled accounts from migration).

| # | Step | Expected |
|---|------|----------|
| C1 | Sign in | Redirect goes to `/today` directly (not `/?tour=1`) |
| C2 | Verify in DB: `SELECT onboarding_completed_at FROM public.subscriptions WHERE user_id = '<existing-uid>'` | Non-null timestamp (set by Phase 0 backfill) |

### Group D — Auto-trial gone

| # | Step | Expected |
|---|------|----------|
| D1 | `curl -X POST http://localhost:8000/api/invites/auto-trial -H "Authorization: Bearer <token>"` | 410 Gone, body contains `"detail":"auto_trial_deprecated"` |
| D2 | `curl -X POST http://localhost:8000/api/invites/redeem -d '{"code":"BREW2026"}' -H "Authorization: Bearer <token>" -H "Content-Type: application/json"` | 410 Gone, body contains `"detail":"redeem_deprecated"` |
| D3 | Browser DevTools after fresh OAuth signup | No POST to `/invites/auto-trial` in network log (frontend stopped calling it) |
| D4 | `grep -r AUTO_TRIAL_KEY frontend/src/` | No matches (key removed from AuthContext) |

### Group E — Research quota 2/day

| # | Step | Expected |
|---|------|----------|
| E1 | As free user, go to `/today` | `<QuotaBanner />` shows "今天还可以: 2 次 AI 投研对话" with "升级 Max 无限使用 →" link |
| E2 | Open `/research`, ask 1 question | Quota indicator in research page shows `1/2` remaining = 1 |
| E3 | Ask 2nd question | Succeeds; remaining = 0 |
| E4 | Try 3rd question | Blocked with "今日 2 次免费提问已用完" |
| E5 | As Max user, repeat | No quota banner on `/today`, unlimited questions on `/research` |

### Group F — Watchlist hard 25 (no tier difference)

| # | Step | Expected |
|---|------|----------|
| F1 | As any user on `/for-you/watchlist`, add 25 stocks | Allowed; counter shows `25/25` |
| F2 | Try to add 26th via search or popular-group buttons | Blocked at frontend (search-result disabled, popular-button disabled) |
| F3 | `curl -X PUT $API/brew/watchlist -H "Authorization: Bearer <token>" -d '{"symbols":[<26 symbols>]}'` | 422 Unprocessable Entity from Pydantic (`max_length=25`) |
| F4 | Repeat F1-F3 as Max user | Same behavior — Max has no watchlist privilege |

### Group G — PaywallGuard copy

| # | Step | Expected |
|---|------|----------|
| G1 | As unauthenticated visitor on `/research` | LockScreen shows "免费注册" + "升级 Pro" CTAs. No "14 天 / 试用" text anywhere. |
| G2 | As free user on `/research`, hit lock | "此功能需要 Max 订阅" / "升级 Max" — clean Max upsell |
| G3 | As Pro user on `/research` (twitter_digest gated by Max) | "Pro 升级到 Max" flow with Crown icon |
| G4 | Search HTML rendered for any of those screens | No occurrence of "14 天" or "auto-trial" or "trial-used" |

### Group H — Lifecycle scheduler (retired)

The lifecycle onboarding scheduler and the older Day 3/7/14 drip emails are no
longer active. This section is historical only; current `onboarding_drip` cron
calls return `disabled=true` and send no email.

| # | Step | Expected |
|---|------|----------|
| H1 | `curl -X POST http://localhost:8000/api/cron/onboarding-emails -H "X-Cron-Secret: <CRON_SECRET>"` | Returns `{success: true, disabled: true, sent: 0}` |
| H2 | Check Resend dashboard for this cron window | No onboarding drip email is sent |

### Group I — Edge function `update_lifecycle_state`

| # | Step | Expected |
|---|------|----------|
| I1 | `curl -X POST $OSS/functions/subscriptions?action=update_lifecycle_state -d '{"user_id":"<uid>","patch":{"intro_sent_count":1}}' -H "Authorization: Bearer $ANON_KEY"` | Returns success with merged `lifecycle_state` |
| I2 | Second call with `{"intro_sent_count":2, "extra_key":"x"}` | Merged result: `{"intro_sent_count": 2, "extra_key": "x"}` (top-level overwrite) |

## Pending product setup (user manual action)

1. **Lifecycle cron status**: the lifecycle onboarding workflow was reverted on 2026-06-04; do not add a new GitHub Actions cron. The Insforge `Cron - Onboarding Drip` (`0 23 * * *`) may still call `cron-trigger`, but backend returns a disabled no-op.
2. **Old drip retirement**: completed on 2026-06-06. `backend/app/features/notification/onboarding.py` remains only as a legacy no-op so existing cron calls do not send email.

(Resend segment + Stripe `watchlist_unlimited` feature, mentioned in earlier drafts, are no longer needed — the scheduler sends per-user not per-segment, and watchlist limit is now uniform 25.)

## Out-of-scope (deferred)

- Behavior-trigger emails (Phase 4 in plan, not in this round)
- Reactivation cohort flow for expired-trial users (Phase 3 in plan)
- Server-side onboarding middleware guard — current flow relies on auth callback + client `OnboardingGate`; middleware remains cookie-gate only.
