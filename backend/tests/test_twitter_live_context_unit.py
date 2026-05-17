from app.features.twitter.live_context import detect_live_context_symbols


def test_detect_live_context_symbols_for_optical_storage_topic():
    topic, symbols = detect_live_context_symbols(
        "当前怎么看光存储和光模块板块走势？"
    )

    assert topic == "ai_storage_optical"
    assert symbols[:4] == ["MU", "WDC", "STX", "COHR"]
    assert "SMH" in symbols


def test_detect_live_context_symbols_includes_explicit_ticker():
    topic, symbols = detect_live_context_symbols("按他的框架怎么看 NVDA 财报后风险？")

    assert topic == "general_market"
    assert symbols[0] == "NVDA"
