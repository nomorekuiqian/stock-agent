"""KOL Persona Cockpit — read-only aggregation for the persona page.

Powers the public `/kol/{username}` cockpit (methodology core + sector cards +
per-ticker history). NOT the chat agent (that's agent.py / router chat endpoints).

Ticker extraction note (2026-05-24): qinbafrank writes in Chinese and does NOT
use `$cashtag`. Tickers are matched from raw `kol_tweets.text` via a curated
Chinese-name → ticker dictionary. No LLM enrichment dependency. This only covers
tickers present in TICKER_ALIASES (his core coverage set), which is acceptable.
"""

from __future__ import annotations

import asyncio
import re
import time
from typing import Optional

from app.core.database import get_insforge_service
from app.core.logging import get_logger

logger = get_logger(__name__)

_FUNCTION_NAME = "kol-tweets"
_CACHE_TTL_SECONDS = 21600  # 6h; tweets refresh daily via fetch cron, so 6h is fresh enough
_PAGE_SIZE = 100  # GET list action caps page size at 100
_MAX_PAGES = 60  # safety cap (~6000 tweets)

# Reply-quality threshold (Plan D, 2026-05-27):
# Short replies to others are mostly social chit-chat. Long replies are
# usually substantive analysis. Length is counted in characters; 80 CJK
# chars ~= 2-3 sentences. Tune here; nothing else hard-codes the value.
_LONG_REPLY_MIN_LEN = 80


def _is_low_quality_reply(t: dict, username: str) -> bool:
    """Return True if `t` is a short reply to someone other than the persona.

    Drops the noisy social-replies bucket; keeps substantive long replies
    (>=_LONG_REPLY_MIN_LEN chars) and self-thread continuations.
    """
    if t.get("tweet_type") != "reply":
        return False
    reply_to = (t.get("in_reply_to_username") or "").lower()
    is_self_thread = reply_to == username.lower()
    if is_self_thread:
        return False
    text = t.get("text") or ""
    return len(text) < _LONG_REPLY_MIN_LEN


def _default_feed_visible(items: list[dict], username: str) -> list[dict]:
    """Apply the default Live-Feed visibility filter (drops low-quality
    replies). Shared by `get_feed` and `get_topic_tree` so tree counts and
    feed hit counts stay aligned by construction.
    """
    return [t for t in items if not _is_low_quality_reply(t, username)]

# ---------------------------------------------------------------------------
# Curated ticker dictionary — ticker -> alias strings.
# CJK aliases match as substrings; ASCII aliases match case-sensitively on word
# boundaries (so "ARM" the ticker ≠ "arm", "META" ≠ "metaverse"). Seeded from
# the Frank cockpit skill ticker universe. Tunable.
# ---------------------------------------------------------------------------
TICKER_ALIASES: dict[str, list[str]] = {
    # --- AI 算力底座 / GPU / 半导体设计 ---
    "NVDA": ["英伟达", "Nvidia", "NVDA"],
    "TSM": ["台积电", "台积", "TSMC", "TSM"],
    "ASML": ["阿斯麦", "ASML"],
    "AMD": ["超微", "AMD"],
    "ARM": ["ARM"],
    "INTC": ["英特尔", "Intel", "INTC"],
    "AVGO": ["博通", "Broadcom", "AVGO"],
    "QCOM": ["高通", "Qualcomm", "QCOM"],
    "ON": ["安森美", "OnSemi", "ON"],
    "NVTS": ["Navitas", "NVTS"],
    "LITE": ["Lumentum", "LITE"],
    "ADI": ["亚德诺", "Analog Devices", "ADI"],
    "WOLF": ["Wolfspeed", "WOLF"],
    "TSEM": ["TowerSemi", "TSEM"],
    "COHR": ["Coherent", "COHR"],
    "GLW": ["康宁", "Corning", "GLW"],
    # --- HBM · 存储 ---
    "MU": ["美光", "Micron", "MU"],
    "SNDK": ["闪迪", "SanDisk", "SNDK"],
    "WDC": ["西部数据", "Western Digital", "WDC"],
    "STX": ["希捷", "Seagate", "STX"],
    # --- 数据中心 · Newcloud · Mag ---
    "ORCL": ["甲骨文", "Oracle", "ORCL"],
    "MSFT": ["微软", "Microsoft", "MSFT"],
    "GOOGL": ["谷歌", "Alphabet", "GOOGL", "GOOG"],
    "AMZN": ["亚马逊", "Amazon", "AMZN"],
    "META": ["脸书", "Meta", "META"],
    "AAPL": ["苹果", "Apple", "AAPL"],
    "CRWV": ["CoreWeave", "CRWV"],
    "NBIS": ["Nebius", "NBIS"],
    "IBM": ["IBM"],
    # --- AI 应用 / 数据 / 安全 ---
    "PLTR": ["Palantir", "PLTR"],
    "CRWD": ["CrowdStrike", "CRWD"],
    "SNOW": ["Snowflake", "SNOW"],
    # --- 加密 · 稳定币 · 链上金融 · 券商 ---
    "CRCL": ["Circle", "CRCL"],
    "COIN": ["Coinbase", "COIN"],
    "HOOD": ["罗宾汉", "Robinhood", "HOOD"],
    "MSTR": ["微策略", "MicroStrategy", "MSTR"],
    "BMNR": ["BMNR"],
    "FUTU": ["富途", "Futu", "FUTU"],
    "TIGR": ["老虎证券", "TIGR"],
    # --- 太空 / 卫星 / 国防 ---
    "RKLB": ["火箭实验室", "Rocket Lab", "RocketLab", "RKLB"],
    "ASTS": ["AST SpaceMobile", "ASTS"],
    "LUNR": ["Intuitive Machines", "LUNR"],
    "LHX": ["L3Harris", "LHX"],
    "BA": ["波音", "Boeing", "BA"],
    "LMT": ["洛克希德", "Lockheed Martin", "LMT"],
    "NOC": ["诺斯罗普", "Northrop Grumman", "NOC"],
    "GD": ["通用动力", "General Dynamics", "GD"],
    "HII": ["亨廷顿英格尔斯", "Huntington Ingalls", "HII"],
    "KTOS": ["Kratos", "KTOS"],
    "BWXT": ["BWX Technologies", "BWXT"],
    "AVAV": ["AeroVironment", "AVAV"],
    "TDY": ["Teledyne", "TDY"],
    "HON": ["霍尼韦尔", "Honeywell", "HON"],
    "IRDM": ["铱星", "Iridium", "IRDM"],
    "BKSY": ["BlackSky", "BKSY"],
    "PL": ["Planet Labs", "PL"],
    "RDW": ["Redwire", "RDW"],
    "SATS": ["EchoStar", "SATS"],
    "VSAT": ["Viasat", "VSAT"],
    "SPIR": ["Spire Global", "SPIR"],
    # --- 能源 / 电力 / 材料 ---
    "VST": ["Vistra", "VST"],
    "CEG": ["Constellation Energy", "CEG"],
    "XOM": ["埃克森美孚", "Exxon", "XOM"],
    "CVX": ["雪佛龙", "Chevron", "CVX"],
    "COP": ["康菲", "ConocoPhillips", "COP"],
    "HAL": ["哈里伯顿", "Halliburton", "HAL"],
    "SCCO": ["南方铜业", "Southern Copper", "SCCO"],
    # --- 电信 ---
    "VZ": ["威瑞森", "Verizon", "VZ"],
    "TMUS": ["T-Mobile", "TMUS"],
    "NOK": ["诺基亚", "Nokia", "NOK"],
    "BB": ["黑莓", "BlackBerry", "BB"],
    # --- 汽车 / 自动驾驶 ---
    "TSLA": ["特斯拉", "Tesla", "TSLA"],
    "LI": ["理想汽车", "Li Auto", "LI"],
    "BABA": ["阿里巴巴", "Alibaba", "BABA"],
    "WRD": ["文远知行", "WeRide", "WRD"],
    # --- 私募公司 (无报价，但他常提) ---
    "OPENAI": ["OpenAI"],
    "ANTHROPIC": ["Anthropic"],
    "SPACEX": ["SpaceX"],
    "XAI": ["xAI"],
    # --- 加密资产 / 稳定币 ---
    "BTC": ["比特币", "Bitcoin", "BTC"],
    "ETH": ["以太坊", "Ethereum", "ETH"],
    "SOL": ["索拉纳", "Solana", "SOL"],
    "USDC": ["USDC"],
    "USDT": ["USDT"],
    # --- 指数 / ETF ---
    "SPY": ["SPY"],
    "QQQ": ["QQQ"],
    "EWY": ["EWY"],
    "IEF": ["IEF"],
    "UUP": ["UUP"],
}

