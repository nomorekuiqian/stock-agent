"""
Read-only Stripe readiness check for Qinbafrank Ultra launch.

Usage:
    cd backend
    source venv/bin/activate
    python scripts/check_qinbafrank_stripe_readiness.py \
        --webhook-url https://stock-agent-production.up.railway.app/api/payment/webhook

Exit codes:
    0 - all checked Stripe surfaces look ready
    1 - one or more launch checks failed
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import stripe  # noqa: E402

from app.core.config import STRIPE_SECRET_KEY, STRIPE_ULTRA_PRICE_ID  # noqa: E402
from app.core.logging import get_logger  # noqa: E402

logger = get_logger(__name__)

ULTRA_LOOKUP_KEY = "themarketbrew_ultra_monthly"
WEBHOOK_SUFFIX = "/api/payment/webhook"
REQUIRED_PORTAL_PRORATION_BEHAVIOR = "always_invoice"


def _to_dict(obj):
    if hasattr(obj, "to_dict"):
        return obj.to_dict()
    return obj


def _key_mode() -> str:
    if STRIPE_SECRET_KEY.startswith(("sk_live", "rk_live")):
        return "live"
    if STRIPE_SECRET_KEY.startswith(("sk_test", "rk_test")):
        return "test"
    return "unknown"


def _resolve_ultra_price() -> tuple[dict | None, list[str]]:
    issues: list[str] = []
    if STRIPE_ULTRA_PRICE_ID:
        try:
            price = _to_dict(stripe.Price.retrieve(STRIPE_ULTRA_PRICE_ID)) or {}
            if not price.get("active"):
                issues.append("STRIPE_ULTRA_PRICE_ID points to an inactive price")
            return price, issues
        except Exception as e:
            issues.append("STRIPE_ULTRA_PRICE_ID retrieve failed: %s" % e)
            return None, issues

    try:
        response = _to_dict(
            stripe.Price.list(lookup_keys=[ULTRA_LOOKUP_KEY], active=True, limit=1)
        ) or {}
    except Exception as e:
        return None, ["Ultra price lookup failed: %s" % e]

    prices = response.get("data", []) or []
    if not prices:
        return None, [
            "No active Ultra price found by lookup_key=%s and STRIPE_ULTRA_PRICE_ID is unset"
            % ULTRA_LOOKUP_KEY
        ]
    return _to_dict(prices[0]) or {}, issues


def _check_webhook(webhook_url: str | None) -> list[str]:
    issues: list[str] = []
    try:
        response = _to_dict(stripe.WebhookEndpoint.list(limit=100)) or {}
    except Exception as e:
        return ["Webhook endpoint list failed: %s" % e]

    endpoints = response.get("data", []) or []
    enabled = [
        _to_dict(endpoint) or {}
        for endpoint in endpoints
        if (_to_dict(endpoint) or {}).get("status") == "enabled"
    ]
    target = webhook_url.rstrip("/") if webhook_url else None

    if target:
        matched = [endpoint for endpoint in enabled if endpoint.get("url", "").rstrip("/") == target]
        if not matched:
            issues.append("No enabled Stripe webhook endpoint exactly matches %s" % target)
            return issues
    else:
        matched = [
            endpoint
            for endpoint in enabled
            if endpoint.get("url", "").rstrip("/").endswith(WEBHOOK_SUFFIX)
        ]
        if not matched:
            issues.append("No enabled Stripe webhook endpoint ending with %s" % WEBHOOK_SUFFIX)
            return issues

    required_events = {
        "checkout.session.completed",
        "customer.subscription.updated",
        "customer.subscription.deleted",
        "entitlements.active_entitlement_summary.updated",
    }
    for endpoint in matched:
        events = set(endpoint.get("enabled_events") or [])
        if "*" in events or required_events.issubset(events):
            return issues

    issues.append("Matched webhook endpoint does not include all required payment events")
    return issues


def _portal_config_includes_price(price: dict) -> list[str]:
    price_id = price.get("id")
    product_id = price.get("product")
    if not price_id or not product_id:
        return ["Ultra price is missing id or product"]

    try:
        response = _to_dict(stripe.billing_portal.Configuration.list(limit=100)) or {}
    except Exception as e:
        return ["Billing Portal configuration list failed: %s" % e]

    configs = [
        _to_dict(config) or {}
        for config in response.get("data", []) or []
        if (_to_dict(config) or {}).get("active")
    ]
    for config in configs:
        features = config.get("features") or {}
        update = features.get("subscription_update") or {}
        if not update.get("enabled"):
            continue
        allowed_updates = set(update.get("default_allowed_updates") or [])
        if allowed_updates and "price" not in allowed_updates:
            continue
        if update.get("proration_behavior") != REQUIRED_PORTAL_PRORATION_BEHAVIOR:
            continue

        products = update.get("products") or []
        if not products:
            return []
        for product in products:
            if product.get("product") == product_id and price_id in (product.get("prices") or []):
                return []

    return [
        "No active Billing Portal configuration allows subscription_update to Ultra price %s with proration_behavior=%s"
        % (price_id, REQUIRED_PORTAL_PRORATION_BEHAVIOR)
    ]


def main() -> int:
    parser = argparse.ArgumentParser(description="Check Stripe readiness for Qinbafrank Ultra")
    parser.add_argument(
        "--webhook-url",
        help="Expected exact Stripe webhook endpoint URL. If omitted, any enabled endpoint ending in /api/payment/webhook is accepted.",
    )
    parser.add_argument(
        "--require-live",
        action="store_true",
        help="Fail unless STRIPE_SECRET_KEY is a live/restricted-live key. Use this for production launch gates.",
    )
    args = parser.parse_args()

    stripe.api_key = STRIPE_SECRET_KEY
    issues: list[str] = []

    if not STRIPE_SECRET_KEY:
        logger.error("STRIPE_SECRET_KEY is not set")
        return 1

    key_mode = _key_mode()
    logger.info("Stripe key mode: %s", key_mode)
    if args.require_live and key_mode != "live":
        issues.append("Production readiness requires a live Stripe key; current key mode is %s" % key_mode)

    price, price_issues = _resolve_ultra_price()
    issues.extend(price_issues)
    if price:
        logger.info(
            "Ultra price ready: id=%s lookup_key=%s amount=%s currency=%s",
            price.get("id"),
            price.get("lookup_key"),
            price.get("unit_amount"),
            price.get("currency"),
        )
        issues.extend(_portal_config_includes_price(price))

    issues.extend(_check_webhook(args.webhook_url))

    if issues:
        for issue in issues:
            logger.error("NOT READY: %s", issue)
        return 1

    logger.info("Stripe readiness checks passed for Qinbafrank Ultra")
    return 0


if __name__ == "__main__":
    sys.exit(main())
