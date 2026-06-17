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
    admin_default: bool = False
    # Explicit email allowlist: these accounts get the flag with no DB row and
    # without being ADMIN_EMAILS. Use for tightly-scoped tester-only previews.
    emails: tuple[str, ...] = ()


KNOWN_FLAGS: list[FlagDef] = [
    FlagDef("for_you_v2", "新版专属页面（onboarding/portfolio/redesigned toolbar）"),
    FlagDef("holdings_sync_import", "Track M 手动/导入持仓同步(截图/粘贴/CSV/PDF)"),
    FlagDef(
        "kol_chat",
        "KOL 方法论对话入口（qinbafrank 蒸馏体）— 初期仅 admin 灰度",
        admin_default=True,
    ),
    FlagDef(
        "kol_research_agent",
        "博主投研 Agent（/research UI + qinbafrank persona overlay）— 初期仅 admin 灰度",
        admin_default=True,
    ),
    FlagDef(
        "pandacircle_persona",
        "潘大的科技交流圈 KOL persona（/research RAG）— 仅指定测试账号灰度",
        emails=("kedengpan@gmail.com", "voya.technologies@gmail.com"),
    ),
    FlagDef(
        "watchlist_monitor_test_universe",
        "AI Watchlist Monitor test-universe cron（仅 Voya + owner dry-run 账号）",
    ),
]


def is_known_flag(key: str) -> bool:
    return any(f.key == key for f in KNOWN_FLAGS)


def admin_default_flags() -> set[str]:
    """Flags auto-granted to ADMIN_EMAILS users without needing a DB row."""
    return {f.key for f in KNOWN_FLAGS if f.admin_default}


def email_allowlisted_flags(email: str | None) -> set[str]:
    """Flags explicitly granted to a specific email via `FlagDef.emails`.

    Independent of ADMIN_EMAILS / admin_default — lets a flag target named
    tester accounts (e.g. a single email) without a DB row or admin status.
    """
    if not email:
        return set()
    needle = email.lower()
    return {
        f.key
        for f in KNOWN_FLAGS
        if needle in {addr.lower() for addr in f.emails}
    }
