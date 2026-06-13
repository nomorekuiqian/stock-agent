# Subscription & Permissions Verification Plan

Scope: Stripe subscription/entitlement sync, `subscriptions` account-state fields, frontend profile display, backend entitlement gates, and Resend segment sync.

## Invariants

- `subscriptions` is the single local account-state table.
- `plan/status/access_expires_at/is_lifetime` drive profile/account display.
- `entitlements` drives feature access.
- Backend endpoints are the security boundary. Frontend gates are display only.
- Stripe Active Entitlements are authoritative for paid subscriptions.
- Non-Stripe grants may use `access_expires_at`, but read-time gates and daily reconciliation must remove access after expiry.

## Automated Unit Tests

Backend:

```bash
cd backend
source venv/bin/activate
pytest \
  tests/test_stock_auth_unit.py \
  tests/test_payment_unit.py \
  tests/test_webhook_entitlements_unit.py \
  tests/test_entitlements_unit.py \
  tests/test_me_entitlements_unit.py \
  tests/test_subscription_sync_user_unit.py \
  -q
```

Coverage:
- Stock AI cache/generate endpoints reject anonymous users and users without `stock_research`.
- Entitled Stock AI user can read cached AI content and hit generation cache.
- Stripe entitlement sync writes `plan/status/entitlements` and clears stale `access_expires_at`.
- `subscription.updated` sync failures return 502 for Stripe retry.
- `subscription.deleted` preserves replacement `trialing` subscriptions.
- Expired-grant list failures surface to cron instead of returning fake success.
- `/subscriptions/sync-user` uses token identity and rejects mismatched body identity.

Frontend:

```bash
cd frontend
npm test -- \
  src/hooks/queries/__tests__/use-stock-data.test.tsx \
  src/lib/__tests__/api.test.ts \
  src/components/__tests__/Providers.test.tsx \
  src/components/__tests__/AuthSubscriptionSync.test.tsx \
  src/contexts/__tests__/AuthContext.test.tsx
npm test -- \
  src/app/pricing/success/__tests__/page.test.tsx \
  src/components/__tests__/PaywallGuard.test.tsx
```

Coverage:
- Stock AI hooks send Bearer token for cache/generation calls.
- `api.subscriptions.syncUser()` sends Bearer token.
- `SubscriptionContext` and Profile display use app account state and tolerate Stripe `trialing`.

## E2E / Integration Tests

Backend ASGI e2e:

```bash
cd backend
source venv/bin/activate
pytest tests/e2e/test_stock_e2e.py tests/e2e/test_stock_technical_e2e.py -q
pytest tests/e2e/test_research_e2e.py tests/e2e/test_research_quota_e2e.py -q
```

Expected:
- Anonymous Stock AI cache request returns 401.
- Authenticated + patched entitlement Stock AI cache/validation flows return expected 200/400/422.
- Research quota remains Max-entitlement based and is not affected by profile display changes.

Frontend Playwright e2e:

```bash
cd frontend
npm run test:e2e -- stock-paywall.spec.ts
npm run test:e2e -- pricing-success.spec.ts
```

Required scenarios:
- Free logged-in user visiting `/stock/AAPL` sees paywall and no Stock AI POST/GET cache calls are made.
- Max logged-in user visiting `/stock/AAPL` triggers Stock AI cache calls with Authorization header.
- Checkout success page polls both `subscription-status?fresh=true` and `me/entitlements?fresh=true` and redirects only when target tier entitlements are ready.

## Stripe Sandbox Parity Checklist

Use Stripe Sandboxes for QA. Sandbox objects and live objects are isolated, so product IDs, price IDs, webhook endpoints, and signing secrets must be configured separately.

1. Create or select a sandbox in Stripe Dashboard.
2. Copy production Product structure into sandbox:
   - Pro product with current monthly/annual Prices.
   - Max product with current monthly/annual Prices.
   - Product metadata `tier=pro|max` if production uses it.
3. Configure sandbox Features / Entitlements to match production lookup keys:
   - Pro: `morning_report_email`, `weekly_report_email`, `personal_digest_email`, `watchlist_extended`, `today_website`, `for_you_website`, `morning_website`
   - Max-only: `stock_research`, `ai_research_engine`, `portfolio_management`, `twitter_digest`
4. Attach the same feature set to sandbox Pro/Max products as production.
5. Configure backend sandbox env:
   - `STRIPE_SECRET_KEY=<sandbox sk_...>`
   - `STRIPE_WEBHOOK_SECRET=<sandbox whsec_...>`
   - `STRIPE_PRO_PRICE_ID=<sandbox Pro price>`
   - `STRIPE_MAX_PRICE_ID=<sandbox Max price>`
6. Configure webhook endpoint in sandbox with the same event set as production:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `entitlements.active_entitlement_summary.updated`
   - `customer.subscription.trial_will_end`
7. For local webhook testing, run:

