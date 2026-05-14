"""Canonical registry of known feature flags.

This module is the single source of truth for which flag keys exist.
- Backend admin router validates POST bodies against this list.
- Frontend reads it via `GET /api/admin/flags` → `known_flags` to populate the dropdown.

When introducing a new flag, ADD A LINE HERE and follow
`docs/guides/feature-flags-playbook.md` for the integration / cleanup workflow.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class FlagDef:
    key: str
    description: str


KNOWN_FLAGS: list[FlagDef] = [
    FlagDef("for_you_v2", "新版专属页面（onboarding/portfolio/redesigned toolbar）"),
]


def is_known_flag(key: str) -> bool:
    return any(f.key == key for f in KNOWN_FLAGS)
