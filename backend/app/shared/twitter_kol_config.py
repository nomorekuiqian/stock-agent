"""
Twitter KOL Catalog - Source of truth for which financial bloggers we ingest.

Phase 1 keeps this list in code; later phases may move it to DB / Admin UI.
"""

from typing import TypedDict


class KolAccount(TypedDict):
    username: str  # Twitter handle without @
    display_name: str  # Human-readable name


# ---------------------------------------------------------------------------
# Catalog.
# ---------------------------------------------------------------------------

TWITTER_KOL_ACCOUNTS: list[KolAccount] = [
    {"username": "Bitwux", "display_name": "BITWU.ETH"},
    {"username": "cnfinancewatch", "display_name": "华尔街观察 Xtrader"},
    {"username": "viviennaBTC", "display_name": "vivienna.btc"},
    {"username": "wufantouzi", "display_name": "wu fan"},
    {"username": "lufeieth", "display_name": "lufei"},
    {"username": "qinbafrank", "display_name": "qinbafrank"},
    {"username": "LeePima", "display_name": "Pima"},
    {"username": "Rocky_Bitcoin", "display_name": "Rocky"},
    {"username": "tychozzz", "display_name": "Nico投资有道"},
    {"username": "AnnaEconomist", "display_name": "Anna Wong"},
    {"username": "TiezhuCrypto", "display_name": "铁柱 TiezhuCrypto"},
    {"username": "xiaomustock", "display_name": "川沐 | Trumoo"},
    {"username": "fi56622380", "display_name": "fin"},
    {"username": "Trader_S18", "display_name": "TraderS | 缺德道人"},
    {"username": "TJ_Research", "display_name": "投资TALK君"},
    {"username": "yuyy614893671", "display_name": "金融汪"},
    {"username": "artinmemes", "display_name": "美股OK哥"},
    {"username": "charliebilello", "display_name": "Charlie Bilello"},
    {"username": "LizAnnSonders", "display_name": "Liz Ann Sonders"},
    {"username": "TimmerFidelity", "display_name": "Jurrien Timmer"},
    {"username": "RyanDetrick", "display_name": "Ryan Detrick"},
    {"username": "LynAldenContact", "display_name": "Lyn Alden"},
    {"username": "biancoresearch", "display_name": "Jim Bianco"},
    {"username": "FedGuy12", "display_name": "Joseph Wang"},
    {"username": "SoberLook", "display_name": "The Daily Shot"},
    {"username": "TheTranscript_", "display_name": "The Transcript"},
    {"username": "SemiAnalysis_", "display_name": "SemiAnalysis"},
    {"username": "dylan522p", "display_name": "Dylan Patel"},
    {"username": "Beth_Kindig", "display_name": "Beth Kindig"},
    {"username": "ParadisLabs", "display_name": "Paradis Labs"},
    {"username": "damnang2", "display_name": "Damnang2"},
    {"username": "PhotonCap", "display_name": "Photon Capital"},
    {"username": "crux_capital_", "display_name": "Gaetano"},
    {"username": "KawzInvests", "display_name": "KawzInvests"},
    {"username": "Kaizen_Investor", "display_name": "KaizenInvestor"},
    {"username": "michaelsikand", "display_name": "Michael Sikand"},
    {"username": "Blinklebloop", "display_name": "Davy"},
    {"username": "illyquid", "display_name": "Illiquid"},
    {"username": "CoffeeStocksGuy", "display_name": "Coffee House Stocks"},
    {"username": "PhotonBull", "display_name": "PhotonBull"},
    {"username": "StockSavvyShay", "display_name": "Shay Boloor"},
    {"username": "Yeah_Dave", "display_name": "YeahDave"},
]


def enabled_kols() -> list[KolAccount]:
    """Return the full KOL catalog."""
    return list(TWITTER_KOL_ACCOUNTS)


def find_kol(username: str) -> KolAccount | None:
    """Lookup a KOL by username (case-insensitive)."""
    target = username.lower()
    for kol in TWITTER_KOL_ACCOUNTS:
        if kol["username"].lower() == target:
            return kol
    return None


def validate_catalog() -> list[str]:
    """
    Validate the catalog and return a list of error strings.
    Empty list means the catalog is well-formed.
    """
    errors: list[str] = []
    seen: set[str] = set()
    for idx, kol in enumerate(TWITTER_KOL_ACCOUNTS):
        username = kol.get("username", "").strip()
        if not username:
            errors.append(f"index {idx}: missing username")
            continue
        if username.lower() in seen:
            errors.append(f"index {idx}: duplicate username @{username}")
        seen.add(username.lower())
    return errors
