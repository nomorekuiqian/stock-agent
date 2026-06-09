"""Serenity v3 cockpit parser smoke tests.

These tests protect the distilled Serenity material shape used by
`cockpit_v3`: markdown can stay human-readable, but the parser must still
surface decision fields, falsifiers, veto rules, and evidence tweet ids.
"""

from __future__ import annotations

from app.features.kol_research import cockpit_v3


SERENITY = "aleabitoreddit"


def test_extract_tweet_ids_supports_backticks_and_serenity_id_format():
    text = """
    - Frank style evidence `2055822766600016238`
    - Serenity style evidence (id: 2052278391928500502, 2026-05-07)
    - Duplicate should be ignored (id: 2055822766600016238, 2026-05-17)
    """

    assert cockpit_v3._extract_tweet_ids(text) == [
        "2055822766600016238",
        "2052278391928500502",
    ]


def test_serenity_photonics_sector_parses_judgment_fields():
    sector = cockpit_v3.get_sector_v3(SERENITY, "photonics-and-cpo")

    assert sector is not None
    assert sector["core_questions"]
    assert any("CPO" in signal for signal in sector["signals"])
    assert any("H2 2026" in item for item in sector["bull_conditions"])
    assert any("量产" in item for item in sector["bear_triggers"])
    assert any("光模块" in item for item in sector["veto"])
    assert any("客户链" in item for item in sector["falsifiers"])
    assert "2055822766600016238" in sector["rep_tweet_ids"]
    assert "验证窗口" in sector["full_body"]
    assert "打脸条件" in sector["full_body"]


def test_serenity_sive_ticker_summary_parses_decision_framework():
    cockpit_v3._summary_cache.pop(SERENITY, None)

    summary = cockpit_v3.get_ticker_summary(SERENITY, "SIVE")

    assert summary is not None
    assert "CW DFB laser chokepoint" in summary["thesis"]
    assert "客户链" in summary["key_logic"]
    assert any("客户链" in signal for signal in summary["signals_watched"])
    assert any("design-in" in item for item in summary["bull_conditions"])
    assert any("short squeeze" in item for item in summary["bear_triggers"])
    assert any("历史 PT" in item for item in summary["veto"])
    assert any("design out" in item for item in summary["falsifiers"])
    assert any("普通激光器" in item for item in summary["misreadings"])


def test_serenity_nbis_summary_preserves_same_ring_ranking_logic():
    cockpit_v3._summary_cache.pop(SERENITY, None)

    summary = cockpit_v3.get_ticker_summary(SERENITY, "NBIS")

    assert summary is not None
    assert "Neocloud" in summary["thesis"]
    assert "Mag7" in summary["key_logic"]
    assert any("forward ARR" in signal for signal in summary["signals_watched"])
    assert any("NVDA" in item for item in summary["bull_conditions"])
    assert any("ATM" in item for item in summary["bear_triggers"])
    assert any("主题 ETF" in item for item in summary["veto"])
    assert any("同环" in item for item in summary["falsifiers"])


def test_serenity_high_conviction_groups_use_v3_material_shape():
    payload = cockpit_v3.list_high_conviction(SERENITY)

    groups = payload["groups"]
    assert len(groups) >= 5
    assert groups[0]["sector_key"] == "ai-infrastructure-mag7"

    photonics = next(g for g in groups if g["sector_key"] == "photonics-and-cpo")
    tickers = {t["ticker"]: t for t in photonics["tickers"]}
    assert tickers["SIVE"]["coverage"] == "high"
    assert tickers["SIVE"]["region"] == "SE"
    assert tickers["SIVE"]["priceable"] is True
    assert tickers["SIVE"]["mentions"] > 0
    assert tickers["SIVE"]["thesis"]