```bash
stripe listen \
  --use-configured-webhooks \
  --forward-to localhost:8000/api/payment/webhook
```

Use the printed `whsec_...` as local `STRIPE_WEBHOOK_SECRET`.

8. Use Stripe test cards and sandbox test customers only. Do not mix live price/customer IDs with sandbox keys.

## Manual Sandbox Verification

Prerequisites:
- Backend running locally with sandbox env: `uvicorn app.main:app --reload`
- Frontend running locally: `npm run dev`
- Stripe CLI forwarding webhooks to `/api/payment/webhook`
- Test Insforge user with clean `subscriptions` row or no row

Steps:

| Step | Action | Expected |
|---|---|---|
| 1 | Buy Pro through local Checkout | `checkout.session.completed` writes customer/subscription IDs; entitlement sync eventually writes `plan=pro`, `status=active`, Pro entitlements, `access_expires_at=NULL` |
| 2 | Visit `/profile` | Shows Pro from `plan/status`, not from old `isPro` fallback |
| 3 | Try `/stock/AAPL` as Pro | Frontend/Backend deny Stock AI (`stock_research` missing) |
| 4 | Upgrade to Max | `entitlements.active_entitlement_summary.updated` writes `plan=max` and full Max entitlements |
| 5 | Visit `/stock/AAPL` as Max | Stock AI cache/generate calls include Bearer token and return 200 |
| 6 | Cancel Max in Customer Portal | `subscription.deleted` + entitlement webhook clear entitlements, write free/canceled, sync Resend segments |
| 7 | Create Stripe trialing subscription in sandbox | Profile treats `trialing` as active; deleted webhook does not clear access if a replacement trialing sub exists |
| 8 | Grant expiring admin subscription, then run cron endpoint after expiry | `POST /api/payment/reconcile-expired-grants` clears plan/status/entitlements and syncs Resend |
| 9 | Revoke lifetime grant | `is_lifetime=false`, `plan=free`, `status=canceled`, `entitlements=[]`, `access_expires_at=NULL` |
| 10 | Call `/api/subscriptions/sync-user` with mismatched body user/email | 403; matching token/body succeeds and updates Resend metadata |

## Production Readiness Gate

Before deploying:
- All targeted backend unit tests pass.
- All targeted frontend unit tests pass.
- Backend ASGI stock/payment e2e pass without `--run-generate`.
- `python -m py_compile` passes for changed backend modules.
- `node --check` passes for changed edge functions.
- `npm run lint` and `npx tsc --noEmit` pass or any unrelated pre-existing failures are documented.
- Sandbox webhook delivery shows 2xx for the four required event types.
- DB spot checks confirm `access_expires_at` is null for paid Stripe users and expired grants are free/expired.

## Verification Run - 2026-06-06

Automated checks completed:

- `backend/venv/bin/python -m py_compile ...` for changed backend modules/tests: passed.
- `node --check backend/app/edge_functions/subscriptions.js`: passed.
- `cd backend && venv/bin/pytest tests/test_architecture.py tests/test_stock_auth_unit.py tests/test_subscription_sync_user_unit.py tests/test_webhook_entitlements_unit.py tests/test_payment_unit.py tests/test_action_bar.py -v`: 100 passed, 30 skipped.
- `cd backend && venv/bin/pytest tests/test_entitlements_unit.py tests/test_cta_tier_unit.py tests/test_quota_unit.py tests/test_pro_gate_unit.py -v`: 55 passed.
- `cd backend && venv/bin/pytest tests/e2e/test_stock_e2e.py tests/e2e/test_stock_technical_e2e.py -v`: 27 passed, 3 skipped.
- `cd frontend && npm test -- src/hooks/queries/__tests__/use-stock-data.test.tsx src/lib/__tests__/api.test.ts src/components/__tests__/Providers.test.tsx src/components/__tests__/AuthSubscriptionSync.test.tsx src/contexts/__tests__/AuthContext.test.tsx`: 121 passed.
- `cd frontend && npm test -- src/app/pricing/success/__tests__/page.test.tsx src/components/__tests__/PaywallGuard.test.tsx`: 7 passed.
- `cd frontend && npx tsc --noEmit --pretty false`: passed.
- `cd frontend && npm run lint`: passed with 44 warnings, 0 errors. Warnings are existing unused/deps warnings outside this permissions change set.
- `git diff --check`: passed.

Stripe sandbox/test-mode parity completed with Stripe CLI:

- Created test-mode webhook endpoint for `https://stock-agent-production.up.railway.app/api/payment/webhook`.
- Test and live webhook endpoints now have the same enabled events and API version `2026-01-28.clover`.
- Test Pro product feature lookup keys match live Pro.
- Test Max product feature lookup keys now match live Max after adding and attaching `portfolio_management` and `twitter_digest`.
- Test prices match live prices by tier: Pro `$4.99/month`, Max `$9.99/month`.
