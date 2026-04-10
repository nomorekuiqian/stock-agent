# Entitlements Migration - Manual Steps

> These steps require human action (Stripe Dashboard, Insforge Dashboard, Railway).
> Complete them before deploying the code changes.

## 1. Stripe: Create 10 Features (test mode + live mode)

Do this in **test mode first**, then repeat in **live mode**.

```bash
# Pro features (7) - attach to BOTH Pro and Max products
stripe entitlements features create --lookup-key="morning_report_email" --name="Morning Report Email"
stripe entitlements features create --lookup-key="weekly_report_email" --name="Weekly Report Email"
stripe entitlements features create --lookup-key="personal_digest_email" --name="Personal Digest Email"
stripe entitlements features create --lookup-key="watchlist_extended" --name="Extended Watchlist (25)"
stripe entitlements features create --lookup-key="today_website" --name="Today Website"
stripe entitlements features create --lookup-key="for_you_website" --name="For You Website"
stripe entitlements features create --lookup-key="morning_website" --name="Morning Website"

# Max-only features (3) - attach to Max product only
stripe entitlements features create --lookup-key="macro_dashboard" --name="Macro Dashboard"
stripe entitlements features create --lookup-key="stock_research" --name="Stock Research"
stripe entitlements features create --lookup-key="ai_research_engine" --name="AI Research Engine"
```

## 2. Stripe: Attach Features to Products

Find your product IDs:
```bash
stripe prices retrieve "${STRIPE_PRO_PRICE_ID}"   # -> note product ID
stripe prices retrieve "${STRIPE_MAX_PRICE_ID}"    # -> note product ID
```

Attach to Pro product (7 features):
```bash
PRO_PRODUCT_ID="prod_xxx"  # replace with actual

stripe product_features create $PRO_PRODUCT_ID --entitlement-feature="feat_xxx"  # morning_report_email
stripe product_features create $PRO_PRODUCT_ID --entitlement-feature="feat_xxx"  # weekly_report_email
stripe product_features create $PRO_PRODUCT_ID --entitlement-feature="feat_xxx"  # personal_digest_email
stripe product_features create $PRO_PRODUCT_ID --entitlement-feature="feat_xxx"  # watchlist_extended
stripe product_features create $PRO_PRODUCT_ID --entitlement-feature="feat_xxx"  # today_website
stripe product_features create $PRO_PRODUCT_ID --entitlement-feature="feat_xxx"  # for_you_website
stripe product_features create $PRO_PRODUCT_ID --entitlement-feature="feat_xxx"  # morning_website
```

Attach to Max product (all 10):
```bash
MAX_PRODUCT_ID="prod_xxx"  # replace with actual

# Same 7 Pro features
stripe product_features create $MAX_PRODUCT_ID --entitlement-feature="feat_xxx"  # morning_report_email
stripe product_features create $MAX_PRODUCT_ID --entitlement-feature="feat_xxx"  # weekly_report_email
stripe product_features create $MAX_PRODUCT_ID --entitlement-feature="feat_xxx"  # personal_digest_email
stripe product_features create $MAX_PRODUCT_ID --entitlement-feature="feat_xxx"  # watchlist_extended
stripe product_features create $MAX_PRODUCT_ID --entitlement-feature="feat_xxx"  # today_website
stripe product_features create $MAX_PRODUCT_ID --entitlement-feature="feat_xxx"  # for_you_website
stripe product_features create $MAX_PRODUCT_ID --entitlement-feature="feat_xxx"  # morning_website

# Plus 3 Max-only
stripe product_features create $MAX_PRODUCT_ID --entitlement-feature="feat_xxx"  # macro_dashboard
stripe product_features create $MAX_PRODUCT_ID --entitlement-feature="feat_xxx"  # stock_research
stripe product_features create $MAX_PRODUCT_ID --entitlement-feature="feat_xxx"  # ai_research_engine
```

## 3. Stripe: Subscribe Webhook to New Events

In Stripe Dashboard -> Developers -> Webhooks, add these events to the endpoint:
- `entitlements.active_entitlement_summary.updated` (NEW)
- `customer.subscription.trial_will_end` (NEW)
- Keep existing: `customer.subscription.created`, `updated`, `deleted`

## 4. Insforge: Add `entitlements` Column

Run this SQL in Insforge Dashboard (or via MCP):
```sql
ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS entitlements JSONB DEFAULT '[]'::jsonb;
```

## 5. Stripe: Backfill Existing Subscription Metadata

```bash
stripe subscriptions update sub_1THIUfKBW0cac2K4finfoA4c -d "metadata[tier]=max"
```

## 6. Railway: Confirm Environment Variables

Verify these are set:
- `EMAIL_PRO_GATE=true`
- `STRIPE_MAX_PRICE_ID` is set (needed for invite trial)

## 7. Verify After Deployment

```bash
# Test mode: create a Pro subscription and check entitlements
stripe entitlements active_entitlements list --customer=cus_xxx

# Should return 7 Pro features for Pro sub, 10 for Max sub
```

## Completion Checklist

- [ ] 10 features created in Stripe test mode
- [ ] 10 features created in Stripe live mode
- [ ] Features attached to Pro product (7)
- [ ] Features attached to Max product (10)
- [ ] Webhook endpoint subscribed to new events
- [ ] Insforge `entitlements` column added
- [ ] `sub_1THIUfKBW0cac2K4finfoA4c` metadata backfilled
- [ ] Railway `EMAIL_PRO_GATE=true` confirmed
- [ ] Railway `STRIPE_MAX_PRICE_ID` confirmed
