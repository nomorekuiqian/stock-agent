"""Business logic for partner/community Agent access."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable

from app.features.community_access.models import PARTNER_PANDA

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def normalize_email(value: str | None) -> str:
    return (value or "").strip().lower()


def is_valid_email(value: str) -> bool:
    return bool(_EMAIL_RE.match(normalize_email(value)))


def extract_email_candidates(*, emails_text: str = "", emails: Iterable[str] = ()) -> list[str]:
    """Extract email-like tokens from pasted text plus explicit list input."""
    candidates: list[str] = []
    candidates.extend(str(item or "") for item in emails)
    if emails_text:
        candidates.extend(re.findall(r"[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+", emails_text))
    return candidates


@dataclass(frozen=True)
class GrantPlan:
    total_input: int
    valid: list[str]
    invalid: list[str]
    duplicates: list[str]


def build_grant_plan(*, emails_text: str = "", emails: Iterable[str] = ()) -> GrantPlan:
    candidates = extract_email_candidates(emails_text=emails_text, emails=emails)
    seen: set[str] = set()
    valid: list[str] = []
    invalid: list[str] = []
    duplicates: list[str] = []

    for raw in candidates:
        normalized = normalize_email(raw)
        if not normalized:
            continue
        if not is_valid_email(normalized):
            invalid.append(str(raw).strip())
            continue
        if normalized in seen:
            duplicates.append(normalized)
            continue
        seen.add(normalized)
        valid.append(normalized)

    return GrantPlan(
        total_input=len([item for item in candidates if str(item or "").strip()]),
        valid=valid,
        invalid=invalid,
        duplicates=duplicates,
    )


async def has_panda_agent_access(*, user_id: str, email: str | None) -> bool:
    from app.features.community_access.db import get_active_grant_by_email, mark_grant_seen

    normalized = normalize_email(email)
    if not normalized:
        return False
    grant = await get_active_grant_by_email(PARTNER_PANDA, normalized)
    if not grant:
        return False
    await mark_grant_seen(PARTNER_PANDA, normalized, user_id)
    return True

