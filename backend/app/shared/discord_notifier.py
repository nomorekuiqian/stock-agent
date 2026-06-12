"""
Discord webhook notifier — posts report broadcasts as Discord embeds (card mode).

Used by the daily (收盘日报) and morning (盘前早报) broadcast endpoints to mirror
the email broadcast into a Discord channel. The full report is published; when it
exceeds Discord's per-embed size limits it is paged across multiple messages.

Failures are logged and swallowed so a Discord outage never breaks the email path.
"""

import json
from typing import Optional

import httpx

from app.core.logging import get_logger

try:
    from app.shared.discord_config import REPORT_CHANNEL, get_webhook_url
except ImportError:
    # discord_config.py holds live webhook URLs and is gitignored. When absent
    # (e.g. fresh checkout without the secret file), degrade to a no-op so the
    # email broadcast path is never affected.
    REPORT_CHANNEL = "市场日报"

    def get_webhook_url(channel: str):  # type: ignore[misc]
        return None

try:
    from app.core.config import FRONTEND_URL
except ImportError:  # pragma: no cover - config always present in app runtime
    FRONTEND_URL = ""

logger = get_logger(__name__)

# Brand color #059669 (翠绿色) as a Discord integer color.
_BRAND_COLOR = 0x059669

# Discord embed limits.
_MAX_TITLE = 256
_MAX_FIELD_NAME = 256
_MAX_FIELD_VALUE = 1024
_MAX_FIELDS_PER_EMBED = 25
# Discord's documented per-embed total is 6000 *characters*, but the webhook
# endpoint rejects payloads (HTTP 500) once an embed exceeds ~10000 UTF-8
# *bytes* — which CJK text hits far sooner. Budget by bytes with headroom.
_EMBED_BYTE_BUDGET = 9000

_CONT_NAME = "（续）"


def _frontend_base() -> str:
    return (FRONTEND_URL or "https://themarketbrew.com").rstrip("/")


def _truncate(text: str, limit: int) -> str:
    if not text:
        return ""
    text = str(text).strip()
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def _chunk(text: str, limit: int = _MAX_FIELD_VALUE) -> list[str]:
    """Split text into <= limit pieces, preferring paragraph/line boundaries."""
    text = (text or "").strip()
    if not text:
        return []
    if len(text) <= limit:
        return [text]

    chunks: list[str] = []
    cur = ""
    # Split on blank lines first, then single newlines as a finer boundary.
    for para in text.replace("\r\n", "\n").split("\n\n"):
        para = para.strip()
        if not para:
            continue
        candidate = f"{cur}\n\n{para}" if cur else para
        if len(candidate) <= limit:
            cur = candidate
            continue
        if cur:
            chunks.append(cur)
            cur = ""
        if len(para) <= limit:
            cur = para
            continue
        # Single paragraph still too long: hard-split.
        while len(para) > limit:
            chunks.append(para[:limit])
            para = para[limit:]
        cur = para
    if cur:
        chunks.append(cur)
    return chunks


def _fmt_change(value, unit: Optional[str] = None) -> str:
    try:
        num = float(value)
    except (TypeError, ValueError):
        return str(value)
    suffix = "bps" if unit == "bps" else "%"
    return f"{num:+.2f}{suffix}"


def _section_to_fields(name: str, text: str) -> list[dict]:
    """Turn one logical section into one or more Discord embed fields."""
    pieces = _chunk(text)
    fields: list[dict] = []
    for i, piece in enumerate(pieces):
        fields.append(
            {
                "name": _truncate(name if i == 0 else _CONT_NAME, _MAX_FIELD_NAME),
                "value": piece,
                "inline": False,
            }
        )
    return fields


# ---------------------------------------------------------------------------
# Report -> sections
# ---------------------------------------------------------------------------


def _coerce_list(value) -> list:
    """report_summary / similar fields may be stored as a JSON string."""
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, list) else []
        except (ValueError, TypeError):
            return []
    return []


