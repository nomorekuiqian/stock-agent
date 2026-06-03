"""Deterministic input parsing and data-coverage checks for KOL chat.

This module handles the parts that should not be left entirely to the LLM:
- resolve explicit tickers / company aliases from the user message and page context
- identify simple news / macro intents
- prefetch obvious structured data into the prompt
- downgrade the final answer when required data was not covered
"""

from __future__ import annotations

import asyncio
import json
import re
import time
from dataclasses import dataclass, field
from typing import Any, Iterable

from app.core.logging import get_logger
from app.features.kol_research.cockpit import NON_PRICEABLE, TICKER_ALIASES
from app.shared.data_tools.briefs import get_macro_brief, get_stock_brief

logger = get_logger(__name__)

_PREFETCH_TTL_SECONDS = 300.0
_PREFETCH_CACHE: dict[str, tuple[float, Any, bool]] = {}
_PROMPT_SECTION_MAX_CHARS = 3500
_BRIEF_SLIM_FIELD_LIMIT = 6


def _cache_get(key: str) -> tuple[Any, bool] | None:
    entry = _PREFETCH_CACHE.get(key)
    if entry is None:
        return None
    ts, payload, ok = entry
    if (time.monotonic() - ts) > _PREFETCH_TTL_SECONDS:
        _PREFETCH_CACHE.pop(key, None)
        return None
    return payload, ok


def _cache_set(key: str, payload: Any, ok: bool) -> None:
    _PREFETCH_CACHE[key] = (time.monotonic(), payload, ok)


def _slim_brief_payload(payload: Any) -> Any:
    """Drop verbose fields (news bodies, long timeseries) from a brief result.

    Keeps the structured top-level scalars / shallow objects that the LLM
    actually needs to anchor its answer.
    """
    if not isinstance(payload, dict):
        return payload
    slim: dict[str, Any] = {}
    for key, value in payload.items():
        if isinstance(value, str):
            slim[key] = value[:400]
        elif isinstance(value, list):
            kept = []
            for item in value[:_BRIEF_SLIM_FIELD_LIMIT]:
                if isinstance(item, dict):
                    kept.append({
                        k: (v[:200] if isinstance(v, str) else v)
                        for k, v in item.items()
                        if not isinstance(v, (list, dict))
                    })
                elif isinstance(item, str):
                    kept.append(item[:200])
                else:
                    kept.append(item)
            slim[key] = kept
        elif isinstance(value, dict):
            slim[key] = {
                k: (v[:200] if isinstance(v, str) else v)
                for k, v in value.items()
                if not isinstance(v, (list, dict))
            }
        else:
            slim[key] = value
    return slim

_URL_RE = re.compile(r"https?://[^\s<>)\"']+", re.IGNORECASE)
_TICKER_RE = re.compile(r"(?<![A-Za-z0-9])(\$?)([A-Z]{1,5})(?![A-Za-z0-9])")

_NEWS_KEYWORDS = (
    "新闻",
    "消息",
    "利好",
    "利空",
    "怎么看这个",
    "影响大吗",
    "发生什么",
    "突发",
    "报道",
    "headline",
    "news",
)

_MACRO_KEYWORDS = (
    "宏观",
    "市场环境",
    "大盘",
    "美股",
    "纳指",
    "标普",
    "fed",
    "fomc",
    "美联储",
    "降息",
    "加息",
    "利率",
    "cpi",
    "pce",
    "通胀",
    "非农",
    "tga",
    "rrp",
    "sofr",
    "准备金",
    "流动性",
    "地缘",
    "关税",
    "vix",
)

# Common short words / ambiguous short tickers. Require cashtag or a longer
# alias (e.g. "OnSemi") to avoid reading "ON RRP" as ON Semiconductor.
_SHORT_TICKERS_REQUIRE_CASHTAG = {"ON", "LI", "PL", "GD", "BA"}


