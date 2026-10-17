"""Token-only estimates; excludes grounding, cache storage, taxes and discounts."""

from datetime import date


def estimate_usd(
    model: str | None,
    prompt_tokens: int,
    output_tokens: int,
    *,
    thoughts_tokens: int = 0,
    cached_tokens: int = 0,
    usage_day: str | None = None,
) -> float:
    """Current routed models use standard rates; others retain rough estimates.

    Source: https://ai.google.dev/gemini-api/docs/pricing (2026-09-17).
    Gemini's prompt count includes cached input; candidates exclude thinking.
    """
    m = (model or "").lower()
    if m == "gemini-3.5-flash-lite":
        cached = min(max(cached_tokens or 0, 0), max(prompt_tokens or 0, 0))
        return (
            (max(prompt_tokens or 0, 0) - cached) * 0.30
            + cached * 0.03
            + (max(output_tokens or 0, 0) + max(thoughts_tokens or 0, 0)) * 2.50
        ) / 1_000_000
    if m == "gemini-3.8-flash":
        day = date.fromisoformat(usage_day[:10]) if usage_day else date.today()
        factor = 2 if day >= date(2027, 1, 1) else 1
        cached = min(max(cached_tokens or 0, 0), max(prompt_tokens or 0, 0))
        return factor * (
            (max(prompt_tokens or 0, 0) - cached) * 0.75
            + cached * 0.075
            + (max(output_tokens or 0, 0) + max(thoughts_tokens or 0, 0)) * 3.75
        ) / 1_000_000
    if "flash-lite" in m:
        in_rate, out_rate = 0.10, 0.40
    elif "flash" in m:
        in_rate, out_rate = 0.30, 2.50
    else:
        in_rate, out_rate = 1.25, 5.00
    return (prompt_tokens or 0) / 1_000_000 * in_rate + (output_tokens or 0) / 1_000_000 * out_rate