# Tickers with no FMP US-equity price (crypto / private / index). Timeline
# shows without a price line. FMP failures also degrade gracefully.
NON_PRICEABLE: set[str] = {
    "OPENAI", "ANTHROPIC", "SPACEX", "XAI",
    "BTC", "ETH", "SOL", "USDC", "USDT",
    "SPY", "QQQ", "EWY", "IEF", "UUP",
}


def _is_cjk(s: str) -> bool:
    return any("一" <= ch <= "鿿" for ch in s)


def _build_matchers() -> dict[str, list]:
    """Compile per-ticker matchers. Each entry: list of ('cjk', str) | ('en', regex)."""
    compiled: dict[str, list] = {}
    for ticker, aliases in TICKER_ALIASES.items():
        entries: list = []
        for alias in aliases:
            if _is_cjk(alias):
                entries.append(("cjk", alias))
            else:
                entries.append(
                    ("en", re.compile(rf"(?<![A-Za-z0-9]){re.escape(alias)}(?![A-Za-z0-9])"))
                )
        compiled[ticker] = entries
    return compiled


_MATCHERS = _build_matchers()


def match_tickers(text: str) -> list[str]:
    """Return the tickers mentioned in a tweet's text, by alias dictionary."""
    if not text:
        return []
    hits: list[str] = []
    for ticker, entries in _MATCHERS.items():
        for kind, matcher in entries:
            if kind == "cjk":
                if matcher in text:
                    hits.append(ticker)
                    break
            else:  # 'en'
                if matcher.search(text):
                    hits.append(ticker)
                    break
    return hits


# ---------------------------------------------------------------------------
# Tweet fetch + aggregation (TTL cached)
# ---------------------------------------------------------------------------

_cache: dict[str, dict] = {}  # username -> {"at": ts, "index": {...}}
_locks: dict[str, asyncio.Lock] = {}
_refresh_tasks: dict[str, asyncio.Task] = {}  # background SWR refresh handles


def _lock_for(username: str) -> asyncio.Lock:
    if username not in _locks:
        _locks[username] = asyncio.Lock()
    return _locks[username]


_PARALLEL_BATCH = 10  # pages fetched in one concurrent wave


async def _fetch_all_tweets(username: str) -> list[dict]:
    """Pull the full tweet history for one author via the public GET `list` action.

    Fetches pages in parallel batches of _PARALLEL_BATCH. Stops the batch loop
    as soon as any page in the current wave returns fewer than _PAGE_SIZE rows
    (indicating we've reached the end). Server orders by created_at DESC.
    """
    db = get_insforge_service()

    async def _fetch_page(page: int) -> list[dict]:
        result = await db.call_function(
            _FUNCTION_NAME,
            method="GET",
            params={
                "action": "list",
                "username": username,
                "page": page,
                "limit": _PAGE_SIZE,
            },
            timeout=30.0,
        )
        if result["status_code"] != 200:
            raise RuntimeError(
                f"list failed (page {page}): HTTP {result['status_code']} "
                f"{result.get('text', '')[:200]}"
            )
        payload = result.get("data") or {}
        if not payload.get("success"):
            raise RuntimeError(f"list returned error (page {page}): {payload.get('error')}")
        return payload.get("data", []) or []

    rows: list[dict] = []
    next_start = 1
    while next_start <= _MAX_PAGES:
        end = min(next_start + _PARALLEL_BATCH - 1, _MAX_PAGES)
        batch_results = await asyncio.gather(*[_fetch_page(p) for p in range(next_start, end + 1)])
        reached_end = False
        for batch in batch_results:
            rows.extend(batch)
            if len(batch) < _PAGE_SIZE:
                reached_end = True
        if reached_end:
            break
        next_start = end + 1
    return rows


