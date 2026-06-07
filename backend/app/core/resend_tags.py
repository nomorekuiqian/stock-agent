"""Small helpers for Resend email event tags."""

from typing import Any


def resend_channel_tags(channel: str, **extra: Any) -> list[dict[str, str]]:
    """Return Resend-compatible tags for webhook channel attribution."""
    tags = [{"name": "channel", "value": channel}]
    for name, value in extra.items():
        if value is None or value == "":
            continue
        tags.append({"name": name, "value": str(value)})
    return tags