@dataclass(frozen=True)
class ParsedInput:
    symbols: list[str] = field(default_factory=list)
    priceable_symbols: list[str] = field(default_factory=list)
    urls: list[str] = field(default_factory=list)
    is_stock_question: bool = False
    is_macro_question: bool = False
    is_news_question: bool = False
    source: dict[str, str] = field(default_factory=dict)

    @property
    def requires_macro_brief(self) -> bool:
        return self.is_macro_question

    @property
    def requires_stock_brief_symbols(self) -> list[str]:
        return self.priceable_symbols[:2]

    def required_tool_keys(self) -> set[str]:
        keys = {f"get_stock_brief:{symbol}" for symbol in self.requires_stock_brief_symbols}
        if self.requires_macro_brief:
            keys.add("get_macro_brief")
        return keys

    def to_prompt_dict(self) -> dict[str, Any]:
        return {
            "symbols": self.symbols,
            "priceable_symbols": self.priceable_symbols,
            "urls": self.urls,
            "is_stock_question": self.is_stock_question,
            "is_macro_question": self.is_macro_question,
            "is_news_question": self.is_news_question,
            "source": self.source,
            "required_tool_keys": sorted(self.required_tool_keys()),
        }


@dataclass(frozen=True)
class InputGuardContext:
    parsed: ParsedInput
    prompt_section: str = ""
    fulfilled_tool_keys: set[str] = field(default_factory=set)


def _append_unique(items: list[str], value: str) -> None:
    value = value.upper().strip()
    if value and value not in items:
        items.append(value)


def _contains_keyword(text_lower: str, keywords: Iterable[str]) -> bool:
    return any(keyword.lower() in text_lower for keyword in keywords)


def _match_aliases(message: str) -> tuple[list[str], dict[str, str]]:
    symbols: list[str] = []
    source: dict[str, str] = {}

    # Explicit uppercase ticker / cashtag path.
    for match in _TICKER_RE.finditer(message):
        has_cashtag = bool(match.group(1))
        token = match.group(2).upper()
        if token not in TICKER_ALIASES:
            continue
        if token in _SHORT_TICKERS_REQUIRE_CASHTAG and not has_cashtag:
            continue
        _append_unique(symbols, token)
        source.setdefault(token, "ticker")

    # Alias path, including Chinese company names and long English names.
    for ticker, aliases in TICKER_ALIASES.items():
        for alias in aliases:
            alias = str(alias).strip()
            if not alias or alias.upper() == ticker:
                continue
            if _alias_in_message(alias, message):
                _append_unique(symbols, ticker)
                source.setdefault(ticker, f"alias:{alias}")
                break

    return symbols, source


def _alias_in_message(alias: str, message: str) -> bool:
    if any("一" <= ch <= "鿿" for ch in alias):
        return alias in message
    if len(alias) < 2:
        return False
    return re.search(rf"(?<![A-Za-z0-9]){re.escape(alias)}(?![A-Za-z0-9])", message, re.IGNORECASE) is not None


def parse_input(message: str, content_context: dict[str, Any] | None = None) -> ParsedInput:
    """Parse obvious entities from the user turn without calling an LLM."""
    message = message or ""
    text_lower = message.lower()
    symbols, source = _match_aliases(message)

    if content_context and content_context.get("type") == "stock":
        ctx_symbol = str(content_context.get("symbol") or "").upper().strip()
        if ctx_symbol:
            _append_unique(symbols, ctx_symbol)
            source.setdefault(ctx_symbol, "content_context")

    urls = _URL_RE.findall(message)
    is_news_question = bool(urls) or _contains_keyword(text_lower, _NEWS_KEYWORDS)
    is_macro_question = _contains_keyword(text_lower, _MACRO_KEYWORDS)
    is_stock_question = bool(symbols)

    priceable_symbols = [s for s in symbols if s not in NON_PRICEABLE]
    return ParsedInput(
        symbols=symbols,
        priceable_symbols=priceable_symbols,
        urls=urls,
        is_stock_question=is_stock_question,
        is_macro_question=is_macro_question,
        is_news_question=is_news_question,
        source=source,
    )