# Topic tree leaves under "产业板块". Each leaf aggregates one or more raw
# enrichment `sectors` strings into a user-facing bucket.
_TOPIC_INDUSTRY_LEAVES: dict[str, tuple[str, ...]] = {
    "ai_infra": ("AI_infra",),
    "optical": ("CPO", "photonics", "optical_transceiver"),
    "semi": ("power_semi", "substrates"),
    "neocloud": ("neocloud",),
    "defense": ("defense",),
    "space": ("space",),
}
_TOPIC_INDUSTRY_LEAF_LABELS: dict[str, str] = {
    "ai_infra": "AI 基建",
    "optical": "光通信",
    "semi": "半导体",
    "neocloud": "新型云",
    "defense": "国防",
    "space": "太空",
}


def _classify_tweet_topics(content_type: Optional[str], sectors: Optional[list[str]]) -> list[str]:
    """Map a tweet's enrichment (content_type + sectors) to topic node keys.

    Returns keys like "macro", "rules", "industry/ai_infra". A tweet may map to
    multiple keys (e.g. mentions both AI_infra and CPO).
    """
    topics: list[str] = []
    sectors_set = set(sectors or [])
    if content_type == "macro_view" or "macro" in sectors_set:
        topics.append("macro")
    if content_type == "sector_framework":
        topics.append("rules")
    for leaf, src_sectors in _TOPIC_INDUSTRY_LEAVES.items():
        if any(s in sectors_set for s in src_sectors):
            topics.append(f"industry/{leaf}")
    return topics


def _slim_tweet(t: dict, tickers: list[str]) -> dict:
    raw_symbols = t.get("symbols")
    symbols: dict = raw_symbols if isinstance(raw_symbols, dict) else {}
    content_type = symbols.get("content_type")
    raw_sectors = symbols.get("sectors")
    sectors_raw = raw_sectors if isinstance(raw_sectors, list) else None
    key_claim = symbols.get("key_claim")
    raw_stances = symbols.get("ticker_stances")
    ticker_stances = raw_stances if isinstance(raw_stances, list) else None
    topics = _classify_tweet_topics(content_type, sectors_raw)
    return {
        "id": t.get("id"),
        "text": t.get("text") or "",
        "created_at": t.get("created_at"),
        "url": t.get("url"),
        "like_count": t.get("like_count") or 0,
        "retweet_count": t.get("retweet_count") or 0,
        "reply_count": t.get("reply_count") or 0,
        "tweet_type": t.get("tweet_type"),
        "tickers": tickers,
        # Enrichment surfaces — exposed to the cockpit UI for topic filtering.
        "content_type": content_type,
        "key_claim": key_claim,
        "topics": topics,
        "ticker_stances": ticker_stances,
        "source_author_username": symbols.get("source_author_username"),
        "source_kind": symbols.get("source_kind"),
        "article_title": symbols.get("article_title"),
        # Raw reply target, kept on the slim so feed-time filters can classify
        # self-thread continuations vs replies-to-others.
        "in_reply_to_username": t.get("in_reply_to_username"),
    }


def _build_index(tweets: list[dict]) -> dict:
    """Aggregate tweets into a per-ticker index + a flat chronological feed.

    Returns:
      {
        "total_tweets": int,
        "tickers": {TICKER: {"count": int, "first": iso, "latest": iso, "tweets": [slim...]}},
        "by_id": {id: slim},
        "all_tweets": [slim, ...]  # all tweets, newest-first; includes those without tickers
      }
    """
    by_ticker: dict[str, list[dict]] = {}
    by_id: dict[str, dict] = {}
    all_tweets: list[dict] = []
    for t in tweets:
        tickers = match_tickers(t.get("text") or "")
        slim = _slim_tweet(t, tickers)
        all_tweets.append(slim)
        if t.get("id"):
            by_id[str(t["id"])] = slim
        for tk in tickers:
            by_ticker.setdefault(tk, []).append(slim)

    # Edge function returns newest-first already; defensively sort to be safe.
    all_tweets.sort(key=lambda x: x.get("created_at") or "", reverse=True)

    tickers_out: dict[str, dict] = {}
    for tk, items in by_ticker.items():
        dates = [i["created_at"] for i in items if i.get("created_at")]
        tickers_out[tk] = {
            "count": len(items),
            "first": min(dates) if dates else None,
            "latest": max(dates) if dates else None,
            "tweets": items,
        }
    return {
        "total_tweets": len(tweets),
        "tickers": tickers_out,
        "by_id": by_id,
        "all_tweets": all_tweets,
    }


async def _rebuild_index(username: str) -> dict:
    """Fetch + aggregate; caller holds the username lock."""
    tweets = await _fetch_all_tweets(username)
    index = _build_index(tweets)
    _cache[username] = {"at": time.time(), "index": index}
    logger.info(
        "cockpit index built: user=%s tweets=%d tickers=%d",
        username, index["total_tweets"], len(index["tickers"]),
    )
    return index


async def _refresh_index_bg(username: str) -> None:
    """Background refresh — runs while users continue to receive the stale index."""
    try:
        async with _lock_for(username):
            await _rebuild_index(username)
    except Exception as e:  # noqa: BLE001
        logger.warning("background index refresh failed for %s: %s", username, e)


