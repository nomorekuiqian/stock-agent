"""KOL Persona Cockpit — v3 skill distillation reader.

Reads the v3 distilled skill markdown bundles (sector/ + macro/ + ticker/)
under `methodologies/_drafts/qinbafrank-skill-v3/` and exposes them as
structured cockpit payloads for the /kol/[username]/sectors panel.

Parsing is line-based (no markdown lib): split by H2/H3 headings, extract
bullet / numbered lists, pull tweet_ids out of Evidence Map sections.

Hardcoded SECTOR_DISPLAY drives novice-friendly labels in the UI; the
template across all sector files is consistent enough that one parser
handles them all. Labels avoid jargon (Veto → 「他绝对不碰的事」, etc.).
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Optional

from app.core.logging import get_logger

logger = get_logger(__name__)

# -------------------------------------------------------------------- paths

_HERE = Path(__file__).parent
V3_ROOT = (
    _HERE.parent
    / "twitter"
    / "methodologies"
    / "_drafts"
    / "qinbafrank-skill-v3"
)


# --------------------------------------------------------- display registry

# Each entry maps a v3 skill key (= md filename stem) to its UI labels.
# Sectors come first (sorted by tweet_count at runtime), macro pinned to
# the bottom of the list.
SECTOR_DISPLAY: dict[str, dict] = {
    "ai-infrastructure": {
        "label": "AI 算力基建",
        "eyebrow": "AI INFRASTRUCTURE",
        "path": "sector/ai-infrastructure.md",
        "layer": "sector",
        "short": "AI 算力链 · 物理底层 → 算力 → 数据中心 → 应用 → 物理 AI",
    },
    "crypto-stablecoin-rwa": {
        "label": "加密 · 链上金融",
        "eyebrow": "CRYPTO & FINTECH",
        "path": "sector/crypto-stablecoin-rwa.md",
        "layer": "sector",
        "short": "底层网络 → 稳定币 → 合规交易所 → 加密原生 → 散户金融入口",
    },
    "defense-and-space": {
        "label": "国防与太空",
        "eyebrow": "DEFENSE & SPACE",
        "path": "sector/defense-and-space.md",
        "layer": "sector",
        "short": "太空发射 → 卫星 → 子系统 → 大型承包商 → 政府软件",
    },
    "macro-regime": {
        "label": "宏观环境与流动性",
        "eyebrow": "MACRO REGIME",
        "path": "macro/macro-regime.md",
        "layer": "macro",
        "short": "政治 + 财政 + 货币 + 地缘四螺旋",
    },
}


# ---------------------------------------------------- low-level parsers

_FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)
_BULLET_RE = re.compile(r"^\s*[-*]\s+(.*)$")
_NUMBERED_RE = re.compile(r"^\s*\d+[\.\)]\s+(.*)$")
_TWEET_ID_RE = re.compile(r"`(\d{15,})`")
_STAR_RE = re.compile(r"\*\*(.+?)\*\*")
_CJK_RE = re.compile(r"[一-鿿]{2,}")
_ASCII_RE = re.compile(r"[A-Za-z][A-Za-z0-9]{1,}")
# Stop chunks that appear in too many rules and add noise
_STOP_TERMS = {
    "如何", "什么", "怎么", "或者", "可以", "需要", "已经", "我们", "他们",
    "这个", "那个", "因为", "所以", "但是", "而且", "然后", "现在",
    "the", "and", "for", "with", "this", "that", "from",
}


def _strip_frontmatter(text: str) -> str:
    m = _FRONTMATTER_RE.match(text)
    if m:
        return text[m.end():]
    return text


def _parse_frontmatter(text: str) -> dict:
    m = _FRONTMATTER_RE.match(text)
    if not m:
        return {}
    out: dict = {}
    for line in m.group(1).split("\n"):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if ":" not in line:
            continue
        k, v = line.split(":", 1)
        k = k.strip()
        v = v.strip().strip('"').strip("'")
        if v.isdigit():
            out[k] = int(v)
        else:
            out[k] = v
    return out


def _split_h2(body: str) -> dict[str, str]:
    """Split body by H2 headings. Returns {title: section_body}."""
    sections: dict[str, str] = {}
    current: Optional[str] = None
    buf: list[str] = []
    for line in body.split("\n"):
        if line.startswith("## ") and not line.startswith("### "):
            if current is not None:
                sections[current] = "\n".join(buf).strip()
            current = line[3:].strip()
            buf = []
        else:
            if current is not None:
                buf.append(line)
    if current is not None:
        sections[current] = "\n".join(buf).strip()
    return sections


def _split_h3(section_body: str) -> dict[str, str]:
    out: dict[str, str] = {}
    current: Optional[str] = None
    buf: list[str] = []
    for line in section_body.split("\n"):
        if line.startswith("### "):
            if current is not None:
                out[current] = "\n".join(buf).strip()
            current = line[4:].strip()
            buf = []
        else:
            if current is not None:
                buf.append(line)
    if current is not None:
        out[current] = "\n".join(buf).strip()
    return out


def _clean(text: str) -> str:
    return _STAR_RE.sub(r"\1", text).strip()


def _extract_bullets(text: str) -> list[str]:
    out = []
    for line in text.split("\n"):
        m = _BULLET_RE.match(line)
        if m:
            out.append(_clean(m.group(1)))
    return out


def _extract_numbered(text: str) -> list[str]:
    out = []
    for line in text.split("\n"):
        m = _NUMBERED_RE.match(line)
        if m:
            out.append(_clean(m.group(1)))
    return out


def _extract_tweet_ids(text: str) -> list[str]:
    """Return distinct tweet_ids in first-occurrence order."""
    seen: set[str] = set()
    out: list[str] = []
    for m in _TWEET_ID_RE.finditer(text):
        tid = m.group(1)
        if tid not in seen:
            seen.add(tid)
            out.append(tid)
    return out


def _extract_terms(rule: str) -> list[str]:
    """Extract searchable terms from a rule string.

    Pulls CJK chunks (>=2 chars) and ASCII words (>=2 chars), dedup'd.
    Filters obvious stop words. Used for keyword-overlap scoring against
    candidate tweet bodies.
    """
    out: list[str] = []
    for m in _CJK_RE.findall(rule):
        if m not in _STOP_TERMS:
            out.append(m)
    for m in _ASCII_RE.findall(rule):
        lm = m.lower()
        if lm not in _STOP_TERMS:
            out.append(m)
    # Dedupe preserving order, case-insensitive for ASCII
    seen: set[str] = set()
    dedup: list[str] = []
    for t in out:
        k = t.lower()
        if k not in seen:
            seen.add(k)
            dedup.append(t)
    return dedup


def rank_tweets_for_rule(
    rule: str,
    candidates: list[dict],
    limit: int = 3,
) -> list[str]:
    """Score candidate tweets against `rule` by keyword overlap.

    Each candidate must have 'id', 'text', and optionally 'like_count'.
    Returns top-N tweet_ids (de-duplicated) sorted by:
      1. # of distinct rule terms appearing in the tweet text (desc)
      2. like_count (desc)
    """
    terms = _extract_terms(rule)
    if not terms:
        return []
    scored: list[tuple[int, int, str]] = []
    for c in candidates:
        text = (c.get("text") or "").lower()
        if not text:
            continue
        hit = 0
        for t in terms:
            if t.lower() in text:
                hit += 1
        if hit > 0:
            scored.append((hit, c.get("like_count") or 0, str(c.get("id") or "")))
    scored.sort(key=lambda x: (-x[0], -x[1]))
    out: list[str] = []
    seen: set[str] = set()
    for _, _, tid in scored:
        if tid and tid not in seen:
            seen.add(tid)
            out.append(tid)
            if len(out) >= limit:
                break
    return out


def _fuzzy_section(sections: dict[str, str], *needles: str) -> str:
    """Pick the first section whose title contains any of `needles`."""
    for title, body in sections.items():
        for n in needles:
            if n in title:
                return body
    return ""


# ----------------------------------------------------------- file readers

def _read(path_rel: str) -> Optional[str]:
    p = V3_ROOT / path_rel
    if not p.exists():
        logger.warning("v3 file missing: %s", p)
        return None
    return p.read_text(encoding="utf-8")


def _load_sector_index() -> dict[str, int]:
    """Returns {sector_key: tweet_count} from evidence/sector-index.json."""
    raw = _read("evidence/sector-index.json")
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("sector-index.json invalid JSON")
        return {}
    counts: dict[str, int] = {}
    for k, v in data.items():
        if isinstance(v, dict):
            counts[k] = int(v.get("count", 0))
        elif isinstance(v, list):
            counts[k] = len(v)
    return counts


# --------------------------------------- ticker membership per sector

_sector_tickers_cache: Optional[dict[str, list[dict]]] = None


def _build_sector_tickers() -> dict[str, list[dict]]:
    """Walk ticker/*.md, return {sector_key: [{ticker, coverage, count}, ...]}.

    Each ticker can belong to multiple sectors (via "## 所属上级" body refs).
    Order within a sector list: by direct_mention_count desc.
    """
    global _sector_tickers_cache
    if _sector_tickers_cache is not None:
        return _sector_tickers_cache

    out: dict[str, list[dict]] = {}
    ticker_dir = V3_ROOT / "ticker"
    if not ticker_dir.is_dir():
        _sector_tickers_cache = out
        return out

    for md in sorted(ticker_dir.glob("*.md")):
        try:
            raw = md.read_text(encoding="utf-8")
        except OSError:
            continue
        ticker = md.stem
        fm = _parse_frontmatter(raw)
        coverage = fm.get("coverage") or ""
        direct_count = fm.get("direct_mention_count") or 0
        primary = fm.get("parent_sector")
        body = _strip_frontmatter(raw)
        sections = _split_h2(body)
        parent_section = _fuzzy_section(sections, "所属上级", "上级")
        sector_refs = re.findall(r"sector/([a-z0-9\-]+)\.md", parent_section)

        members = []
        if isinstance(primary, str) and primary:
            members.append(primary)
        for s in sector_refs:
            if s not in members:
                members.append(s)

        entry = {
            "ticker": ticker,
            "coverage": coverage,
            "v3_count": int(direct_count) if isinstance(direct_count, int) else 0,
            "primary_sector": primary if isinstance(primary, str) else None,
        }
        for s in members:
            out.setdefault(s, []).append(entry)

    for arr in out.values():
        arr.sort(key=lambda x: -x["v3_count"])
    _sector_tickers_cache = out
    return out


# --------------------------------------------------- public API

def list_sectors_v3() -> list[dict]:
    """Sector list for the cockpit sidebar.

    Sorted by tweet_count desc; macro layer pinned at the end.
    """
    counts = _load_sector_index()
    sector_tk = _build_sector_tickers()
    out: list[dict] = []
    for key, meta in SECTOR_DISPLAY.items():
        tickers = sector_tk.get(key) or []
        out.append({
            "key": key,
            "label": meta["label"],
            "eyebrow": meta["eyebrow"],
            "layer": meta["layer"],
            "short": meta.get("short", ""),
            "tweet_count": counts.get(key, 0),
            "ticker_count": len(tickers),
        })
    out.sort(key=lambda x: (x["layer"] == "macro", -x["tweet_count"]))
    return out


# ----------------------------------------------------------------
# Industry chain — hardcoded AI infrastructure L0->L5 chain.
# Sourced from lens-ai-infrastructure.md §1 (Frank's own production-chain
# taxonomy). Tickers chosen to overlap with cockpit's TICKER_ALIASES.
# ----------------------------------------------------------------

# Supply chain ordered upstream → downstream. The "物理底层 · 电力 / 能源股"
# layer was dropped after audit (Frank hasn't discussed VST / CEG / NEE etc.
# in this persona — chain now starts at 上游半导体).
# `covered`     : tickers Frank has v3 distillation playbooks for (full stance)
# `supplements` : same-industry tickers Frank has NOT deeply discussed
#                 (UI no longer renders these — kept for future Apply-chat flow)
AI_INFRA_CHAIN: list[dict] = [
    {
        "id": "L0",
        "label": "上游半导体",
        "stance": "设备 + 关键组件 · 卡脖子在迁移",
        "primary_question": "下一个瓶颈在哪个环节？",
        "covered": [
            "ASML", "TSM",
            "MU", "SNDK", "WDC", "STX",
            "AMD", "ARM", "INTC", "QCOM",
            "AVGO",
        ],
        "supplements": ["MRVL", "NXPI", "MCHP"],
        "subcategories": [
            {"name": "设备 · 代工", "tickers": ["ASML", "TSM"]},
            {"name": "存储 · HBM", "tickers": ["MU", "SNDK", "WDC", "STX"]},
            {"name": "CPU · GPU 衍生", "tickers": ["AMD", "ARM", "INTC", "QCOM"]},
            {"name": "ASIC · 光模块", "tickers": ["AVGO", "MRVL"]},
            {"name": "车规 · 工业芯", "tickers": ["NXPI", "MCHP"]},
        ],
        "rep_ticker": "MU",
    },
    {
        "id": "L1",
        "label": "算力整合",
        "stance": "产业链中间收租 · 赢家通吃",
        "primary_question": "他是不是不可替代的整合者？",
        "covered": ["NVDA"],
        "supplements": [],
        "subcategories": [],
        "rep_ticker": "NVDA",
    },
    {
        "id": "L2",
        "label": "数据中心 · 云",
        "stance": "重资产 capex 周期 · 看商业兑现",
        "primary_question": "营收 / Capex 比能撑住吗？",
        "covered": ["MSFT", "GOOGL", "AMZN", "META", "AAPL", "ORCL", "CRWV", "IBM"],
        "supplements": ["SNOW"],
        "subcategories": [
            {"name": "Mag4 + 苹果", "tickers": ["MSFT", "GOOGL", "AMZN", "META", "AAPL"]},
            {"name": "甲骨文 · 新云", "tickers": ["ORCL", "CRWV"]},
            {"name": "数据 · 企业 SaaS", "tickers": ["IBM", "SNOW"]},
        ],
        "rep_ticker": "MSFT",
    },
    {
        "id": "L3",
        "label": "应用 · Agent",
        "stance": "短期看不出最终赢家 · 他不下注",
        "primary_question": "有真实 token 消耗证据吗？",
        "covered": ["PLTR", "OPENAI", "ANTHROPIC", "XAI"],
        "supplements": [],
        "subcategories": [
            {"name": "AI 落地 / 政府", "tickers": ["PLTR"]},
            {"name": "基础模型厂商", "tickers": ["OPENAI", "ANTHROPIC", "XAI"]},
        ],
        "rep_ticker": "PLTR",
    },
    {
        "id": "L4",
        "label": "物理 AI",
        "stance": "下一个万亿赛道 · 但成熟度未到",
        "primary_question": "Robotaxi / 机器人能商业化吗？",
        "covered": ["TSLA"],
        "supplements": [],
        "subcategories": [],
        "rep_ticker": "TSLA",
    },
]


# Display names for supplement tickers (not in TICKER_ALIASES so we keep
# their company names locally for the UI mini-cards).
SUPPLEMENT_NAMES: dict[str, str] = {
    # AI 算力基建
    "MRVL": "Marvell",
    "NXPI": "NXP Semiconductors",
    "MCHP": "Microchip",
    "SNOW": "Snowflake",
    # 加密 · 链上金融
    "SCHW": "Charles Schwab",
    "IBKR": "Interactive Brokers",
    # 国防与太空
    "RTX": "RTX (Raytheon)",
    "MRCY": "Mercury Systems",
}

CRYPTO_CHAIN: list[dict] = [
    {
        "id": "L0",
        "label": "底层网络 · 公链",
        "stance": "另一条数字基础设施 · 网络效应驱动",
        "primary_question": "立法是否清晰？哪条链有真实采用？",
        "covered": ["BTC", "ETH", "SOL"],
        "supplements": [],
        "subcategories": [],
        "rep_ticker": None,
    },
    {
        "id": "L1",
        "label": "稳定币基建",
        "stance": "进合规金融的钥匙 · USDC 发行量增速是核心",
        "primary_question": "稳定币能否进入主流支付？",
        "covered": ["CRCL", "USDC", "USDT"],
        "supplements": [],
        "subcategories": [],
        "rep_ticker": "CRCL",
    },
    {
        "id": "L2",
        "label": "合规交易所",
        "stance": "最合规 = 最大护城河",
        "primary_question": "能否成为加密世界的纳斯达克？",
        "covered": ["COIN"],
        "supplements": [],
        "subcategories": [],
        "rep_ticker": "COIN",
    },
    {
        "id": "L3",
        "label": "加密原生公司",
        "stance": "Bitcoin treasury · 矿企 · 链上原生",
        "primary_question": "公司价值 = BTC 持仓溢价吗？",
        "covered": ["MSTR", "BMNR"],
        "supplements": [],
        "subcategories": [],
        "rep_ticker": "MSTR",
    },
    {
        "id": "L4",
        "label": "散户金融入口",
        "stance": "Z 世代代际更替的主要承载",
        "primary_question": "经纪商能否吃下迁徙散户？",
        "covered": ["HOOD", "FUTU", "TIGR"],
        "supplements": ["SCHW", "IBKR"],
        "subcategories": [
            {"name": "新势力 · 加密敞口", "tickers": ["HOOD"]},
            {"name": "亚太 · 中概", "tickers": ["FUTU", "TIGR"]},
            {"name": "传统 · 老牌", "tickers": ["SCHW", "IBKR"]},
        ],
        "rep_ticker": "HOOD",
    },
]


DEFENSE_CHAIN: list[dict] = [
    {
        "id": "L0",
        "label": "太空发射 · 商业航天",
        "stance": "下一个万亿赛道 · SpaceX IPO 是 catalyst",
        "primary_question": "商业航天能否形成规模化？",
        # SPACEX 私募,无报价 — UI 处理 priceable=False 时显示 "无报价"
        "covered": ["SPACEX", "RKLB", "ASTS", "LUNR"],
        "supplements": [],
        "subcategories": [],
        "rep_ticker": "RKLB",
    },
    {
        "id": "L1",
        "label": "卫星 · 通信网络",
        "stance": "国防 + 商业双重敞口",
        "primary_question": "星座 / 物联网卫星能扩张吗？",
        "covered": ["IRDM", "VSAT", "SATS", "BKSY", "PL", "RDW", "SPIR"],
        "supplements": [],
        "subcategories": [
            {"name": "低轨星座", "tickers": ["IRDM", "BKSY", "SPIR"]},
            {"name": "通信卫星", "tickers": ["VSAT", "SATS"]},
            {"name": "对地观测", "tickers": ["PL", "RDW"]},
        ],
        "rep_ticker": "IRDM",
    },
    {
        "id": "L2",
        "label": "武器 · 无人 · 子系统",
        "stance": "细分链 · 受益于具体冲突",
        "primary_question": "他们受益于哪个地缘事件？",
        "covered": ["AVAV", "KTOS", "BWXT", "LHX", "TDY"],
        "supplements": ["MRCY"],
        "subcategories": [
            {"name": "无人 · 反无人", "tickers": ["AVAV", "KTOS"]},
            {"name": "核 · 能源", "tickers": ["BWXT"]},
            {"name": "电子战 · 通信", "tickers": ["LHX", "TDY", "MRCY"]},
        ],
        "rep_ticker": "LHX",
    },
    {
        "id": "L3",
        "label": "大型承包商",
        "stance": "政府订单可见度 · 长期合约护城河",
        "primary_question": "订单簿是否在加速？",
        "covered": ["LMT", "NOC", "GD", "HII", "BA"],
        "supplements": ["RTX"],
        "subcategories": [],
        "rep_ticker": "LMT",
    },
    {
        "id": "L4",
        "label": "AI · 情报 · 软件",
        "stance": "政府软件订单一家独大 · 替代成本高",
        "primary_question": "PLTR 业绩增速能撑住估值吗？",
        "covered": ["PLTR"],
        "supplements": [],
        "subcategories": [],
        "rep_ticker": "PLTR",
    },
]


INDUSTRY_CHAIN_REGISTRY: dict[str, dict] = {
    "ai-infrastructure": {
        "label": "AI 算力基建产业链",
        "eyebrow": "AI INFRASTRUCTURE",
        "intro": "Frank 把 AI 算力产业拆成 5 层 · 上游半导体 → 算力整合 → 数据中心 → 应用 → 物理 AI",
        "layers": AI_INFRA_CHAIN,
    },
    "crypto-stablecoin-rwa": {
        "label": "加密 · 链上金融产业链",
        "eyebrow": "CRYPTO & FINTECH",
        "intro": "Frank 的加密视角 · 只看进合规金融基建的部分 · 含散户金融入口",
        "layers": CRYPTO_CHAIN,
    },
    "defense-and-space": {
        "label": "国防与太空产业链",
        "eyebrow": "DEFENSE & SPACE",
        "intro": "强人政治时代的硬资产敞口 · 从太空发射到政府软件",
        "layers": DEFENSE_CHAIN,
    },
}


# Cache: ticker -> 1-line stance string (parsed from ticker/TICKER.md)
_ticker_stance_cache: Optional[dict[str, str]] = None


def _build_ticker_stances() -> dict[str, str]:
    """Walk ticker/*.md, parse the first sentence of '## 博主如何定位' as the
    1-line stance for chain mini-cards.
    """
    global _ticker_stance_cache
    if _ticker_stance_cache is not None:
        return _ticker_stance_cache

    out: dict[str, str] = {}
    ticker_dir = V3_ROOT / "ticker"
    if not ticker_dir.is_dir():
        _ticker_stance_cache = out
        return out

    for md in sorted(ticker_dir.glob("*.md")):
        try:
            raw = md.read_text(encoding="utf-8")
        except OSError:
            continue
        body = _strip_frontmatter(raw)
        sections = _split_h2(body)
        location = _fuzzy_section(sections, "博主如何定位", "定位")
        if not location:
            location = _fuzzy_section(sections, "核心问题")
        stance = _first_meaningful_line(location)
        if stance:
            out[md.stem.upper()] = stance
    _ticker_stance_cache = out
    return out


def _first_meaningful_line(text: str, max_len: int = 140) -> str:
    """Pick the first paragraph/quote line, strip markup, cap length."""
    for line in text.split("\n"):
        s = line.strip()
        if not s:
            continue
        if s.startswith("#"):
            continue
        # Strip blockquote markers
        if s.startswith("> "):
            s = s[2:].strip()
        elif s.startswith(">"):
            s = s[1:].strip()
        # Strip bullet markers
        if s.startswith("- ") or s.startswith("* "):
            s = s[2:].strip()
        # Strip bold/italic markup
        s = _STAR_RE.sub(r"\1", s)
        if not s:
            continue
        if len(s) > max_len:
            s = s[:max_len].rstrip() + "…"
        return s
    return ""


def get_ticker_stance(ticker: str) -> str:
    return _build_ticker_stances().get(ticker.upper(), "")


# ----------------------------------------------------------------
# Ticker summary — { stance, stance_label, thesis, key_logic }
# Surfaces a 1-line evaluation + core logic for the cockpit cards.
# Heuristics:
#   - thesis      : bold quote in "## 核心问题" (fallback: first sentence)
#   - key_logic   : first non-empty line of "## 博主如何定位"
#   - stance      : derived from coverage + keyword presence in body
# ----------------------------------------------------------------

# Hand overrides for tickers where the heuristic gets stance wrong.
# Keep tight — only entries proven wrong by the parser.
TICKER_SUMMARY_OVERRIDES: dict[str, dict] = {
    # BB: parser would call this 'watch' from 困境反转 — confirm
    # NVDA/HOOD/MU all parse as bull_strong via 强信念 keyword — fine
}


# Manually-curated summaries for tickers WITHOUT a v3 playbook md.
# These are written from reading Frank's actual tweets — they describe
# how he's historically discussed the ticker, not a full playbook.
# Coverage = 'low' for all (since no formal distillation).
# Used by _build_ticker_summaries() to inject as synthetic entries.
TICKER_MANUAL_SUMMARIES: dict[str, dict] = {
    # ====================== Mag4 / AI 巨头 ======================
    "AAPL": {
        "coverage": "low",
        "thesis": "Mag4 里 AI 战略最不显眼的一家",
        "key_logic": "Frank 提 AAPL 主要在 Mag4 对比语境里，AI 战略相比 GOOGL/MSFT/META 不够清晰，没专门下注的判断。",
        "bull_conditions": [],
        "bear_triggers": [],
        "veto": [],
        "falsifiers": [],
        "signals_watched": ["Mag4 财报季云收入对比", "AI 战略落地速度"],
        "misreadings": [],
        "core_questions": [],
    },
    # ====================== 上游半导体 ======================
    "ASML": {
        "coverage": "low",
        "thesis": "「卖铲子」三巨头之一 · 半导体产业链最深处的卡脖子环节",
        "key_logic": "全球唯一的顶级光刻机厂；和 TSMC、NVDA 一起被 Frank 形容为「在淘金热里疯狂印钱」的产业链中段收租者。",
        "bull_conditions": [
            "季报全线超预期 + 全年指引上修",
            "存储客户 2026 年产能售罄信号",
            "EUV 出货量加速",
        ],
        "bear_triggers": [
            "二季度指引偏弱（典型业绩超预期但指引弱的剧本）",
            "中美光刻机谈判松动 → 中国国产替代加速",
        ],
        "veto": [],
        "falsifiers": [],
        "signals_watched": ["全年净销售指引区间", "非EUV业务订单", "中美出口管制变化"],
        "misreadings": [],
        "core_questions": [],
    },
    # ====================== 加密 · 底层 ======================
    "BTC": {
        "coverage": "low",
        "thesis": "美元流动性的链上映射 · Frank 把它当宏观高频信号、不是单独交易标的",
        "key_logic": "Frank 提 BTC 多在流动性 / Fed / 稳定币 / Jane Street 做市等宏观语境里；他看 BTC 是为了倒推美元流动性水位，不是为了交易 BTC 本身。",
        "bull_conditions": [
            "美联储扩表 / 银行准备金回到充裕区间",
            "BTC ETF 持续净流入 + 美元流动性向链上漏出",
            "立法清晰（GENIUS / 清晰法案）落地",
        ],
        "bear_triggers": [
            "Jane Street 等做市商在美股开盘后系统性砸盘的高频模式",
            "美元流动性收紧（银行准备金跌破临界）",
        ],
        "veto": [],
        "falsifiers": [],
        "signals_watched": ["BTC ETF 净流入", "美元流动性(银行准备金/TGA/RRP)", "稳定币发行量"],
        "misreadings": [],
        "core_questions": [],
    },
    "ETH": {
        "coverage": "low",
        "thesis": "稳定币 + DeFi 的底层结算层",
        "key_logic": "Frank 关注 ETH 主要是因为 USDC 增量大部分跑在 Ethereum 上，是稳定币基建价值传导的承载链；DeFi 总锁仓也以以太坊为主。",
        "bull_conditions": ["稳定币总市值持续扩张", "DeFi TVL 复苏"],
        "bear_triggers": ["L2 / Solana 等竞品分流", "稳定币向多链分散"],
        "veto": [],
        "falsifiers": [],
        "signals_watched": ["ETH 链上 USDC 占比", "Gas 费 / DEX 交易量"],
        "misreadings": [],
        "core_questions": [],
    },
    "SOL": {
        "coverage": "low",
        "thesis": "散户币 + 高频交易友好链 · 绑定 HOOD / 稳定币交易增长",
        "key_logic": "Frank 视 SOL 为流动性体制的另一面 — 散户交易体验最好的链；与 Robinhood 的加密扩展、链上美股代币化等新需求绑定。",
        "bull_conditions": ["Robinhood 等经纪商扩展 SOL 支持", "链上美股代币化业务"],
        "bear_triggers": ["监管收紧 / 高频抛压风险"],
        "veto": [],
        "falsifiers": [],
        "signals_watched": ["DEX 交易量", "SOL ETF 进展"],
        "misreadings": [],
        "core_questions": [],
    },
    "USDC": {
        "coverage": "low",
        "thesis": "合规稳定币龙头 · CRCL 估值的核心驱动",
        "key_logic": "USDC 发行量同比 80%+ 是 CRCL 看多逻辑的核心信号；Fed 理事米兰公开承认稳定币正创造「影子货币市场」、压低中性利率 r* — 宏观意义大于单一交易品。",
        "bull_conditions": [
            "USDC 发行量增速维持 50%+",
            "立法清晰（GENIUS 法案）落地",
            "Coinbase / 贝莱德 / 主流支付场景接入扩大",
        ],
        "bear_triggers": [
            "USDC 发行量增速跌破 50%",
            "利率大幅下行 → 利息收入断崖（CRCL 商业模式核心是稳定币储备的利息收入）",
            "大行自发稳定币挤占市场",
        ],
        "veto": [],
        "falsifiers": [],
        "signals_watched": ["USDC 发行量同比 / 环比", "稳定币总市值", "立法节奏"],
        "misreadings": [],
        "core_questions": [],
    },
    "USDT": {
        "coverage": "low",
        "thesis": "龙一稳定币但合规性弱 · Frank 偏好 USDC",
        "key_logic": "USDT 是稳定币市场基本盘，但 Frank 在合规标的选择上明确偏好 CRCL/USDC；USDT 更多在新兴市场和加密原生场景。",
        "bull_conditions": [],
        "bear_triggers": ["合规友好替代品（USDC）扩张挤压份额"],
        "veto": [],
        "falsifiers": [],
        "signals_watched": ["USDT vs USDC 发行量对比"],
        "misreadings": [],
        "core_questions": [],
    },
    # ====================== 私募 AI 公司 ======================
    "OPENAI": {
        "coverage": "low",
        "thesis": "AI 应用层目前最强的玩家 · 但 Frank 明确不押注应用层最终赢家",
        "key_logic": "Frank 频繁引用 OpenAI 的 token 消耗数据（每分钟 150 亿 token，半年内增长 2.5 倍）作为 AI 商业化的硬证据；但他对应用层估值/赢家不下注，OpenAI 在他眼里是「最好的需求端证据，不是投资标的」。",
        "bull_conditions": [
            "Token 消耗增速持续",
            "API 业务现金流转正",
            "企业 GenAI 渗透率提升",
        ],
        "bear_triggers": [
            "估值已飙到 5000 亿+，烧钱节奏未刹车",
            "应用层赢家竞争加剧（Anthropic / Google / xAI 交替领先）",
        ],
        "veto": [
            "押注 OpenAI 一家通吃应用层",
            "押注私募估值持续扩张",
        ],
        "falsifiers": [],
        "signals_watched": ["OpenAI 每分钟 token 处理量", "API 收入 / 烧钱节奏", "企业付费用户数"],
        "misreadings": [],
        "core_questions": [],
    },
    "ANTHROPIC": {
        "coverage": "low",
        "thesis": "AI 应用层与 OpenAI 交替领先的另一极 · 企业 / 安全场景突出",
        "key_logic": "Anthropic 的 Claude/Mythos 在企业 + 网络安全场景被 Frank 视为可能超越 OpenAI 的一极；Mythos 模型甚至引起美联储紧急召见六大行 CEO（系统性安全风险等级）。同 OpenAI，Frank 不押注应用层赢家。",
        "bull_conditions": ["企业付费扩张", "安全 / Agent 场景突破"],
        "bear_triggers": ["与 OpenAI / Google / xAI 的赢家竞争未明"],
        "veto": ["押注 Anthropic 一家通吃"],
        "falsifiers": [],
        "signals_watched": ["Claude 企业付费 ARR", "Token 处理量"],
        "misreadings": [],
        "core_questions": [],
    },
    "SPACEX": {
        "coverage": "low",
        "thesis": "下一个万亿赛道（太空经济）的支柱企业 · 2026 上市临近",
        "key_logic": "Frank 视 SpaceX IPO 为太空经济板块整体抬升的 catalyst；估值半年从 4000 亿 → 8000 亿 → 1.25 万亿；上市后会带动 RKLB / ASTS / LUNR 等卫星 / 火箭股的关注度和估值。",
        "bull_conditions": [
            "SpaceX IPO 时间表确认（预期 2026）",
            "Starlink 大规模盈利、发射业务稳定",
            "收购 xAI 后形成「太空 + AI」超级生态",
        ],
        "bear_triggers": [
            "IPO 后估值兑现压力",
            "搭便车股票（无政府订单 / 无技术验证的太空概念股）泡沫破裂",
        ],
        "veto": [],
        "falsifiers": [],
        "signals_watched": ["SpaceX 估值轨迹", "Starlink 用户数 / ARPU", "猎鹰 / 星舰发射成功率"],
        "misreadings": [],
        "core_questions": [],
    },
    "XAI": {
        "coverage": "low",
        "thesis": "老马生态 · 工程奇迹的代表 · 已被并入 SpaceX",
        "key_logic": "Colossus 2 是全球首个吉瓦级 AI 训练集群（55 万张 GB200/300、用电超旧金山全市峰值），Frank 视为老马执行力的标志；2026-02 xAI 并入 SpaceX，组合估值 1.25 万亿。",
        "bull_conditions": ["Grok 模型能力追赶 / 超越头部"],
        "bear_triggers": ["xAI 月烧 10 亿美元的现金流压力（虽已并入 SpaceX 缓解）"],
        "veto": [],
        "falsifiers": [],
        "signals_watched": ["Colossus 2/3 算力规模", "Grok 用户数 / Token 消耗"],
        "misreadings": [],
        "core_questions": [],
    },
    # ====================== 国防 · 单一推文受益链 ======================
    # Frank 在「委内瑞拉行动 / 强人政治国防受益链」一条推文里点名这些
    # ticker，没有专门展开但确认在他的国防 lens 内。
    "LMT": {
        "coverage": "low",
        "thesis": "国防大型承包商 · 政府订单长合约护城河",
        "key_logic": "Frank 在地缘紧张 / 国家安全战略受益链里点名洛克希德，作为长合约 + 政府订单可见度的典型代表。",
        "bull_conditions": ["国防订单簿加速", "北约 / 盟友采购增长"],
        "bear_triggers": [],
        "veto": [],
        "falsifiers": [],
        "signals_watched": ["美国国防部预算", "政府订单簿"],
        "misreadings": [],
        "core_questions": [],
    },
    "NOC": {
        "coverage": "low",
        "thesis": "国防大型承包商 · 战略导弹 / 太空业务敞口",
        "key_logic": "诺斯罗普在 Frank 的太空 + 国防交叉链里出现；与 LMT 同类，长合约护城河 + 政府订单可见度。",
        "bull_conditions": ["美国国家安全战略报告升级"],
        "bear_triggers": [],
        "veto": [],
        "falsifiers": [],
        "signals_watched": ["B-21 / 太空发射合同"],
        "misreadings": [],
        "core_questions": [],
    },
    "GD": {
        "coverage": "low",
        "thesis": "地面装备 + 海军舰船受益链",
        "key_logic": "Frank 在委内瑞拉行动受益链里点名通用动力，对应地面 / 海军装备这条细分链。",
        "bull_conditions": [],
        "bear_triggers": [],
        "veto": [],
        "falsifiers": [],
        "signals_watched": ["海军 / 陆军合同进度"],
        "misreadings": [],
        "core_questions": [],
    },
    "HII": {
        "coverage": "low",
        "thesis": "航母 / 海军舰船建造 · 强人政治时代的硬资产",
        "key_logic": "Frank 在「南方之矛」加勒比海行动受益链里把 HII（亨廷顿英格尔斯）放在前位，对应航母 / 海军舰船建造这一稀缺产能。",
        "bull_conditions": [],
        "bear_triggers": [],
        "veto": [],
        "falsifiers": [],
        "signals_watched": ["美国海军预算 / 航母订单"],
        "misreadings": [],
        "core_questions": [],
    },
    "KTOS": {
        "coverage": "low",
        "thesis": "无人 / 反无人系统 · AI 时代的国防新链",
        "key_logic": "Frank 把 KTOS 和 AVAV 放在「无人系统」细分链里 — 现代战争形态下增长最快的国防子赛道。",
        "bull_conditions": ["无人系统订单加速"],
        "bear_triggers": [],
        "veto": [],
        "falsifiers": [],
        "signals_watched": ["无人机 / 反无人订单"],
        "misreadings": [],
        "core_questions": [],
    },
    "AVAV": {
        "coverage": "low",
        "thesis": "无人系统龙头 · 国防 AI 化的关键受益者",
        "key_logic": "Frank 在国防 AI 化的语境里把 AVAV（AeroVironment）和 KTOS 一起列为无人系统细分链的代表。",
        "bull_conditions": ["小型无人 / 蜂群订单"],
        "bear_triggers": [],
        "veto": [],
        "falsifiers": [],
        "signals_watched": ["军用无人订单 / 民用无人扩张"],
        "misreadings": [],
        "core_questions": [],
    },
    "BWXT": {
        "coverage": "low",
        "thesis": "核 · 海军核动力 · 国防核技术受益链",
        "key_logic": "Frank 把 BWXT 放在「核能 + 国防」交叉链里 — 海军核动力 + 民用核电的双重敞口。",
        "bull_conditions": ["核电复兴 + 海军核动力订单"],
        "bear_triggers": [],
        "veto": [],
        "falsifiers": [],
        "signals_watched": ["美国海军核动力舰船预算", "民用核电项目"],
        "misreadings": [],
        "core_questions": [],
    },
    "IRDM": {
        "coverage": "low",
        "thesis": "铱星 · 低轨卫星通信网络 · 国防 + 商业双重敞口",
        "key_logic": "Frank 在太空经济链里把 IRDM 作为已规模化的低轨卫星运营商代表 — 与 Starlink 同类但已上市可投资。",
        "bull_conditions": ["卫星通信物联网渗透"],
        "bear_triggers": [],
        "veto": [],
        "falsifiers": [],
        "signals_watched": ["卫星签约客户数"],
        "misreadings": [],
        "core_questions": [],
    },
}


_THESIS_BOLD_RE = re.compile(r'"\s*\*\*([^*"]+?)\*\*\s*"')
_THESIS_BOLD_FALLBACK_RE = re.compile(r'\*\*([^*]+?)\*\*')


def _extract_thesis(body: str) -> str:
    sections = _split_h2(body)
    core_q = _fuzzy_section(sections, "核心问题")
    if not core_q:
        return ""
    m = _THESIS_BOLD_RE.search(core_q)
    if m:
        return m.group(1).strip()
    m = _THESIS_BOLD_FALLBACK_RE.search(core_q)
    if m:
        return m.group(1).strip()
    return _first_meaningful_line(core_q, max_len=100)


def _extract_key_logic(body: str) -> str:
    sections = _split_h2(body)
    location = _fuzzy_section(sections, "博主如何定位", "定位")
    if not location:
        return ""
    return _first_meaningful_line(location, max_len=160)


def _derive_stance(body: str, coverage: str) -> tuple[str, str]:
    """Returns (stance_key, stance_label_zh).

    Priority order (highest first):
      1. Strong conviction markers (强信念 / 核心仓 / 长持 / 重仓)
      2. Turnaround speculative (困境反转)
      3. Decision-framework analysis (升级 vs 减风险)
      4. Non-bet keyword (low priority — often false positive when Frank
         discusses category-level avoidance in a ticker's body)
      5. Coverage fallback
    """
    if not body:
        return ("unknown", "")

    # 1. Strong conviction wins
    if "强信念" in body or "核心仓" in body or "长持" in body or "重仓" in body:
        return ("bull_strong", "看多 · 核心仓")

    # 2. Turnaround
    if "困境反转" in body:
        return ("watch", "观察 · 困境反转")

    # 3. Decision-framework structure
    sections = _split_h2(body)
    decision = _fuzzy_section(sections, "决策框架")
    decision_h3 = _split_h3(decision) if decision else {}
    has_upgrade = any(
        "升级" in name or "看多" in name for name in decision_h3
    )
    has_reduce = any(
        "减风险" in name or "看空" in name for name in decision_h3
    )

    if has_upgrade and has_reduce:
        return ("bull_cautious", "谨慎看多")
    if has_upgrade:
        if coverage == "high":
            return ("bull", "看多")
        return ("bull", "看多 · 中线")

    # 4. Non-bet keyword (after decision check, so a ticker with bull conditions
    # isn't mislabeled because its body discusses category-level non-bets)
    if ("不下注" in body or "不押注" in body) and coverage in ("low", ""):
        return ("no_bet", "不下注")

    # 5. Fallback by coverage
    if coverage == "high":
        return ("bull", "看多")
    if coverage == "medium":
        return ("bull", "看多 · 中线")
    return ("watch", "观察")


_summary_cache: Optional[dict[str, dict]] = None


def _find_chain_position(ticker: str) -> Optional[str]:
    """Locate `ticker` in any registered industry chain and return a human
    label like 「AI 算力基建 · L2 算力整合」. None if not in any chain.
    """
    for board_key, board in INDUSTRY_CHAIN_REGISTRY.items():
        for layer in board.get("layers") or []:
            in_covered = ticker in (layer.get("covered") or [])
            in_supps = ticker in (layer.get("supplements") or [])
            if in_covered or in_supps:
                board_label = board.get("label") or board_key
                # Strip the trailing 「产业链」/「地图」 suffix for compact display
                board_label = board_label.replace("产业链", "").replace("地图", "").strip()
                return f"{board_label} · {layer['id']} {layer['label']}"
    return None


def _build_ticker_summaries() -> dict[str, dict]:
    """Parse all v3 ticker md files. Returns ticker -> extended summary:
    { stance, stance_label, thesis, key_logic, coverage, position,
      core_questions[], signals_watched[],
      bull_conditions[], bear_triggers[], veto[], falsifiers[],
      misreadings[] }
    """
    global _summary_cache
    if _summary_cache is not None:
        return _summary_cache

    out: dict[str, dict] = {}
    ticker_dir = V3_ROOT / "ticker"
    if not ticker_dir.is_dir():
        _summary_cache = out
        return out

    for md in sorted(ticker_dir.glob("*.md")):
        try:
            raw = md.read_text(encoding="utf-8")
        except OSError:
            continue
        ticker = md.stem.upper()
        fm = _parse_frontmatter(raw)
        body = _strip_frontmatter(raw)
        coverage = str(fm.get("coverage") or "")

        sections = _split_h2(body)

        # Brief fields
        thesis = _extract_thesis(body)
        key_logic = _extract_key_logic(body)
        stance_key, stance_label = _derive_stance(body, coverage)

        # Extended: core questions
        core_questions = _extract_numbered(_fuzzy_section(sections, "核心问题"))

        # Extended: signals watched (he looks at what data) — flatten H3 subs
        signals_sec = _fuzzy_section(
            sections, "他看什么具体信息", "他看什么", "看什么"
        )
        signals_watched: list[str] = []
        signals_h3 = _split_h3(signals_sec) if signals_sec else {}
        if signals_h3:
            for h3_name, h3_body in signals_h3.items():
                if "引用源" in h3_name:
                    continue
                for b in _extract_bullets(h3_body):
                    if b not in signals_watched:
                        signals_watched.append(b)
        if not signals_watched:
            signals_watched = _extract_bullets(signals_sec)

        # Extended: decision framework
        decision_sec = _fuzzy_section(sections, "决策框架")
        decision_h3 = _split_h3(decision_sec) if decision_sec else {}
        bull_conditions: list[str] = []
        bear_triggers: list[str] = []
        veto: list[str] = []
        falsifiers: list[str] = []
        for h3_name, h3_body in decision_h3.items():
            items = _extract_numbered(h3_body) or _extract_bullets(h3_body)
            if "升级" in h3_name or "看多" in h3_name:
                bull_conditions = items
            elif "减风险" in h3_name or "看空" in h3_name or "不追高" in h3_name:
                bear_triggers = items
            elif "Veto" in h3_name or "禁忌" in h3_name:
                veto = items
            elif "可证伪" in h3_name:
                falsifiers = items

        # Extended: misreadings
        misreadings = _extract_numbered(
            _fuzzy_section(sections, "常见误读", "误读")
        )

        position = _find_chain_position(ticker)

        summary = {
            "stance": stance_key,
            "stance_label": stance_label,
            "thesis": thesis,
            "key_logic": key_logic,
            "coverage": coverage,
            "position": position,  # e.g. "AI 算力基建 · L2 算力整合"
            "core_questions": core_questions,
            "signals_watched": signals_watched,
            "bull_conditions": bull_conditions,
            "bear_triggers": bear_triggers,
            "veto": veto,
            "falsifiers": falsifiers,
            "misreadings": misreadings,
        }

        override = TICKER_SUMMARY_OVERRIDES.get(ticker, {})
        summary.update(override)

        out[ticker] = summary

    # Inject manually-curated summaries for tickers WITHOUT a v3 playbook.
    # These read Frank's actual tweets and capture his historical view, but
    # don't claim playbook-grade depth. coverage stays 'low'.
    for ticker, manual in TICKER_MANUAL_SUMMARIES.items():
        if ticker in out:
            continue  # v3 md takes precedence if present
        body_for_stance = manual.get("key_logic", "") + " " + manual.get("thesis", "")
        stance_key, stance_label = _derive_stance(body_for_stance, manual.get("coverage", "low"))
        synthetic = {
            "stance": stance_key,
            "stance_label": stance_label,
            "thesis": manual.get("thesis", ""),
            "key_logic": manual.get("key_logic", ""),
            "coverage": manual.get("coverage", "low"),
            "position": _find_chain_position(ticker),
            "core_questions": manual.get("core_questions") or [],
            "signals_watched": manual.get("signals_watched") or [],
            "bull_conditions": manual.get("bull_conditions") or [],
            "bear_triggers": manual.get("bear_triggers") or [],
            "veto": manual.get("veto") or [],
            "falsifiers": manual.get("falsifiers") or [],
            "misreadings": manual.get("misreadings") or [],
        }
        out[ticker] = synthetic

    _summary_cache = out
    return out


def get_ticker_summary(ticker: str) -> Optional[dict]:
    """Return summary dict for a ticker, or None if not in v3."""
    return _build_ticker_summaries().get(ticker.upper())


def list_industry_chains() -> list[str]:
    return list(INDUSTRY_CHAIN_REGISTRY.keys())


def get_industry_chain_definition(key: str) -> Optional[dict]:
    """Return the static chain config for a board, or None."""
    return INDUSTRY_CHAIN_REGISTRY.get(key)


# ----------------------------------------------------------------

def get_sector_v3(key: str) -> Optional[dict]:
    """Detailed sector payload with parsed structured sections."""
    meta = SECTOR_DISPLAY.get(key)
    if meta is None:
        return None
    raw = _read(meta["path"])
    if raw is None:
        return None
    body = _strip_frontmatter(raw)
    sections = _split_h2(body)

    # 核心问题 — numbered list
    core_questions = _extract_numbered(
        _fuzzy_section(sections, "核心问题")
    )

    # 他看什么信息 — bullets, possibly nested under H3 sub-sections.
    signals_section = _fuzzy_section(sections, "他看什么", "看什么信息")
    signals: list[str] = []
    h3s = _split_h3(signals_section)
    if h3s:
        for h3_name, h3_body in h3s.items():
            if "引用源" in h3_name:
                continue  # skip "sources he cites" sub-section
            for b in _extract_bullets(h3_body):
                if b not in signals:
                    signals.append(b)
    if not signals:
        signals = _extract_bullets(signals_section)

    # 决策框架 — multiple H3 sub-sections
    decision = _fuzzy_section(sections, "决策框架")
    decision_h3 = _split_h3(decision)
    bull_conditions: list[str] = []
    bear_triggers: list[str] = []
    veto: list[str] = []
    falsifiers: list[str] = []
    for h3_name, h3_body in decision_h3.items():
        items = _extract_numbered(h3_body) or _extract_bullets(h3_body)
        if "看多" in h3_name:
            bull_conditions = items
        elif "看空" in h3_name:
            bear_triggers = items
        elif "Veto" in h3_name or "禁忌" in h3_name:
            veto = items
        elif "可证伪" in h3_name:
            falsifiers = items

    # 常见误读 — numbered list
    misreadings = _extract_numbered(
        _fuzzy_section(sections, "常见误读", "误读")
    )

    # Evidence Map → ordered tweet_ids
    evidence = _fuzzy_section(sections, "Evidence Map", "Evidence")
    rep_tweet_ids = _extract_tweet_ids(evidence)

    # Tickers in this sector
    sector_tk = _build_sector_tickers()
    tickers = sector_tk.get(key) or []

    return {
        "key": key,
        "label": meta["label"],
        "eyebrow": meta["eyebrow"],
        "layer": meta["layer"],
        "short": meta.get("short", ""),
        "tweet_count": _load_sector_index().get(key, 0),
        "core_questions": core_questions,
        "signals": signals,
        "bull_conditions": bull_conditions,
        "bear_triggers": bear_triggers,
        "veto": veto,
        "falsifiers": falsifiers,
        "misreadings": misreadings,
        "tickers": tickers,
        "rep_tweet_ids": rep_tweet_ids,
        "full_body": body,
    }