def _symbols_in_history(history: Iterable[dict[str, Any]] | None) -> set[str]:
    """Cheap pass over prior turns to detect tickers already discussed."""
    if not history:
        return set()
    seen: set[str] = set()
    for turn in history:
        content = str(turn.get("content") or "")
        for match in _TICKER_RE.finditer(content):
            token = match.group(2).upper()
            if token in TICKER_ALIASES:
                seen.add(token)
        upper_content = content.upper()
        for ticker, aliases in TICKER_ALIASES.items():
            if ticker in seen:
                continue
            for alias in aliases:
                alias = str(alias).strip()
                if not alias:
                    continue
                if any("一" <= ch <= "鿿" for ch in alias):
                    if alias in content:
                        seen.add(ticker)
                        break
                elif len(alias) >= 2 and alias.upper() in upper_content:
                    seen.add(ticker)
                    break
    return seen


async def build_input_guard_context(
    *,
    message: str,
    content_context: dict[str, Any] | None = None,
    history: list[dict[str, Any]] | None = None,
) -> InputGuardContext:
    """Build a prompt section with deterministic parsing + pre-fetched data.

    Multi-turn behavior:
      - If the parsed symbol was already discussed in `history`, we skip
        injecting the full prefetched_data body into the prompt. The parsed
        hint still goes in so the agent knows the intent, and the cache below
        still warms up; the agent will call the tool itself if it really needs
        the data, but it won't get a redundant verbatim dump every turn.
      - Prefetch results are TTL-cached for 5 minutes; identical args hit cache.
    """
    parsed = parse_input(message, content_context)
    if not parsed.symbols and not parsed.is_macro_question and not parsed.is_news_question:
        return InputGuardContext(parsed=parsed)

    previous_symbols = _symbols_in_history(history)
    overlap = previous_symbols & set(parsed.symbols)
    inject_data_body = not (overlap and len(history or []) >= 2)

    prefetch_payload: dict[str, Any] = {"stocks": {}, "macro": None}
    fulfilled: set[str] = set()

    tasks = [_prefetch_stock(symbol) for symbol in parsed.requires_stock_brief_symbols]
    if parsed.requires_macro_brief:
        tasks.append(_prefetch_macro())

    if tasks:
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for result in results:
            if isinstance(result, BaseException):
                logger.warning("input guard prefetch failed: %s", result)
                continue
            key, payload, ok = result
            if key == _MACRO_PREFETCH_KEY:
                prefetch_payload["macro"] = payload
                if ok:
                    fulfilled.add("get_macro_brief")
            else:
                prefetch_payload["stocks"][key] = payload
                if ok:
                    fulfilled.add(f"get_stock_brief:{key}")

    prompt_section = _render_prompt_section(
        parsed,
        prefetch_payload,
        inject_data_body=inject_data_body,
    )
    return InputGuardContext(
        parsed=parsed,
        prompt_section=prompt_section,
        fulfilled_tool_keys=fulfilled,
    )


_MACRO_PREFETCH_KEY = "__macro__"


async def _prefetch_stock(symbol: str) -> tuple[str, Any, bool]:
    cache_key = f"stock:{symbol}"
    cached = _cache_get(cache_key)
    if cached is not None:
        payload, ok = cached
        return symbol, payload, ok
    raw = await get_stock_brief(symbol)
    parsed_raw = _parse_json_or_text(raw)
    ok = not (isinstance(parsed_raw, dict) and parsed_raw.get("error"))
    _cache_set(cache_key, parsed_raw, ok)
    return symbol, parsed_raw, ok


async def _prefetch_macro() -> tuple[str, Any, bool]:
    cache_key = "macro"
    cached = _cache_get(cache_key)
    if cached is not None:
        payload, ok = cached
        return _MACRO_PREFETCH_KEY, payload, ok
    raw = await get_macro_brief()
    parsed_raw = _parse_json_or_text(raw)
    ok = not (isinstance(parsed_raw, dict) and parsed_raw.get("error"))
    _cache_set(cache_key, parsed_raw, ok)
    return _MACRO_PREFETCH_KEY, parsed_raw, ok