async def get_index(username: str, force: bool = False) -> dict:
    """Return the cached per-ticker index.

    Cache strategy:
      - Fresh hit (< TTL): return cached.
      - Stale hit: return cached IMMEDIATELY, kick off a background refresh so
        the next caller hits a warm cache. Users never wait for a refresh once
        the cache has been populated.
      - Cold (no cache): block while building. Per-username lock prevents
        concurrent first-callers from each triggering their own fetch.
      - force=True: always block and rebuild.
    """
    if not force:
        cached = _cache.get(username)
        if cached:
            age = time.time() - cached["at"]
            if age < _CACHE_TTL_SECONDS:
                return cached["index"]
            # Stale — schedule background refresh, return stale right now.
            existing = _refresh_tasks.get(username)
            if existing is None or existing.done():
                _refresh_tasks[username] = asyncio.create_task(_refresh_index_bg(username))
            return cached["index"]

    # Cold path (or force=True): block on rebuild.
    async with _lock_for(username):
        cached = _cache.get(username)
        if not force and cached and (time.time() - cached["at"]) < _CACHE_TTL_SECONDS:
            return cached["index"]
        return await _rebuild_index(username)


async def list_tickers(username: str) -> list[dict]:
    """Ticker summaries (no price); sorted by mention count desc."""
    index = await get_index(username)
    out = [
        {
            "ticker": tk,
            "aliases": TICKER_ALIASES.get(tk, []),
            "count": info["count"],
            "first": info["first"],
            "latest": info["latest"],
            "priceable": tk not in NON_PRICEABLE,
        }
        for tk, info in index["tickers"].items()
    ]
    out.sort(key=lambda x: x["count"], reverse=True)
    return out


async def get_ticker_tweets(
    username: str,
    ticker: str,
    *,
    include_replies: bool = False,
) -> Optional[dict]:
    """Per-ticker detail payload (tweets only; price added by router via FMP).

    By default applies the same reply-to-others filter as `get_feed` so that
    a ticker drilldown shows the same high-signal set the Live Feed shows.
    """
    index = await get_index(username)
    info = index["tickers"].get(ticker.upper())
    if info is None:
        return None

    tweets = info["tweets"]
    if not include_replies:
        tweets = [t for t in tweets if not _is_low_quality_reply(t, username)]

    # Compute reply_kind + strip the raw in_reply_to_username field from
    # the public response (same convention as get_feed).
    clean_tweets: list[dict] = []
    for t in tweets:
        reply_kind: Optional[str] = None
        if t.get("tweet_type") == "reply":
            target = (t.get("in_reply_to_username") or "").lower()
            if target == username.lower():
                reply_kind = "self"
            elif target:
                reply_kind = "other"
        out = {k: v for k, v in t.items() if k != "in_reply_to_username"}
        out["reply_kind"] = reply_kind
        clean_tweets.append(out)

    return {
        "ticker": ticker.upper(),
        "aliases": TICKER_ALIASES.get(ticker.upper(), []),
        "count": len(clean_tweets),
        "first": info["first"],
        "latest": info["latest"],
        "priceable": ticker.upper() not in NON_PRICEABLE,
        "tweets": clean_tweets,
    }


# Content types that carry actionable opinion. `noise` is filler; `macro_view`
# is not ticker-specific. Everything else (thesis / catalyst / risk_flag /
# sector_framework / trade_action) is fair game for the per-ticker timeline.
_TIMELINE_KEEP_TYPES: frozenset[str] = frozenset(
    {"thesis", "catalyst", "risk_flag", "sector_framework", "trade_action"}
)


def _stance_for(ticker: str, stances: Optional[list]) -> Optional[str]:
    if not isinstance(stances, list):
        return None
    target = ticker.upper()
    for entry in stances:
        if not isinstance(entry, dict):
            continue
        if str(entry.get("ticker") or "").upper() == target:
            stance = entry.get("stance")
            if isinstance(stance, str):
                return stance
    return None


def _pick_timeline_items(tweets: list[dict], ticker: str, limit: int) -> list[dict]:
    """Select the most informative subset of mentions to render on the vertical
    timeline. Rules: keep tweets with a non-empty key_claim AND a non-trivial
    content_type. Always preserve the earliest + the latest. From the middle
    pool, pick the top by like_count up to `limit`. Return newest-first for
    reading from the current view back to the historical origin.
    """
    eligible = [
        t for t in tweets
        if (t.get("key_claim") or "").strip()
        and (t.get("content_type") in _TIMELINE_KEEP_TYPES)
    ]
    if not eligible:
        return []
    eligible.sort(key=lambda t: t.get("created_at") or "")

    if len(eligible) <= limit:
        chosen = eligible
    else:
        earliest, latest = eligible[0], eligible[-1]
        middle = eligible[1:-1]
        # Score = like_count primarily; tie-break by created_at desc so newer
        # wins when likes are equal.
        middle.sort(
            key=lambda t: (t.get("like_count") or 0, t.get("created_at") or ""),
            reverse=True,
        )
        keep_middle = middle[: max(0, limit - 2)]
        chosen = [earliest, *keep_middle, latest]
    chosen.sort(key=lambda t: t.get("created_at") or "", reverse=True)

    out: list[dict] = []
    for t in chosen:
        out.append({
            "id": t.get("id"),
            "created_at": t.get("created_at"),
            "url": t.get("url"),
            "like_count": t.get("like_count") or 0,
            "content_type": t.get("content_type"),
            "key_claim": t.get("key_claim"),
            "stance": _stance_for(ticker, t.get("ticker_stances")),
        })
    return out


async def get_ticker_timeline(
    username: str,
    ticker: str,
    *,
    limit: int = 10,
) -> Optional[dict]:
    """Per-ticker vertical opinion timeline: ~10 hand-picked turning points
    drawn from his enrichment-annotated mentions, newest-first. Returns None if
    the ticker isn't covered at all.
    """
    detail = await get_ticker_tweets(username, ticker)
    if detail is None:
        return None
    items = _pick_timeline_items(detail["tweets"], ticker, limit)
    return {
        "ticker": ticker.upper(),
        "first": detail["first"],
        "latest": detail["latest"],
        "total": detail["count"],
        "items": items,
    }


async def get_tweets_by_ids(username: str, ids: list[str]) -> list[dict]:
    """Resolve specific tweet ids to their slim payloads (for sector rep tweets)."""
    index = await get_index(username)
    by_id = index.get("by_id", {})
    return [by_id[str(i)] for i in ids if str(i) in by_id]


