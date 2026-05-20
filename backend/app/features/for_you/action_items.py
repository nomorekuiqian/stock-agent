"""Validation and resolution for agent-produced action_items.

Responsibilities:
1. Parse and whitelist target strings.
2. Verify symbol/date references against authoritative user context.
3. Resolve digest:<YYYY-MM-DD> to digest:<uuid> by async lookup.
4. Stable-sort by (priority asc, target asc) and cap at 3.
"""

from typing import Awaitable, Callable

from app.core.logging import get_logger
from app.features.brew.models import ActionItem

logger = get_logger(__name__)

BARE_TARGETS = {"portfolio", "health", "watchlist"}
SECTION_WHITELIST = {"events", "headlines", "briefs", "notes"}


def parse_target(target: str) -> tuple[str, str]:
    """Split 'prefix:payload' into (prefix, payload). Bare targets return ('portfolio', '')."""
    if ":" in target:
        prefix, _, payload = target.partition(":")
        return prefix, payload
    return target, ""


async def validate_and_resolve(
    items: list[ActionItem],
    *,
    user_symbols: set[str],
    missing_thesis: set[str],
    previous_digest_dates: set[str],
    resolve_digest_id: Callable[[str], Awaitable[str | None]],
) -> list[ActionItem]:
    """Filter invalid items, resolve digest date -> uuid, sort, cap at 3.

    Args:
        items: Raw items from the agent.
        user_symbols: Union of portfolio + watchlist symbols (for stock:<SYM>).
        missing_thesis: Subset of portfolio missing thesis (for thesis:<SYM>).
        previous_digest_dates: Allowed dates for digest:<DATE>.
        resolve_digest_id: Async function mapping YYYY-MM-DD -> digest UUID or None.

    Returns:
        Sorted, cleaned list of at most 3 items.
    """
    valid: list[ActionItem] = []
    for item in items:
        prefix, payload = parse_target(item.target)

        if prefix in BARE_TARGETS and not payload:
            valid.append(item)
            continue

        if prefix == "section":
            if payload in SECTION_WHITELIST:
                valid.append(item)
            else:
                logger.warning("Rejected action_item: unknown section '%s'", payload)
            continue

        if prefix == "thesis":
            if payload in missing_thesis:
                valid.append(item)
            else:
                logger.warning("Rejected thesis:%s - not in missing_thesis", payload)
            continue

        if prefix == "stock":
            if payload in user_symbols:
                valid.append(item)
            else:
                logger.warning("Rejected stock:%s - not in user_symbols", payload)
            continue

        if prefix == "digest":
            if payload not in previous_digest_dates:
                logger.warning("Rejected digest:%s - date not in whitelist", payload)
                continue
            uuid = await resolve_digest_id(payload)
            if not uuid:
                logger.warning("Rejected digest:%s - could not resolve to uuid", payload)
                continue
            valid.append(item.model_copy(update={"target": f"digest:{uuid}"}))
            continue

        logger.warning("Rejected action_item: unknown target prefix '%s'", prefix)

    # Stable sort: priority ascending, then target ascending
    valid.sort(key=lambda i: (i.priority, i.target))
    if len(valid) > 3:
        logger.info(
            "action_items: truncating from %d to 3; consider tightening prompt "
            "if this is frequent", len(valid),
        )
    return valid[:3]
