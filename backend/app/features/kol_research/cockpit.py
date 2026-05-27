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
_CACHE_TTL_SECONDS = 3600  # tweets refresh hourly via fetch cron; 1h cache is fine
_PAGE_SIZE = 100  # GET list action caps page size at 100
_MAX_PAGES = 60  # safety cap (~6000 tweets)

# ---------------------------------------------------------------------------
# Curated ticker dictionary — ticker -> alias strings.
# CJK aliases match as substrings; ASCII aliases match case-sensitively on word
# boundaries (so "ARM" the ticker ≠ "arm", "META" ≠ "metaverse"). Seeded from the
# tickers named across methodologies/qinbafrank/lens-*.md. Tunable.
# ---------------------------------------------------------------------------
TICKER_ALIASES: dict[str, list[str]] = {
    # AI 算力底座
    "NVDA": ["英伟达", "Nvidia", "NVDA"],
    "TSM": ["台积电", "台积", "TSMC", "TSM"],
    "ASML": ["阿斯麦", "ASML"],
    # HBM·存储 / 半导体
    "MU": ["美光", "Micron", "MU"],
    "AVGO": ["博通", "Broadcom", "AVGO"],
    "AMD": ["超微", "AMD"],
    "INTC": ["英特尔", "Intel", "INTC"],
    "ARM": ["ARM"],
    # 数据中心 / Newcloud / Mag
    "ORCL": ["甲骨文", "Oracle", "ORCL"],
    "MSFT": ["微软", "Microsoft", "MSFT"],
    "GOOGL": ["谷歌", "Alphabet", "GOOGL", "GOOG"],
    "AMZN": ["亚马逊", "Amazon", "AMZN"],
    "META": ["脸书", "Meta", "META"],
    "CRWV": ["CoreWeave", "CRWV"],
    "NBIS": ["Nebius", "NBIS"],
    # 加密·稳定币·链上金融
    "CRCL": ["Circle", "CRCL"],
    "COIN": ["Coinbase", "COIN"],
    "HOOD": ["罗宾汉", "Robinhood", "HOOD"],
    "MSTR": ["微策略", "MicroStrategy", "MSTR"],
    "BMNR": ["BMNR"],
    # 其他核心覆盖
    "PLTR": ["Palantir", "PLTR"],
    "RKLB": ["火箭实验室", "Rocket Lab", "RocketLab", "RKLB"],
    "TSLA": ["特斯拉", "Tesla", "TSLA"],
    "AAPL": ["苹果", "Apple", "AAPL"],
}

# Tickers with no FMP US-equity price (crypto / unlisted). Timeline shows without
# a price line. Kept small; FMP failures also degrade gracefully.
NON_PRICEABLE: set[str] = set()


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


def _lock_for(username: str) -> asyncio.Lock:
    if username not in _locks:
        _locks[username] = asyncio.Lock()
    return _locks[username]


async def _fetch_all_tweets(username: str) -> list[dict]:
    """Pull the full tweet history for one author via the public GET `list` action.

    `list` is an open read (no secret); paginate until a short page. Server orders
    by created_at DESC and caps page size at 100.
    """
    db = get_insforge_service()
    rows: list[dict] = []
    for page in range(1, _MAX_PAGES + 1):
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
        batch = payload.get("data", []) or []
        rows.extend(batch)
        if len(batch) < _PAGE_SIZE:
            break
    return rows


def _slim_tweet(t: dict, tickers: list[str]) -> dict:
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
    }


def _build_index(tweets: list[dict]) -> dict:
    """Aggregate tweets into a per-ticker index.

    Returns:
      {
        "total_tweets": int,
        "tickers": {TICKER: {"count": int, "first": iso, "latest": iso, "tweets": [slim...]}},
      }
    """
    by_ticker: dict[str, list[dict]] = {}
    by_id: dict[str, dict] = {}
    for t in tweets:
        tickers = match_tickers(t.get("text") or "")
        slim = _slim_tweet(t, tickers)
        if t.get("id"):
            by_id[str(t["id"])] = slim
        if not tickers:
            continue
        for tk in tickers:
            by_ticker.setdefault(tk, []).append(slim)

    tickers_out: dict[str, dict] = {}
    for tk, items in by_ticker.items():
        # edge returns newest-first; keep that ordering
        dates = [i["created_at"] for i in items if i.get("created_at")]
        tickers_out[tk] = {
            "count": len(items),
            "first": min(dates) if dates else None,
            "latest": max(dates) if dates else None,
            "tweets": items,
        }
    return {"total_tweets": len(tweets), "tickers": tickers_out, "by_id": by_id}


async def get_index(username: str, force: bool = False) -> dict:
    """Return the cached per-ticker index for a persona, refreshing past TTL."""
    cached = _cache.get(username)
    now = time.time()
    if not force and cached and (now - cached["at"]) < _CACHE_TTL_SECONDS:
        return cached["index"]

    async with _lock_for(username):
        cached = _cache.get(username)
        now = time.time()
        if not force and cached and (now - cached["at"]) < _CACHE_TTL_SECONDS:
            return cached["index"]
        tweets = await _fetch_all_tweets(username)
        index = _build_index(tweets)
        _cache[username] = {"at": now, "index": index}
        logger.info(
            "cockpit index built: user=%s tweets=%d tickers=%d",
            username, index["total_tweets"], len(index["tickers"]),
        )
        return index


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


async def get_ticker_tweets(username: str, ticker: str) -> Optional[dict]:
    """Per-ticker detail payload (tweets only; price added by router via FMP)."""
    index = await get_index(username)
    info = index["tickers"].get(ticker.upper())
    if info is None:
        return None
    return {
        "ticker": ticker.upper(),
        "aliases": TICKER_ALIASES.get(ticker.upper(), []),
        "count": info["count"],
        "first": info["first"],
        "latest": info["latest"],
        "priceable": ticker.upper() not in NON_PRICEABLE,
        "tweets": info["tweets"],
    }


async def get_tweets_by_ids(username: str, ids: list[str]) -> list[dict]:
    """Resolve specific tweet ids to their slim payloads (for sector rep tweets)."""
    index = await get_index(username)
    by_id = index.get("by_id", {})
    return [by_id[str(i)] for i in ids if str(i) in by_id]


# ---------------------------------------------------------------------------
# Curated methodology config — sourced from methodologies/qinbafrank/*.md.
# Static identity content (not dynamic), hand-distilled for structured display.
# The full lens markdown remains the single source for the chat agent.
# ---------------------------------------------------------------------------
PROFILE_CORE: dict = {
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


def get_profile_core() -> dict:
    """Methodology core (static, curated from overview.md)."""
    return PROFILE_CORE