# ---------------------------------------------------------------------------
# Curated cockpit display config.
# Static identity content (not dynamic), hand-distilled for structured display.
# The skill markdown remains the source for the chat agent.
# ---------------------------------------------------------------------------
PROFILE_CORE_QINBAFRANK: dict = {
    # Public Twitter bio — what the KOL says about themselves on their profile.
    # Distinct from `portrait` (the analytical-lens identity used by the chat agent).
    # Source: verbatim from @qinbafrank's Twitter bio.
    "bio": (
        "Investor in AI、Crypto、TMT，跟踪最前沿科技趋势、野生宏观政经观察、研究全球资本流动性、"
        "周期趋势投资。记录个人学习和思考，经常出错常态掉坑爬坑。Runner\U0001f3c3"
    ),
    "portrait": (
        "中文圈最系统的「美股 / AI 算力 / 加密资产」产业派分析师——产业故事 + 政治经济学 + "
        "可证伪句式三件套,强信念配反方观点,长视角配短期 catalyst,不喊崩盘也不喊梭哈。"
    ),
    "principles": [
        {"title": "产业故事 > 技术面", "gist": "基本面主导的市场紧盯产业进展和业绩增速,不看 K 线。入场资格只有一条:挂在某个加速的产业叙事关键位置。"},
        {"title": "强信念必带可证伪锚", "gist": "强信念 = 已经想清楚自己怎么会错。每个判断都给「什么数据会推翻它」的具体阈值。"},
        {"title": "风险等级化", "gist": "先问「哪一级风险」:小级别(个位数)/ 中级别(15-20%)/ 大级别(25%+,需产业崩塌或宏观大危机)。"},
        {"title": "政治经济学的世界", "gist": "当下是「政治+财政+货币+地缘」四螺旋驱动;逆全球化时代财政主导,而非货币主导。"},
        {"title": "拿不住 = 不该重仓", "gist": "仓位匹配认知深度。进场前要能回答「回调 30% 能不能拿住」。"},
    ],
    "fingerprint": "「若 X 则证伪 Y」—— 强信念之前必带具体可证伪条件,这是他最强的指纹。",
    "not_doing": [
        "日内交易 / 技术分析为主",
        "Meme 币 / 空气币 / 无产业逻辑 small cap",
        "基于政治倾向选股",
        "给精确买卖点位",
        "喊大盘崩盘 / 美元崩盘 / Fed 必降息",
    ],
}

# sector key -> curated card. `lens` matches a persona.lenses[...] key (full body).
SECTORS: list[dict] = [
    {
        "key": "ai-compute-base", "group": "AI 算力链", "label": "算力底座",
        "eyebrow": "COMPUTE BASE", "lens": "qinbafrank-on-ai-infrastructure",
        "stance": "产业链中间收租 + 赢家通吃,把算力当新时代的电力。",
        "signature": "用电力的视角去看算力",
        "primary_question": "这家公司是否站在算力底座不可替代的位置?",
        "signals": ["token 消耗增速", "RPO 同比/环比", "Blackwell 出货", "营收/Capex 比值"],
        "falsifier": "若 RPO 环比 < 8% 或营收/Capex 跌破 3.5,看多被证伪。",
        "tickers": ["NVDA", "TSM", "ASML"],
        "rep_tweet_ids": ["1985745626265776331", "2033686742742798680"],
    },
    {
        "key": "ai-hbm", "group": "AI 算力链", "label": "HBM·存储/半导体",
        "eyebrow": "MEMORY", "lens": "qinbafrank-on-ai-infrastructure",
        "stance": "卡脖子环节,短缺会从一个环节跳到下一个。",
        "signature": "卡脖子环节",
        "primary_question": "这只票卡在算力链哪个不可替代的紧缺环节?",
        "signals": ["HBM 三家产能分配(SK57/三星22/美光21)", "是否克制扩产", "算力价格指数"],
        "falsifier": "若 HBM 三家集体扩产能,周期股逻辑回归。",
        "tickers": ["MU", "AVGO"],
        "rep_tweet_ids": ["2032437176580059372"],
    },
    {
        "key": "ai-datacenter", "group": "AI 算力链", "label": "数据中心·Newcloud",
        "eyebrow": "DATACENTER", "lens": "qinbafrank-on-ai-infrastructure",
        "stance": "重资产 capex 周期,看 Mag4 投入能否被利润和 backlog 消化。",
        "signature": "资本开支战争",
        "primary_question": "重资产 AI 周期是否仍能被利润和 RPO 消化?",
        "signals": ["Mag4 capex 占 FCF 比", "营收/Capex 比值", "折旧 cliff", "云收入增速"],
        "falsifier": "若 Mag4 财报半数 miss,业绩撑不起市场预期。",
        "tickers": ["CRWV", "NBIS", "ORCL", "MSFT", "GOOGL", "AMZN", "META"],
        "rep_tweet_ids": ["2023597321368547520"],
    },
    {
        "key": "ai-power", "group": "AI 算力链", "label": "电力·物理基建",
        "eyebrow": "POWER", "lens": "qinbafrank-on-ai-infrastructure",
        "stance": "算力像电力,短缺已传导到电力——结构性短缺无法靠造设备快速解决。",
        "signature": "算力像电力一样",
        "primary_question": "电力/数据中心建设周期是否成为新的硬约束?",
        "signals": ["Blackwell 时租(2.75→4.08)", "数据中心电力容量预订", "建设周期"],
        "falsifier": "若电力/交货周期约束解除,量价齐升逻辑松动。",
        "tickers": [],
        "rep_tweet_ids": ["2043910896351883636", "2012789705964990803"],
    },
    {
        "key": "ai-application", "group": "AI 算力链", "label": "应用·Agent / 物理 AI",
        "eyebrow": "APPLICATION", "lens": "qinbafrank-on-ai-infrastructure",
        "stance": "越下游越激烈,赢家通吃没那么明显——诚实承认看不出最终赢家。",
        "signature": "短期看不出最终赢家",
        "primary_question": "这条应用/Agent 叙事有没有真实商业化兑现?",
        "signals": ["token 渗透率", "Agentic 用例落地", "企业渗透率"],
        "falsifier": "无真实 token 消耗或客户合同支撑的「AI 概念」直接降级。",
        "tickers": [],
        "rep_tweet_ids": ["2033686742742798680"],
    },
    {
        "key": "crypto", "group": "加密·稳定币", "label": "加密·稳定币·链上金融",
        "eyebrow": "CRYPTO RAILS", "lens": "qinbafrank-on-crypto",
        "stance": "只看能进入合规金融基建的加密资产:稳定币 / 合规交易所 / AI×Crypto 支付。",
        "signature": "金融基建,不是投机标的",
        "primary_question": "它是否把链上资产变成了合规金融基础设施?",
        "signals": ["USDC 发行量增速", "BTC ETF 净流入/流出", "立法节奏(清晰法案)", "合规交易所市占"],
        "falsifier": "若 USDC 发行量同比增速 < 50%,网络效应叙事被证伪。",
        "tickers": ["CRCL", "COIN", "HOOD", "MSTR", "BMNR"],
        "rep_tweet_ids": ["1997648243862454767", "2011727476171685992", "2019993616513659249"],
    },
    {
        "key": "macro", "group": "宏观", "label": "宏观·流动性·政策",
        "eyebrow": "MACRO REGIME", "lens": "qinbafrank-on-macro",
        "stance": "政治经济学派而非纯货币派:政治+财政+货币+地缘四螺旋。按风险级别处理波动。",
        "signature": "政治经济学的世界",
        "primary_question": "这是小级别杀估值,还是基本面/流动性进入中级别风险?",
        "signals": ["银行准备金", "SOFR-EFFR 利差", "TGA 余额", "核心 CPI/PCE", "政策三人组"],
        "falsifier": "没有产业基本面崩塌或宏观大危机,不轻易喊系统性崩盘。",
        "tickers": [],
        "rep_tweet_ids": ["2017154945674596430", "1985686986703978755", "2025195888491286833"],
    },
]