def _daily_sections(data: dict) -> list[tuple[str, str]]:
    sections: list[tuple[str, str]] = []

    if data.get("intro"):
        sections.append(("导读", data["intro"]))

    indices = data.get("indices") or []
    if indices:
        lines = [
            f"{idx.get('name', '')} {_fmt_change(idx.get('change_percent', 0), idx.get('change_unit'))}"
            for idx in indices
        ]
        sections.append(("主要指数", "\n".join(lines)))

    news = data.get("news") or {}
    if isinstance(news, dict):
        for h in news.get("headlines") or []:
            if not isinstance(h, dict):
                continue
            body = "\n\n".join(
                p for p in [h.get("fact_summary", ""), h.get("deep_analysis", "")] if p
            )
            sections.append((f"头条 · {h.get('title', '')}", body))

        briefs = news.get("briefs") or []
        if briefs:
            lines = []
            for b in briefs:
                if not isinstance(b, dict):
                    continue
                detail = " ".join(p for p in [b.get("summary", ""), b.get("analysis", "")] if p)
                lines.append(f"▸ {b.get('title', '')}\n{detail}")
            if lines:
                sections.append(("其他要闻", "\n\n".join(lines)))

    for s in _coerce_list(data.get("report_summary")):
        if isinstance(s, dict) and s.get("content"):
            sections.append((s.get("title") or "总结", s["content"]))

    calendar = data.get("calendar") or []
    if calendar:
        lines = []
        for ev in calendar:
            if not isinstance(ev, dict):
                continue
            lines.append(
                f"{ev.get('date', '')} {ev.get('event', '')}\n{ev.get('analysis', '')}"
            )
        if lines:
            sections.append(("重要日历", "\n\n".join(lines)))

    return sections


def _morning_sections(data: dict) -> list[tuple[str, str]]:
    sections: list[tuple[str, str]] = []

    futures = data.get("futures") or []
    if futures:
        lines = [
            f"{f.get('name', '')} {_fmt_change(f.get('daily_change', 0))}"
            for f in futures
            if isinstance(f, dict)
        ]
        body = "\n".join(lines)
        if data.get("futures_analysis"):
            body = f"{body}\n\n{data['futures_analysis']}"
        sections.append(("美股期货", body))

    gm = data.get("global_markets") or {}
    if isinstance(gm, dict):
        region_labels = [("asia", "亚洲"), ("europe", "欧洲"), ("other", "其他")]
        lines = []
        for key, label in region_labels:
            quotes = gm.get(key) or []
            for q in quotes:
                if isinstance(q, dict):
                    lines.append(
                        f"[{label}] {q.get('name', '')} {_fmt_change(q.get('daily_change', 0))}"
                    )
        body = "\n".join(lines)
        if data.get("global_markets_analysis"):
            body = (f"{body}\n\n" if body else "") + data["global_markets_analysis"]
        if body:
            sections.append(("全球市场", body))

    for item in data.get("overnight_news") or []:
        if isinstance(item, dict) and item.get("title"):
            sections.append((f"隔夜要闻 · {item['title']}", item.get("analysis", "")))

    for item in data.get("today_focus") or []:
        if not isinstance(item, dict):
            continue
        t = item.get("time", "")
        name = f"今日关注 · {('[' + t + '] ') if t else ''}{item.get('title', '')}"
        sections.append((name, item.get("analysis", "")))

    for s in _coerce_list(data.get("summary")):
        if isinstance(s, dict) and s.get("content"):
            sections.append((s.get("title") or "总结", s["content"]))

    return sections


def _twitter_sections(data: dict) -> list[tuple[str, str]]:
    sections: list[tuple[str, str]] = []

    def _hot_line(items, prefix, fmt, limit):
        rows = [fmt(i) for i in (items or [])[:limit] if isinstance(i, dict)]
        return f"{prefix}: " + "  ".join(rows) if rows else ""

    hot_parts = [
        _hot_line(
            data.get("hot_tickers"), "热门标的",
            lambda i: f"${i.get('label', '')}({i.get('count', 0)})", 10,
        ),
        _hot_line(
            data.get("hot_sectors"), "热门板块",
            lambda i: f"{i.get('label', '')}({i.get('count', 0)})", 8,
        ),
        _hot_line(
            data.get("hot_events"), "热门事件",
            lambda i: f"{i.get('label', '')}({i.get('count', 0)})", 8,
        ),
    ]
    hot_parts = [p for p in hot_parts if p]
    if hot_parts:
        sections.append(("热点榜", "\n".join(hot_parts)))

    for t in data.get("ticker_theses") or []:
        if not isinstance(t, dict):
            continue
        name = f"${t.get('ticker', '')}"
        if t.get("stance_summary"):
            name = f"{name} · {t['stance_summary']}"
        sections.append((name, t.get("synthesis_zh", "")))

    for m in data.get("macro_threads") or []:
        if isinstance(m, dict) and m.get("synthesis_zh"):
            sections.append((f"宏观 · {m.get('title', '')}", m["synthesis_zh"]))

    watchpoints = data.get("watchpoints") or []
    if watchpoints:
        lines = []
        for w in watchpoints:
            if not isinstance(w, dict):
                continue
            dh = w.get("date_hint", "")
            lines.append(
                f"{('[' + dh + '] ') if dh else ''}{w.get('title', '')}\n{w.get('why_it_matters_zh', '')}"
            )
        if lines:
            sections.append(("关注点", "\n\n".join(lines)))

    return sections