def _parse_json_or_text(raw: str) -> Any:
    try:
        return json.loads(raw)
    except (TypeError, json.JSONDecodeError):
        return {"text": str(raw)}


def _render_prompt_section(
    parsed: ParsedInput,
    prefetch_payload: dict[str, Any],
    *,
    inject_data_body: bool = True,
) -> str:
    if inject_data_body:
        slim_stocks = {
            sym: _slim_brief_payload(data)
            for sym, data in (prefetch_payload.get("stocks") or {}).items()
        }
        slim_macro = _slim_brief_payload(prefetch_payload.get("macro"))
        payload = {
            "parsed_input": parsed.to_prompt_dict(),
            "prefetched_data": {"stocks": slim_stocks, "macro": slim_macro},
        }
    else:
        payload = {"parsed_input": parsed.to_prompt_dict()}

    compact = json.dumps(payload, ensure_ascii=False, default=str)
    if len(compact) > _PROMPT_SECTION_MAX_CHARS:
        compact = compact[:_PROMPT_SECTION_MAX_CHARS].rstrip() + "...(truncated)"

    instructions = [
        "## Deterministic Input Guard",
        "",
        "Backend parsed the user's message before the LLM turn. Treat this as the source of truth for explicit symbols / URLs.",
        "",
        "Rules:",
        "- If `symbols` is non-empty, answer about those exact symbols; do not substitute a different ticker.",
    ]
    if inject_data_body:
        instructions.append(
            "- If `prefetched_data` contains a stock or macro payload, use it as current structured data. You may call tools for missing details, but do not ignore this data."
        )
    else:
        instructions.append(
            "- prefetched_data was already discussed in earlier turns; if you need fresh structured data, call the relevant `get_stock_brief` / `get_macro_brief` tool yourself instead of relying on a redundant inline dump."
        )
    instructions.extend([
        "- If the user asks about a URL/news but no article body is available, use `google_search` once for the URL/current event or say the news content is insufficient.",
        "- If required data is missing or errored, downgrade the answer to a framework-only view and say what data is missing.",
        "",
        "```json",
        compact,
        "```",
    ])
    return "\n".join(instructions)


def validate_data_coverage(
    parsed: ParsedInput,
    *,
    fulfilled_tool_keys: set[str],
    tool_calls: Iterable[Any],
) -> list[str]:
    """Return missing required data coverage items for this turn."""
    missing: list[str] = []
    for key in sorted(parsed.required_tool_keys()):
        if key in fulfilled_tool_keys:
            continue
        if _tool_calls_cover_key(tool_calls, key):
            continue
        missing.append(key)
    return missing


def append_data_coverage_warning(text: str, missing: list[str]) -> str:
    if not missing:
        return text
    readable = "、".join(_humanize_missing_key(item) for item in missing)
    warning = (
        "\n\n> 数据覆盖提示：这轮没有成功覆盖%s，所以上面的结论只能当作方法论判断，不能当作完整的当下判断。"
        % readable
    )
    return (text or "").rstrip() + warning


def _humanize_missing_key(key: str) -> str:
    if key == "get_macro_brief":
        return "宏观风险 / 流动性数据"
    if key.startswith("get_stock_brief:"):
        symbol = key.split(":", 1)[1]
        return f"`{symbol}` 的当下行情 / 基本面数据"
    return key


def _tool_calls_cover_key(tool_calls: Iterable[Any], key: str) -> bool:
    if key == "get_macro_brief":
        return any(getattr(call, "name", "") == "get_macro_brief" for call in tool_calls)

    if not key.startswith("get_stock_brief:"):
        return False
    symbol = key.split(":", 1)[1]
    for call in tool_calls:
        if getattr(call, "name", "") != "get_stock_brief":
            continue
        args = getattr(call, "args_summary", "") or ""
        if symbol in args.upper():
            return True
    return False
