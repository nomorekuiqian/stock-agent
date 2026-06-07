"""
Discord webhook configuration.

Maps logical channel names to webhook URLs. URLs are read from environment
variables (secrets) so this module carries no secret and is safe to commit.

Set the actual webhook URL in the deployment environment (and local .env):
    DISCORD_WEBHOOK_REPORT -> "市场日报" (daily / morning / twitter digest)
"""

import os
from typing import Optional

DISCORD_WEBHOOKS: dict[str, str] = {
    # 收盘日报 + 盘前早报 + 推特 KOL 日报 广播同步推送到此频道（card / embed 模式）
    "市场日报": os.getenv("DISCORD_WEBHOOK_REPORT", ""),
}

# Logical channel used by the daily / morning / twitter report broadcasts.
REPORT_CHANNEL = "市场日报"


def get_webhook_url(channel: str) -> Optional[str]:
    """Return the webhook URL for a channel, or None if not configured."""
    return DISCORD_WEBHOOKS.get(channel) or None


def list_channels() -> list[str]:
    """Return channel names that have a webhook URL configured."""
    return [name for name, url in DISCORD_WEBHOOKS.items() if url]