_SECTOR_BY_KEY = {s["key"]: s for s in SECTORS}


# Group-level filter map for Live Feed. Group label string -> set of tickers
# spanning all sub-sectors in that group. The feed sector filter accepts these
# top-level group labels (UI shows: AI 算力 / 加密 / 宏观). MVP uses the static
# SECTORS table; enrichment-based filtering is deferred until coverage is full.
_TICKERS_BY_GROUP: dict[str, set[str]] = {}
for _s in SECTORS:
    _TICKERS_BY_GROUP.setdefault(_s["group"], set()).update(_s.get("tickers") or [])


# Convenient short aliases the UI uses (kept stable for URLs / filter chips).
GROUP_ALIASES: dict[str, str] = {
    "ai": "AI 算力链",
    "crypto": "加密·稳定币",
    "macro": "宏观",
}


# Skill-backed sector key -> ticker set, populated lazily. Kept SEPARATE from
# _TICKERS_BY_GROUP so the legacy chip-display loop (which iterates that
# dict) is not polluted with skill-backed sector keys.
_SKILL_FILTER_TICKERS: dict[str, set[str]] = {}
_skill_filter_registered = False


def _register_skill_filter_if_needed() -> None:
    global _skill_filter_registered
    if _skill_filter_registered:
        return
    _skill_filter_registered = True
    try:
        from app.features.kol_research import skill_cockpit
        sector_tickers = skill_cockpit._build_sector_tickers()
        # Only register the canonical skill-backed sectors (SECTOR_DISPLAY). The walker
        # also yields internal SubLayer keys (semiconductor-memory-hbm /
        # neocloud / fintech-brokerage / power-and-physical-ai) used for the
        # industry-chain map; those should not appear as feed filter chips.
        for sector_key in skill_cockpit.SECTOR_DISPLAY.keys():
            entries = sector_tickers.get(sector_key) or []
            _SKILL_FILTER_TICKERS[sector_key] = {
                str(e.get("ticker") or "").upper()
                for e in entries
                if e.get("ticker")
            }
    except Exception:
        logger.exception("skill sector filter registration failed")


def _resolve_group(value: str) -> Optional[str]:
    """Resolve a filter value to either a legacy group label (key of
    _TICKERS_BY_GROUP) or a canonical skill-backed sector key (key of
    _SKILL_FILTER_TICKERS). Returns None if unrecognized.
    """
    if value in _TICKERS_BY_GROUP:
        return value
    alias = GROUP_ALIASES.get(value.lower())
    if alias:
        return alias
    _register_skill_filter_if_needed()
    if value in _SKILL_FILTER_TICKERS:
        return value
    return None


# Macro-layer groups (legacy label + skill-backed key). For these the feed filter
# also matches tweets whose text contains macro keywords, even when no
# ticker overlap exists — macro tweets often discuss Fed / liquidity / TGA
# without naming any ticker.
_MACRO_GROUP_KEYS: frozenset[str] = frozenset({"宏观", "macro-regime"})


# Curated macro keyword set. Substring match against raw tweet text
# (Chinese is case-sensitive, English is matched case-insensitive via the
# helper). Conservative — high precision, will miss some edge cases.
_MACRO_KEYWORDS: tuple[str, ...] = (
    # 央行 / 政策
    "美联储", "联储", "鲍威尔", "财政部", "财政", "货币政策",
    "缩表", "扩表", "量化宽松",
    # 流动性管道
    "流动性", "美元流动性", "银行准备金", "准备金率", "准备金",
    "TGA", "RRP", "SOFR",
    # 利率
    "利率", "降息", "加息",
    # 宏观数据
    "通胀", "通缩", "国债", "收益率",
    "CPI", "PCE", "PPI", "PMI", "GDP", "NFP",
    # 地缘 / 政策
    "地缘", "关税", "贸易战", "国会", "立法",
    # 英文常见词(命中即可,大小写不敏感)
    "Fed", "FOMC", "Powell", "Treasury", "Yield",
    "Liquidity", "Reserves", "Balance Sheet",
    "Inflation", "Deflation",
    "Rate Cut", "Rate Hike",
)

_MACRO_KEYWORDS_LOWER: tuple[str, ...] = tuple(kw.lower() for kw in _MACRO_KEYWORDS)


