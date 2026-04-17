"""
Clean up the `macro_dashboard` entitlement from Stripe.

After opening the /macro/* dashboard to all users as a lead-gen surface,
this script detaches the `macro_dashboard` Feature from every Product
that still has it attached, then optionally archives the Feature itself.

The Stripe entitlements webhook (`entitlements.active_entitlement_summary.updated`)
will fire for each active subscriber when the feature is detached, which
causes the backend to refresh their `subscriptions.entitlements` column
without `macro_dashboard`. No manual user sync is needed.

Usage:
    cd backend
    source venv/bin/activate

    # Dry run (default): list what would be changed without modifying Stripe
    python scripts/cleanup_macro_entitlement.py

    # Detach the feature from all attached products
    python scripts/cleanup_macro_entitlement.py --apply

    # Detach AND archive the feature itself (active=false)
    python scripts/cleanup_macro_entitlement.py --apply --archive

Exit codes:
    0 — success
    1 — config error or unrecoverable Stripe failure
"""

import argparse
import os
import sys
from typing import Optional

# Allow running from backend/ directory
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import stripe  # noqa: E402

from app.core.config import STRIPE_SECRET_KEY  # noqa: E402
from app.core.logging import get_logger  # noqa: E402

logger = get_logger(__name__)

FEATURE_LOOKUP_KEY = "macro_dashboard"


def find_feature(lookup_key: str) -> Optional[dict]:
    """Find a Stripe Feature by its lookup_key."""
    resp = stripe.entitlements.Feature.list(lookup_keys=[lookup_key], limit=10)
    features = resp.get("data") or []
    if not features:
        return None
    if len(features) > 1:
        logger.warning(
            "Found %d features with lookup_key=%s, using first", len(features), lookup_key
        )
    return features[0]


def list_products_with_feature(feature_id: str) -> list[dict]:
    """List every Product that has the given Feature attached."""
    # Stripe does not expose a reverse index of product->features by feature.
    # We iterate over products (limit=100 per page) and check their features.
    attached: list[dict] = []
    starting_after: Optional[str] = None
    while True:
        kwargs = {"limit": 100, "active": True}
        if starting_after:
            kwargs["starting_after"] = starting_after
        page = stripe.Product.list(**kwargs)
        for product in page.get("data", []):
            feats = stripe.Product.list_features(product["id"], limit=100)
            for pf in feats.get("data", []):
                feat = pf.get("entitlement_feature") or {}
                if feat.get("id") == feature_id:
                    attached.append({
                        "product_id": product["id"],
                        "product_name": product.get("name"),
                        "product_feature_id": pf["id"],
                    })
                    break
        if not page.get("has_more"):
            break
        starting_after = page["data"][-1]["id"]
    return attached


def detach_feature(product_id: str, product_feature_id: str) -> None:
    """Detach a ProductFeature from its Product."""
    stripe.Product.delete_feature(product_id, product_feature_id)


def archive_feature(feature_id: str) -> None:
    """Archive a Feature (active=False). The feature is not deleted—Stripe
    retains historical references, but it no longer attaches to new products."""
    stripe.entitlements.Feature.modify(feature_id, active=False)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="Actually detach (default: dry run)")
    parser.add_argument("--archive", action="store_true", help="Also archive the feature after detaching")
    args = parser.parse_args()

    if not STRIPE_SECRET_KEY:
        print("ERROR: STRIPE_SECRET_KEY not configured", file=sys.stderr)
        return 1

    stripe.api_key = STRIPE_SECRET_KEY
    mode = "APPLY" if args.apply else "DRY-RUN"
    print(f"Mode: {mode}")
    print(f"Target feature: lookup_key={FEATURE_LOOKUP_KEY}")
    print()

    feature = find_feature(FEATURE_LOOKUP_KEY)
    if not feature:
        print(f"No feature found with lookup_key={FEATURE_LOOKUP_KEY} — nothing to do.")
        return 0

    feature_id = feature["id"]
    print(f"Found feature: id={feature_id} name={feature.get('name')!r} active={feature.get('active')}")
    print()

    print("Scanning products for attached feature…")
    attached = list_products_with_feature(feature_id)
    if not attached:
        print("No products currently have this feature attached.")
    else:
        print(f"Found {len(attached)} product(s) with this feature:")
        for item in attached:
            print(f"  - product={item['product_id']} ({item['product_name']!r}) product_feature={item['product_feature_id']}")

    if args.apply and attached:
        print()
        print("Detaching…")
        for item in attached:
            try:
                detach_feature(item["product_id"], item["product_feature_id"])
                print(f"  ✓ detached from {item['product_id']}")
            except Exception as exc:
                print(f"  ✗ FAILED to detach from {item['product_id']}: {exc}", file=sys.stderr)
                return 1

    if args.archive:
        print()
        if args.apply:
            try:
                archive_feature(feature_id)
                print(f"✓ Archived feature {feature_id} (active=false)")
            except Exception as exc:
                print(f"✗ FAILED to archive feature: {exc}", file=sys.stderr)
                return 1
        else:
            print(f"[dry-run] would archive feature {feature_id}")

    print()
    if args.apply:
        print("Done. Stripe will fire entitlements.active_entitlement_summary.updated")
        print("webhooks for each affected subscriber, refreshing their backend cache.")
    else:
        print("Dry run complete. Re-run with --apply to make changes.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
