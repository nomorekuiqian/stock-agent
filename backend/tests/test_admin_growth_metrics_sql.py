from pathlib import Path


def test_admin_growth_metrics_exposes_chat_reliability_metrics():
    migration = (
        Path(__file__).resolve().parents[2]
        / "migrations"
        / "20260623090000_admin-chat-reliability-metrics.sql"
    )
    source = migration.read_text(encoding="utf-8")

    for key in (
        "useful_answer_rate",
        "thumbs_down_rate",
        "error_rate",
        "timeout_rate",
        "p50_latency_ms",
        "p75_latency_ms",
        "p95_latency_ms",
        "p99_latency_ms",
    ):
        assert key in source

    assert "feedback_sentiment = 1" in source
    assert "feedback_sentiment = -1" in source
    assert "error_code = 'agent_timeout'" in source
    assert "payload->>'latency_ms'" in source
    assert "Users with a first assistant answer or legacy first_insight_generated event" in source
    assert "percentile_cont(0.50)" in source
    assert "percentile_cont(0.75)" in source
    assert "percentile_cont(0.95)" in source
    assert "percentile_cont(0.99)" in source


def test_admin_growth_metrics_supports_date_range_filter():
    migration = (
        Path(__file__).resolve().parents[2]
        / "migrations"
        / "20260623093000_admin-growth-metrics-date-range.sql"
    )
    source = migration.read_text(encoding="utf-8")

    assert "CREATE OR REPLACE FUNCTION public.admin_growth_metrics_range" in source
    assert "start_date date" in source
    assert "end_date date" in source
    assert "current_start - days AS start_date" in source
    assert "current_start - 1 AS end_date" in source
    assert "SELECT public.admin_growth_metrics_range(" in source
    assert "GRANT EXECUTE ON FUNCTION public.admin_growth_metrics_range(date, date)" in source
    for key in ("p50_latency_ms", "p75_latency_ms", "p95_latency_ms", "p99_latency_ms"):
        assert key in source
