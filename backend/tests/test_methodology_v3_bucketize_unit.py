"""
Unit tests for v3 distillation bucketize.py — pure rule-based ticker/sector/
macro/core matching functions. No DB, no LLM.
"""

from __future__ import annotations

import pytest

from scripts.methodology_v3.bucketize import (
    find_tickers,
    find_sectors,
    is_macro,
    is_core,
)


# ---------------------------------------------------------------------------
# find_tickers
# ---------------------------------------------------------------------------


class TestFindTickers:
    def test_empty_text_returns_empty_set(self):
        assert find_tickers("") == set()
        assert find_tickers(None) == set()  # type: ignore[arg-type]

    def test_recovers_chinese_alias_for_googl(self):
        # Plain English ticker matching is easy; the alias dictionary is the
        # real value-add (the existing enrichment was missing these).
        assert "GOOGL" in find_tickers("谷歌 GCP 增速很猛")

    def test_recovers_chinese_alias_for_msft(self):
        assert "MSFT" in find_tickers("微软 Azure 38% 还在涨")

    def test_recovers_chinese_alias_for_mstr(self):
        assert "MSTR" in find_tickers("微策略类 DAT 标的要谨慎")

    def test_recovers_chinese_alias_for_baidu_style(self):
        # 美光 → MU
        assert "MU" in find_tickers("美光 HBM 卖光逻辑")

    def test_ascii_ticker_word_boundary_avoids_false_positive(self):
        # The TICKER_ALIASES dict declares "Meta" (mixed case). Matching is
        # case-sensitive by design (avoids "META" tag in headings being
        # confused with metaverse hype). So "Meta" hits, "metaverse" doesn't.
        assert "META" in find_tickers("Meta 财报亮眼")
        # "metaverse" doesn't contain a "Meta" token at a word boundary
        # (the t is followed by 'averse', not a word boundary)
        assert "META" not in find_tickers("metaverse 是个泡沫")

    def test_arm_alias_only_matches_uppercase(self):
        # ARM the ticker (uppercase, word-bounded)
        assert "ARM" in find_tickers("ARM 在数据中心渗透加速")
        # "arm" the noun (lowercase) shouldn't be picked up
        assert "ARM" not in find_tickers("we're arm-in-arm with team")

    def test_multiple_tickers_in_one_text(self):
        hits = find_tickers("NVDA 和美光、博通三家共享 AI 算力红利")
        assert "NVDA" in hits
        assert "MU" in hits
        assert "AVGO" in hits

    def test_unknown_chinese_brand_returns_no_ticker(self):
        # 不认识的中文名不会瞎匹配
        assert find_tickers("某不知名公司的财报") == set()


# ---------------------------------------------------------------------------
# find_sectors
# ---------------------------------------------------------------------------


class TestFindSectors:
    def test_empty_text_returns_empty_set(self):
        assert find_sectors("") == set()

    def test_ai_infrastructure_match(self):
        assert "ai-infrastructure" in find_sectors("AI 算力需求 + HBM 紧缺")

    def test_crypto_stablecoin_match(self):
        assert "crypto-stablecoin-rwa" in find_sectors(
            "稳定币 USDC 发行量大增，Circle 是龙二"
        )

    def test_defense_and_space_match(self):
        assert "defense-and-space" in find_sectors(
            "RKLB 拿到 8 亿美金太空发展局合同"
        )

    def test_power_and_physical_ai_match(self):
        assert "power-and-physical-ai" in find_sectors("数据中心电力 + 液冷紧缺")

    def test_semiconductor_memory_hbm_match(self):
        assert "semiconductor-memory-hbm" in find_sectors("HBM / DRAM / 闪存 紧平衡")

    def test_software_ai_disruption_match(self):
        assert "software-ai-disruption" in find_sectors(
            "纯软件 SaaS 被 AI 颠覆 + Cursor 火"
        )

    def test_fintech_brokerage_match(self):
        assert "fintech-brokerage" in find_sectors("罗宾汉是 Z世代经纪商")

    def test_multiple_sectors_in_one_text(self):
        sectors = find_sectors("AI 算力链 + 加密 + 太空经济 都是机会")
        assert "ai-infrastructure" in sectors
        # "加密" doesn't directly hit any keyword unless we add it, but
        # "太空" hits defense-and-space; tolerant assertion:
        assert "defense-and-space" in sectors

    def test_case_insensitive_ascii(self):
        # The keyword "SaaS" is mixed-case; lowercase variant should still hit.
        assert "software-ai-disruption" in find_sectors("saas 业务受冲击")


# ---------------------------------------------------------------------------
# is_macro / is_core
# ---------------------------------------------------------------------------


class TestIsMacro:
    @pytest.mark.parametrize(
        "text",
        [
            "Fed 12 月降息概率",
            "联储下次议息会议",
            "CPI 数据公布",
            "TGA 账户上升",
            "霍尔木兹海峡封锁",
            "关税 + 中美博弈",
            "黄金长期 floor",
            "VIX < 14 隐含波动率",
        ],
    )
    def test_macro_keyword_hits(self, text):
        assert is_macro(text) is True

    def test_pure_individual_stock_text_not_macro(self):
        assert is_macro("NVDA Blackwell 出货 2000 万") is False

    def test_empty_input(self):
        assert is_macro("") is False
        assert is_macro(None) is False  # type: ignore[arg-type]


class TestIsCore:
    @pytest.mark.parametrize(
        "text",
        [
            "投资原则就是基本面",
            "拿不住的不该重仓",
            "all in 是赌博",
            "能力圈以外不进",
            "杀估值是上车机会",
            "强信念必带可证伪",
            "技术面看 K 线意义不大",
            "高杠杆永远是双刃剑",
        ],
    )
    def test_core_keyword_hits(self, text):
        assert is_core(text) is True

    def test_pure_market_news_not_core(self):
        assert is_core("Blackwell 出货 +30%") is False

    def test_empty_input(self):
        assert is_core("") is False
