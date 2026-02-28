# Stripe Payment MVP Launch Guide

## Current Status

Payment code is deployed but **disabled** via feature flag `NEXT_PUBLIC_ENABLE_PAYWALL=false`. All existing functionality不受影响。

---

## Part 1: Manual Steps (You)

### Step 1: Register Stripe Account

1. Go to https://dashboard.stripe.com/register
2. Sign up with email, fill basic info
3. You'll start in **Test Mode** (no bank info needed yet)

### Step 2: Get API Keys

1. Stripe Dashboard -> Developers -> API Keys
2. Copy **Secret key** (`sk_test_...`)
3. Add to `backend/.env`:
   ```
   STRIPE_SECRET_KEY=sk_test_...
   ```

### Step 3: Create Product & Price

1. Dashboard -> Product Catalog -> Add Product
2. Name: `TheMarketBrew Pro`
3. Add a **Recurring** price -> Monthly -> set amount (e.g. $9.99)
4. Save, copy the **Price ID** (`price_...`)
5. Add to `backend/.env`:
   ```
   STRIPE_PRO_PRICE_ID=price_...
   ```

### Step 4: Configure Webhook (Local Dev)

1. Install Stripe CLI: `brew install stripe/stripe-cli/stripe`
2. Login: `stripe login`
3. Forward webhooks: `stripe listen --forward-to localhost:8000/api/payment/webhook`
4. Copy the signing secret (`whsec_...`) from terminal output
5. Add to `backend/.env`:
   ```
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```

### Step 5: Test End-to-End (Local)

1. Start backend: `cd backend && source venv/bin/activate && uvicorn app.main:app --reload`
2. Start frontend: `cd frontend && npm run dev`
3. Keep Stripe CLI webhook forwarding running in another terminal
4. Temporarily set `NEXT_PUBLIC_ENABLE_PAYWALL=true` in `frontend/.env.local`
5. Login with test account -> visit `/for-you` -> see paywall
6. Click "Subscribe to Pro" -> redirected to Stripe Checkout
7. Use test card `4242 4242 4242 4242` (any expiry, any CVC)
8. Complete payment -> redirected back -> page unlocks
9. Check Stripe Dashboard for the subscription
10. Set `NEXT_PUBLIC_ENABLE_PAYWALL=false` back when done testing

### Step 6: Configure Webhook (Production)

1. Dashboard -> Developers -> Webhooks -> Add Endpoint
2. URL: `https://your-backend-domain/api/payment/webhook`
3. Select events:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Copy signing secret -> set as `STRIPE_WEBHOOK_SECRET` in production env

### Step 7: Go Live

1. Set `NEXT_PUBLIC_ENABLE_PAYWALL=true` in production frontend env
2. Redeploy frontend
3. Done - paywall is live

---

## Part 2: Code Tasks (AI)

These are optional improvements to do before or after launch. None are blockers for MVP.

### P0 - Before Launch

- [ ] **Deploy Edge Function to production** - Run `mcp__insforge__create-function` if not already deployed to production Insforge instance
- [ ] **Add production env vars** - Ensure `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_PRICE_ID` are set in production backend

### P1 - Nice to Have

- [ ] **Add "Pro" badge to navigation** - Show a small badge next to user avatar or in the sidebar when user is Pro
- [ ] **Checkout success toast** - Show a success notification when user returns from Stripe Checkout (currently just refreshes subscription state silently)
- [ ] **Pricing page** - A dedicated `/pricing` page explaining free vs pro tiers, with a CTA button
- [ ] **Upgrade button in navbar** - A persistent "Upgrade" button visible to free users in the header/navigation

### P2 - Post-Launch Improvements

- [ ] **Subscription status in user profile** - Show plan, billing period, manage subscription link
- [ ] **Grace period handling** - When subscription is `past_due`, show a warning banner instead of immediately blocking
- [ ] **Annual pricing option** - Add yearly plan with discount, update checkout to support plan selection
- [ ] **Trial period** - Configure Stripe trial days, update UI to show trial status and countdown
- [ ] **Webhook retry logging** - Log webhook events to database for debugging failed deliveries
- [ ] **Email on subscription events** - Send confirmation email on subscribe, reminder on upcoming renewal, notice on cancellation

---

## Environment Variables Summary

### backend/.env (3 new vars needed)

```
STRIPE_SECRET_KEY=sk_test_...        # Step 2
STRIPE_WEBHOOK_SECRET=whsec_...      # Step 4 (local) / Step 6 (production)
STRIPE_PRO_PRICE_ID=price_...        # Step 3
```

### frontend/.env.local (1 new var, already set)

```
NEXT_PUBLIC_ENABLE_PAYWALL=false     # Set to "true" to enable paywall
```

---

## Architecture Reference

```
User clicks "Subscribe to Pro"
  -> Frontend POST /api/payment/checkout-session
  -> Backend creates Stripe Checkout Session
  -> Returns checkout_url -> Frontend redirects to Stripe
  -> User completes payment on Stripe hosted page
  -> Stripe sends webhook -> POST /api/payment/webhook
  -> Backend verifies signature, updates subscriptions table
  -> User redirects back to /for-you?checkout=success
  -> SubscriptionContext refreshes -> isPro = true -> paywall lifts
```

### Files

| File | Purpose |
|------|---------|
| `backend/app/features/payment/router.py` | API endpoints + webhook |
| `backend/app/features/payment/service.py` | Stripe API calls |
| `backend/app/features/payment/db.py` | Database operations |
| `backend/app/edge_functions/subscriptions.js` | Insforge Edge Function |
| `frontend/src/contexts/SubscriptionContext.tsx` | Subscription state |
| `frontend/src/components/PaywallGuard.tsx` | Paywall UI + feature flag |
