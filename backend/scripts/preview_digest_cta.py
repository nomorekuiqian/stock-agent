"""
Render the personal digest email twice (paid vs upsell) and write to /tmp.

Pulls voya's most recent saved digest from Insforge so the body content is
realistic. Then renders the same data with both cta_variant values, writes
the HTML files, and prints macOS `open` commands for easy side-by-side view.

Usage:
    cd backend
    source venv/bin/activate
    PYTHONPATH=. python scripts/preview_digest_cta.py
"""

from __future__ import annotations

import asyncio
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

from app.core.database import get_insforge_service  # noqa: E402
from app.features.brew.db import get_user_digest, list_user_digests  # noqa: E402
from app.features.subscription.email_templates import format_digest_html  # noqa: E402
from app.utils.timezone import today_str  # noqa: E402

VOYA_EMAIL = "voya.technologies@gmail.com"


async def resolve_user_id(email: str):
    service = get_insforge_service()
    result = await service.call_function(
        "subscriptions",
        method="GET",
        params={"action": "list_user_profiles"},
    )
    data = result.get("data", {}) or {}
    if not data.get("success"):
        return None
    for profile in data.get("data", []):
        if (profile.get("email") or "").lower() == email.lower():
            return profile.get("user_id")
    return None


async def fetch_latest_digest(user_id: str) -> dict | None:
    """Try today's digest first, then fall back to most recent."""
    today_digest = await get_user_digest(user_id, today_str())
    if today_digest:
        return today_digest
    history = await list_user_digests(user_id, limit=1)
    return history[0] if history else None


def _digest_to_render_data(record: dict) -> dict:
    """Convert a saved DB digest row into the dict shape format_digest_html expects."""
    digest_data = record.get("digest_data") or {}
    return {
        "greeting": record.get("greeting") or digest_data.get("greeting", ""),
        "one_line_summary": record.get("one_line_summary") or digest_data.get("one_line_summary", ""),
        "stocks": digest_data.get("stocks") or record.get("stocks", []),
        "news": digest_data.get("news") or record.get("news", {}),
        "events": digest_data.get("events") or record.get("events", []),
        "summary": digest_data.get("summary") or record.get("summary", {}),
        "timestamp": record.get("created_at") or record.get("timestamp", ""),
        "digest_date": record.get("digest_date", today_str()),
    }


async def main():
    user_id = await resolve_user_id(VOYA_EMAIL)
    if not user_id:
        print(f"Could not resolve {VOYA_EMAIL}")
        return
    print(f"voya user_id: {user_id}")

    record = await fetch_latest_digest(user_id)
    if not record:
        print("No digest found in DB. Run scripts/run_voya_digest.py first.")
        return

    data = _digest_to_render_data(record)
    print(f"Using digest from {data.get('digest_date')}, "
          f"stocks={len(data['stocks'])}, "
          f"headlines={len((data.get('news') or {}).get('headlines', []))}")

    out_dir = Path("/tmp")
    paid_path = out_dir / "voya_digest_paid.html"
    upsell_path = out_dir / "voya_digest_upsell.html"

    paid_html = format_digest_html(data, "Voya", cta_variant="paid")
    upsell_html = format_digest_html(data, "Voya", cta_variant="upsell")

    paid_path.write_text(paid_html, encoding="utf-8")
    upsell_path.write_text(upsell_html, encoding="utf-8")

    delta = len(upsell_html) - len(paid_html)
    print()
    print(f"paid (real subscribers, no CTA):  {paid_path}  ({len(paid_html):,} chars)")
    print(f"upsell (trial / free, with CTA):  {upsell_path}  ({len(upsell_html):,} chars)")
    print(f"diff (CTA block size): +{delta:,} chars")
    print()
    print("Open in browser:")
    print(f"  open '{paid_path}' '{upsell_path}'")
    print()
    print("Sanity:")
    print(f"  upsell has Max upgrade button:    {'升级 Max' in upsell_html}")
    print(f"  upsell has Pro upgrade button:    {'升级 Pro' in upsell_html}")
    print(f"  upsell has the four feature line: {'更高级的模型' in upsell_html and '更深度的推理' in upsell_html and '持仓监控' in upsell_html and '事件提醒' in upsell_html}")
    print(f"  upsell avoids '简化版' framing:    {'简化版' not in upsell_html}")
    print(f"  upsell does NOT name model:       {'Gemini' not in upsell_html and 'GPT' not in upsell_html}")
    print(f"  upsell omits 25 / 盘前早报 / 宏观周报: {'25 只' not in upsell_html and '盘前早报' not in upsell_html and '宏观周报' not in upsell_html}")
    print(f"  paid is CTA-free:                 {'升级' not in paid_html}")


if __name__ == "__main__":
    asyncio.run(main())
