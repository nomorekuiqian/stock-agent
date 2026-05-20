"""Tests for brew/macro_map.py — static macro event mapping and keyword matching."""

import pytest

from app.features.brew.macro_map import (
    MACRO_MAP,
    MacroRule,
    impact_for,
    match_macro_key,
    sectors_for,
)


class TestMacroMapData:
    """Validate the static MACRO_MAP entries."""

    def test_map_has_at_least_25_entries(self):
        assert len(MACRO_MAP) >= 25

    def test_all_entries_are_macro_rules(self):
        for key, rule in MACRO_MAP.items():
            assert isinstance(rule, MacroRule), f"{key} is not a MacroRule"

    def test_fomc_is_critical(self):
        assert MACRO_MAP["FOMC"].impact == "critical"

    def test_fomc_affects_all(self):
        assert "All" in MACRO_MAP["FOMC"].sectors

    def test_cpi_is_high(self):
        assert MACRO_MAP["CPI"].impact == "high"

    def test_crude_inventory_is_low(self):
        assert MACRO_MAP["crude_inventory"].impact == "low"

    def test_crude_inventory_sectors(self):
        assert MACRO_MAP["crude_inventory"].sectors == ["Energy"]


class TestSectorsFor:

    def test_known_key(self):
        sectors = sectors_for("FOMC")
        assert sectors == ["All"]

    def test_ppi_sectors(self):
        sectors = sectors_for("PPI")
        assert "Industrials" in sectors
        assert "Energy" in sectors

    def test_unknown_key_returns_empty(self):
        assert sectors_for("NONEXISTENT") == []


class TestImpactFor:

    def test_fomc_critical(self):
        assert impact_for("FOMC") == "critical"

    def test_cpi_high(self):
        assert impact_for("CPI") == "high"

    def test_ppi_mid(self):
        assert impact_for("PPI") == "mid"

    def test_crude_inventory_low(self):
        assert impact_for("crude_inventory") == "low"

    def test_unknown_key_returns_low(self):
        assert impact_for("NONEXISTENT") == "low"


class TestMatchMacroKey:

    @pytest.mark.parametrize("text,expected", [
        ("US CPI Data Release", "CPI"),
        ("Core CPI month-over-month", "CPI_core"),
        ("CPI Core Year-over-Year", "CPI_core"),
        ("FOMC Rate Decision", "FOMC"),
        ("Federal Reserve Meeting", "FOMC"),
        ("Fed Decision on Rates", "FOMC"),
        ("Nonfarm Payrolls", "NFP"),
        ("Non-Farm Payroll Report", "NFP"),
        ("US GDP Growth Rate", "GDP"),
        ("Producer Price Index PPI", "PPI"),
        ("PCE Price Index", "PCE"),
        ("Personal Consumption Expenditures", "PCE"),
        ("ECB Interest Rate Decision", "ECB"),
        ("European Central Bank Meeting", "ECB"),
        ("Bank of Japan Rate", "BoJ"),
        ("BoJ Monetary Policy", "BoJ"),
        ("Bank of England Decision", "BoE"),
        ("Initial Jobless Claims", "jobless_claims"),
        ("Consumer Confidence Index", "consumer_confidence"),
        ("CB Consumer Confidence", "consumer_confidence"),
        ("Housing Starts Report", "housing_starts"),
        ("US Retail Sales", "retail_sales"),
        ("Industrial Production", "industrial_production"),
        ("Michigan Consumer Sentiment", "Michigan_sentiment"),
        ("UMich Inflation Expectations", "Michigan_sentiment"),
        ("Durable Goods Orders", "durable_goods"),
        ("US Trade Balance", "trade_balance"),
        ("Trade Deficit Widens", "trade_balance"),
        ("New Home Sales", "new_home_sales"),
        ("Existing Home Sales", "existing_home_sales"),
        ("JOLTS Job Openings", "JOLTS"),
        ("Job Openings Report", "JOLTS"),
        ("Unemployment Rate", "unemployment_rate"),
        ("ADP Employment Change", "ADP_employment"),
        ("Fed Minutes Released", "fed_minutes"),
        ("FOMC Minutes", "fed_minutes"),
        ("China PMI Manufacturing", "China_PMI"),
        ("Caixin Services PMI", "China_PMI"),
        ("EIA Crude Oil Inventories", "crude_inventory"),
        ("ISM Manufacturing PMI", "ISM_PMI"),
        ("ISM Non-Manufacturing Index", "ISM_services"),
        ("ISM Services PMI", "ISM_services"),
    ])
    def test_pattern_matching(self, text, expected):
        assert match_macro_key(text) == expected

    def test_case_insensitive(self):
        assert match_macro_key("fomc rate decision") == "FOMC"
        assert match_macro_key("FOMC RATE DECISION") == "FOMC"

    def test_unknown_event_returns_none(self):
        assert match_macro_key("Company XYZ Product Launch") is None
        assert match_macro_key("Random news headline") is None
        assert match_macro_key("") is None

    def test_cpi_vs_core_cpi(self):
        """CPI should not match when text says 'Core CPI'."""
        assert match_macro_key("Core CPI Data") == "CPI_core"
        assert match_macro_key("CPI Data") == "CPI"
        assert match_macro_key("US CPI Release") == "CPI"