# ---------------------------------------------------------------------------
# Sections -> paged embeds
# ---------------------------------------------------------------------------


def _build_embeds(
    *,
    title: str,
    description: str,
    sections: list[tuple[str, str]],
    author: str,
    url: str,
    footer_label: str,
) -> list[dict]:
    """Pack sections into one or more embeds respecting Discord size limits."""
    # Flatten sections into fields (with chunking).
    fields: list[dict] = []
    for name, text in sections:
        fields.extend(_section_to_fields(name, text))

    desc = _truncate(description, 4096)

    def _bytes(s: str) -> int:
        return len(s.encode("utf-8"))

    # Title / author / footer also count toward the embed budget; reserve for them.
    overhead = _bytes(title) + _bytes(desc) + 200

    # Pack fields into pages, budgeting by UTF-8 bytes.
    pages: list[list[dict]] = []
    cur: list[dict] = []
    cur_bytes = overhead
    for f in fields:
        flen = _bytes(f["name"]) + _bytes(f["value"])
        over_count = len(cur) >= _MAX_FIELDS_PER_EMBED
        over_bytes = cur and (cur_bytes + flen > _EMBED_BYTE_BUDGET)
        if over_count or over_bytes:
            pages.append(cur)
            cur = []
            cur_bytes = overhead
        cur.append(f)
        cur_bytes += flen
    if cur or not pages:
        pages.append(cur)

    total = len(pages)
    embeds: list[dict] = []
    for i, page_fields in enumerate(pages):
        author_name = author if total == 1 else f"{author} · {i + 1}/{total}"
        embed: dict = {
            "color": _BRAND_COLOR,
            "author": {"name": author_name},
            "fields": page_fields,
            "footer": {"text": f"TheMarketBrew · {footer_label}"},
        }
        if i == 0:
            embed["title"] = _truncate(title, _MAX_TITLE)
            embed["url"] = url
            if desc:
                embed["description"] = desc
        embeds.append(embed)
    return embeds


async def _post_embeds(embeds: list[dict], channel: str = REPORT_CHANNEL) -> bool:
    """POST embeds to the configured Discord webhook, one message each. Never raises."""
    webhook_url = get_webhook_url(channel)
    if not webhook_url:
        logger.info("Discord channel %s not configured, skipping report card", channel)
        return False

    ok = True
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            for idx, embed in enumerate(embeds):
                resp = await client.post(webhook_url, json={"embeds": [embed]})
                if resp.status_code not in (200, 204):
                    ok = False
                    logger.warning(
                        "Discord webhook page %d/%d returned %s: %s",
                        idx + 1,
                        len(embeds),
                        resp.status_code,
                        resp.text[:300],
                    )
        logger.info(
            "Discord report card posted to channel %s (%d page(s), ok=%s)",
            channel,
            len(embeds),
            ok,
        )
        return ok
    except Exception as e:
        logger.warning("Failed to post Discord report card: %s", e)
        return False


async def send_daily_report_card(data: dict) -> bool:
    """Mirror the daily 收盘日报 broadcast to Discord as embed card(s)."""
    report_date = data.get("report_date") or ""
    embeds = _build_embeds(
        title=data.get("title") or f"市场日报 {report_date}",
        description=data.get("summary") or "",
        sections=_daily_sections(data),
        author="晚报",
        url=f"{_frontend_base()}/today",
        footer_label="收盘日报",
    )
    return await _post_embeds(embeds)


async def send_morning_report_card(data: dict) -> bool:
    """Mirror the morning 盘前早报 broadcast to Discord as embed card(s)."""
    report_date = data.get("report_date") or ""
    embeds = _build_embeds(
        title=data.get("title") or f"盘前早报 {report_date}",
        description=data.get("market_pulse") or "",
        sections=_morning_sections(data),
        author="盘前早报",
        url=f"{_frontend_base()}/morning",
        footer_label="盘前早报",
    )
    return await _post_embeds(embeds)


async def send_twitter_digest_card(data: dict) -> bool:
    """Mirror the 推特 KOL 日报 broadcast to Discord as embed card(s)."""
    digest_date = data.get("date") or ""
    embeds = _build_embeds(
        title=data.get("headline") or f"推特 KOL 日报 {digest_date}",
        description=data.get("intro") or "",
        sections=_twitter_sections(data),
        author="推特 KOL 日报",
        url=f"{_frontend_base()}/twitter-digest",
        footer_label="推特 KOL 日报",
    )
    return await _post_embeds(embeds)