def _matches_macro_text(text: str) -> bool:
    if not text:
        return False
    text_lower = text.lower()
    for kw_lower in _MACRO_KEYWORDS_LOWER:
        if kw_lower in text_lower:
            return True
    return False


async def list_sectors(username: str) -> list[dict]:
    """Sector card fronts: curated stance + tickers + a real tweet-mention count."""
    index = await get_index(username)
    tickers_idx = index["tickers"]
    out: list[dict] = []
    for s in SECTORS:
        mention_count = sum(tickers_idx.get(tk, {}).get("count", 0) for tk in s["tickers"])
        out.append({
            "key": s["key"], "group": s["group"], "label": s["label"],
            "eyebrow": s["eyebrow"], "stance": s["stance"], "signature": s["signature"],
            "tickers": s["tickers"], "mention_count": mention_count,
        })
    return out


async def get_sector_detail(username: str, sector_key: str) -> Optional[dict]:
    """Full sector detail: curated method + lens body + rep tweet originals + tickers."""
    s = _SECTOR_BY_KEY.get(sector_key)
    if s is None:
        return None

    from app.shared.kol_persona import get_persona  # local import avoids cycle

    persona = get_persona(username)
    lens_body = ""
    if persona is not None:
        doc = persona.lenses.get(s["lens"])
        if doc is not None:
            lens_body = doc.body

    rep_tweets = await get_tweets_by_ids(username, s["rep_tweet_ids"])
    index = await get_index(username)
    tickers_idx = index["tickers"]
    sector_tickers = [
        {
            "ticker": tk,
            "count": tickers_idx.get(tk, {}).get("count", 0),
            "latest": tickers_idx.get(tk, {}).get("latest"),
        }
        for tk in s["tickers"]
    ]
    return {
        "key": s["key"], "group": s["group"], "label": s["label"], "eyebrow": s["eyebrow"],
        "stance": s["stance"], "signature": s["signature"],
        "primary_question": s["primary_question"], "signals": s["signals"],
        "falsifier": s["falsifier"],
        "tickers": sector_tickers,
        "rep_tweets": rep_tweets,
        "lens_body": lens_body,
    }


PROFILE_CORE_SERENITY: dict = {
    "bio": (
        "AI / 半导体供应链分析师 · 工程师视角下追踪 AI capex 漏斗的物理瓶颈; "
        "重仓小盘 niche (SIVE / AXTI / AAOI / LITE), 几乎只做多但会轮动; "
        "tweets 50% 是 quote-tweet 翻译产业新闻"
    ),
    "portrait": (
        "Serenity 用工程师视角拆 AI 资本开支漏斗: 钱从 Mag7 → Neocloud → 光通信 / 定制硅 → "
        "代工 → 衬底材料; 越往上游, 定价权和确定性越强。她不重仓 Mag7, 而是重仓漏斗末端的小盘 niche, "
        "在机构发现前定位标的, 然后无视短期波动持有到瓶颈被消解。"
    ),
    "principles": [
        {"title": "瓶颈迁移 (bottleneck rotation)",
         "gist": "每出现一个新瓶颈, 产业链就把价值传导到下一环。识别「现在卡在哪一环」是定位标的的第一步: GPU → HBM → 电力 → EML 激光 → InP/SiPh 衬底。"},
        {"title": "长期可见度 > 热度",
         "gist": "区分多年可见度的瓶颈 (InP / CPO / 玻璃基板) 和迷因热度 (内存周期 / 矿工转型) —— 前者结构性重仓, 后者短期 trade。"},
        {"title": "机构反指 (institutional contrarian)",
         "gist": "机构唱空 → 散户卖出 → 机构买入 float → 股价数月后翻倍。下跌 30%+ 时加仓而非减仓, 是她最反人性也最赚钱的规则。"},
        {"title": "强信念 + 高集中 + 不止损",
         "gist": "她的高确信仓位常占组合 10%+; 不设止损线, 用「瓶颈是否被消解」这一逻辑判定退出, 而非价格。"},
        {"title": "工程师视角 BOM 分析",
         "gist": "从财报、供应链合同、卖方分析师 note 反推 BOM 流向 (AVGO MAIA → MRVL → TSM → LITE/AAOI → AXTI), 把每一环看清楚。"},
    ],
    "fingerprint": (
        "「Bottleneck within a bottleneck」 —— 她抓的是 chokepoint 之内还有 chokepoint 的那个最上游环节, "
        "如 AXTI 在 InP 衬底里又卡 indium/gallium 原料, SIVE 在 CW DFB 激光里卡 AI 客户量产时间表。"
    ),
    "not_doing": [
        "做空 / 看跌期权",
        "止损平仓 (用瓶颈逻辑判定, 不用价格)",
        "高估值 SaaS / meme 股 / 应用层 AI (POET / IREN 这类「稀释维持市值」的也排除)",
        "技术分析 / K 线 / 趋势线",
        "宏观流动性 / Fed 利率 / Powell 讲话 (基本不写)",
    ],
}

_PROFILE_CORE_BY_USERNAME: dict[str, dict] = {
    "qinbafrank": PROFILE_CORE_QINBAFRANK,
    "aleabitoreddit": PROFILE_CORE_SERENITY,
}

# Back-compat alias used by tests + legacy callers (defaults to Frank).
PROFILE_CORE = PROFILE_CORE_QINBAFRANK


def get_profile_core(username: str = "qinbafrank") -> dict:
    """Methodology core (static, curated). Per-persona lookup."""
    return _PROFILE_CORE_BY_USERNAME.get(username, PROFILE_CORE_QINBAFRANK)


async def get_feed(
    username: str,
    *,
    limit: int = 20,
    offset: int = 0,
    sector: Optional[str] = None,
    ticker: Optional[str] = None,
    topic: Optional[str] = None,
    include_replies: bool = False,
) -> dict:
    """Time-desc tweet feed for the Live Feed module.

    Filters:
      - ticker: exact match against the per-tweet alias-derived ticker list.
      - sector: matches a group label (or short alias 'ai'/'crypto'/'macro');
                kept tweets must mention at least one ticker mapped to that group.
      - include_replies: if False (default), drops replies to OTHER users
                (low-signal). Replies to self — thread continuations — are kept
                and tagged with reply_kind="self" so the UI can label them.

    Returns:
      {
        "tweets": [...slim feed items with sectors[] + reply_kind populated...],
        "total": int,      # count after filters / default low-quality-reply removal
        "raw_total": int,  # full ingested tweet count before feed visibility filters
        "has_more": bool,
        "offset": int,
        "limit": int,
      }
    """
    index = await get_index(username)
    items: list[dict] = index.get("all_tweets") or []
    raw_total = len(items)

    # Default: filter low-quality replies (short replies to others).
    # Long replies-to-others (>= _LONG_REPLY_MIN_LEN) are kept as substantive.
    if not include_replies:
        items = _default_feed_visible(items, username)

    if ticker:
        target = ticker.upper()
        items = [t for t in items if target in (t.get("tickers") or [])]

    if topic:
        # "industry" parent matches any industry/* leaf; specific leaves match
        # only themselves.
        if topic == "industry":
            items = [
                t for t in items
                if any(k.startswith("industry/") for k in (t.get("topics") or []))
            ]
        else:
            items = [t for t in items if topic in (t.get("topics") or [])]

    if sector:
        resolved = _resolve_group(sector)
        if resolved is None:
            items = []
        else:
            allowed = _TICKERS_BY_GROUP.get(resolved) or _SKILL_FILTER_TICKERS.get(resolved, set())
            if resolved in _MACRO_GROUP_KEYS:
                # macro tweets often have no ticker — fall back to keyword scan
                items = [
                    t for t in items
                    if any(tk in allowed for tk in (t.get("tickers") or []))
                    or _matches_macro_text(t.get("text") or "")
                ]
            else:
                items = [
                    t for t in items
                    if any(tk in allowed for tk in (t.get("tickers") or []))
                ]

    total = len(items)
    sliced = items[offset : offset + limit]

    # Decorate each tweet with sector chips + reply_kind. Strip raw
    # in_reply_to_username from the response (internal classification field).
    enriched: list[dict] = []
    for t in sliced:
        groups: list[str] = []
        for tk in t.get("tickers") or []:
            for group, tks in _TICKERS_BY_GROUP.items():
                if tk in tks and group not in groups:
                    groups.append(group)

        reply_kind: Optional[str] = None
        if t.get("tweet_type") == "reply":
            reply_to = (t.get("in_reply_to_username") or "").lower()
            if reply_to == username.lower():
                reply_kind = "self"
            elif reply_to:
                reply_kind = "other"

        out = {**t, "sectors": groups, "reply_kind": reply_kind}
        out.pop("in_reply_to_username", None)
        enriched.append(out)

    return {
        "tweets": enriched,
        "total": total,
        "raw_total": raw_total,
        "has_more": (offset + limit) < total,
        "offset": offset,
        "limit": limit,
    }


async def get_topic_tree(username: str) -> dict:
    """Return the topic-filter tree (产业板块 / 宏观 / 美股规律) with per-node tweet
    counts. Reuses the cached index so it shares freshness with the feed.

    Counts are de-duplicated per tweet:
      - leaf counts: number of tweets mapped to that leaf
      - "industry" parent count: number of tweets mapped to ANY industry/* leaf
        (a tweet hitting both AI 基建 and 光通信 is counted once for the parent)
    """
    index = await get_index(username)
    items: list[dict] = index.get("all_tweets") or []
    items = _default_feed_visible(items, username)

    counts: dict[str, int] = {}
    for t in items:
        topics = set(t.get("topics") or [])
        for k in topics:
            counts[k] = counts.get(k, 0) + 1
        if any(k.startswith("industry/") for k in topics):
            counts["industry"] = counts.get("industry", 0) + 1

    industry_children = [
        {
            "key": f"industry/{leaf}",
            "label": _TOPIC_INDUSTRY_LEAF_LABELS[leaf],
            "count": counts.get(f"industry/{leaf}", 0),
        }
        for leaf in _TOPIC_INDUSTRY_LEAVES.keys()
    ]
    return {
        "tree": [
            {
                "key": "industry",
                "label": "产业板块",
                "count": counts.get("industry", 0),
                "children": industry_children,
            },
            {"key": "macro", "label": "宏观", "count": counts.get("macro", 0)},
            {"key": "rules", "label": "美股规律", "count": counts.get("rules", 0)},
        ],
        "total": len(items),
    }


async def get_evidence_tweets_by_ids(username: str, ids: list[str]) -> dict:
    """Return slim full-text tweets for curated evidence ids.

    The persona pages use this for in-page evidence reading. Results preserve
    caller order and silently skip ids that are not present in the local index.
    """
    requested = [str(item).strip() for item in ids if str(item).strip()]
    if not requested:
        return {"tweets": []}

    index = await get_index(username)
    by_id: dict[str, dict] = index.get("by_id") or {}
    cached_hits = [by_id.get(tweet_id) for tweet_id in requested]
    needs_refresh = any(tweet is None or _is_bare_url_text(tweet.get("text") or "") for tweet in cached_hits)
    if needs_refresh:
        index = await get_index(username, force=True)
        by_id = index.get("by_id") or {}

    tweets: list[dict] = []
    for tweet_id in requested:
        t = by_id.get(tweet_id)
        if not t:
            continue

        groups: list[str] = []
        for tk in t.get("tickers") or []:
            for group, tks in _TICKERS_BY_GROUP.items():
                if tk in tks and group not in groups:
                    groups.append(group)

        reply_kind: Optional[str] = None
        if t.get("tweet_type") == "reply":
            reply_to = (t.get("in_reply_to_username") or "").lower()
            if reply_to == username.lower():
                reply_kind = "self"
            elif reply_to:
                reply_kind = "other"

        out = {**t, "sectors": groups, "reply_kind": reply_kind}
        out.pop("in_reply_to_username", None)
        tweets.append(out)

    return {"tweets": tweets}


def _is_bare_url_text(text: str) -> bool:
    stripped = text.strip()
    return stripped.startswith(("http://", "https://")) and len(stripped.split()) == 1
