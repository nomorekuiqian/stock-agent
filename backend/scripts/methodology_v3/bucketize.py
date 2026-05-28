"""
Bucket assignment for qinbafrank v3 skill distillation.

Pure rule-based — NO LLM calls. Augments the existing enrichment with
Chinese alias matching (the current enrichment misses GOOGL / MSFT / AMZN
/ ORCL / MSTR because qinbafrank writes them in Chinese: 谷歌/微软/亚马逊/
甲骨文/微策略). Also re-buckets sectors into the v3 taxonomy.

Produces three indices under evidence/:
  ticker-index.json   ticker -> {count, tweet_ids[]}
  sector-index.json   sector -> {count, tweet_ids[]}
  bucket-summary.json overall stats + macro/core flagging

Run:
    cd backend && source venv/bin/activate
    python -m app.features.twitter.methodology_v3.bucketize
"""

from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from pathlib import Path

# Production-tracked dir: small indices that the cockpit reads at runtime.
EVIDENCE_DIR = (
    Path(__file__).resolve().parents[2]
    / "app" / "features" / "twitter"
    / "methodologies" / "_drafts"
    / "qinbafrank-skill-v3" / "evidence"
)
# Gitignored dir: large jsonl corpora + per-slice outputs (re-generatable).
ARTIFACTS_EVIDENCE_DIR = (
    Path(__file__).resolve().parents[2]
    / "app" / "features" / "twitter"
    / "_distillation_artifacts"
    / "qinbafrank-skill-v3" / "evidence"
)


# Ticker aliases — combines cockpit.py's curated dict with extras discovered
# in the corpus. CJK aliases match anywhere; ASCII aliases match on word
# boundaries (case-sensitive) to avoid false positives ("ARM" the ticker vs
# "arm" the noun, "META" vs "metaverse").
TICKER_ALIASES: dict[str, list[str]] = {
    # AI 算力底座
    "NVDA": ["英伟达", "Nvidia", "NVDA"],
    "TSM": ["台积电", "台积", "TSMC", "TSM"],
    "ASML": ["阿斯麦", "ASML"],
    # HBM / 半导体 / 内存
    "MU": ["美光", "Micron", "MU"],
    "AVGO": ["博通", "Broadcom", "AVGO"],
    "AMD": ["超微", "AMD"],
    "INTC": ["英特尔", "Intel", "INTC"],
    "ARM": ["ARM"],
    "QCOM": ["高通", "Qualcomm", "QCOM"],
    "SNDK": ["闪迪", "SanDisk", "SNDK"],
    "LITE": ["Lumentum", "LITE"],
    "NVTS": ["Navitas", "NVTS"],
    "ON": ["安森美", "Onsemi", "ONSemi"],
    # Mag / 数据中心 / 新云
    "ORCL": ["甲骨文", "Oracle", "ORCL"],
    "MSFT": ["微软", "Microsoft", "MSFT"],
    "GOOGL": ["谷歌", "Alphabet", "GOOGL", "GOOG"],
    "AMZN": ["亚马逊", "Amazon", "AMZN"],
    "META": ["脸书", "Meta", "FB"],
    "CRWV": ["CoreWeave", "CRWV"],
    "NBIS": ["Nebius", "NBIS"],
    "IBM": ["IBM"],
    # 加密 / 链上金融
    "CRCL": ["Circle", "CRCL"],
    "COIN": ["Coinbase", "COIN"],
    "HOOD": ["罗宾汉", "Robinhood", "HOOD"],
    "MSTR": ["微策略", "MicroStrategy", "MSTR"],
    "BMNR": ["BMNR"],
    "FUTU": ["富途", "FUTU"],
    "TIGR": ["老虎证券", "TIGR"],
    # 太空 / 国防
    "RKLB": ["Rocket Lab", "RKLB"],
    "ASTS": ["AST SpaceMobile", "ASTS"],
    "LUNR": ["Intuitive Machines", "LUNR"],
    "PLTR": ["Palantir", "PLTR"],
    "LHX": ["L3Harris", "LHX"],
    "BA": ["波音", "Boeing"],
    # 安全
    "CRWD": ["CrowdStrike", "CRWD"],
    # 其他
    "TSLA": ["特斯拉", "Tesla", "TSLA"],
    "NOK": ["诺基亚", "Nokia", "NOK"],
    "BB": ["BlackBerry", "黑莓"],
}


# Sector keyword buckets — v3 taxonomy. A tweet can land in multiple sectors.
SECTOR_KEYWORDS: dict[str, list[str]] = {
    "ai-infrastructure": [
        "AI 算力", "AI算力", "算力", "GPU", "HBM", "Blackwell", "光模块",
        "光互连", "Mag4", "Mag7", "token", "RPO", "营收/Capex", "capex",
        "资本开支", "数据中心", "Hopper",
    ],
    "neocloud": [
        "CoreWeave", "Nebius", "neocloud", "新兴云", "GPU 租赁", "GPU云",
    ],
    "semiconductor-memory-hbm": [
        "HBM", "美光", "Micron", "海力士", "三星", "存储", "NAND", "DRAM",
        "NOR", "闪存", "SanDisk", "希捷", "Seagate", "近线", "QLC",
    ],
    "power-and-physical-ai": [
        "电力", "核电", "变压器", "液冷", "冷却", "能源", "电费",
        "物理 AI", "物理AI", "人形机器人", "机器人", "Robotaxi", "Optimus",
        "波士顿动力", "宇树",
    ],
    "crypto-stablecoin-rwa": [
        "稳定币", "stablecoin", "USDC", "USDT", "Circle", "RWA", "代币化",
        "清晰法案", "Clarity Act", "链上", "Agentic Wallet", "tokeniz",
        "比特币", "BTC", "以太坊", "ETH", "微策略", "MicroStrategy",
        "Coinbase", "罗宾汉", "Robinhood",
    ],
    "defense-and-space": [
        "国防", "军工", "Lockheed", "L3Harris", "防务", "导弹", "战机",
        "太空", "卫星", "火箭", "Rocket Lab", "Intuitive", "深空",
        "月球", "Starlink", "SpaceX", "AST SpaceMobile", "Direct-to-Cell",
    ],
    "software-ai-disruption": [
        "SaaS", "纯软件", "AI 替代", "AI替代", "Cursor", "Copilot",
        "AI 颠覆", "AI颠覆", "工作流", "workflow", "ServiceNow", "Adobe",
        "Salesforce", "Workday",
    ],
    "fintech-brokerage": [
        "罗宾汉", "Robinhood", "老虎证券", "富途", "嘉信", "Schwab",
        "Z世代", "Z 世代", "券商", "经纪商", "零佣金",
    ],
}


# Macro signals — tweet is "macro" if it touches policy / liquidity /
# geopolitics / inflation / market-level moves
MACRO_KEYWORDS = [
    "Fed", "联储", "美联储", "降息", "加息", "缩表", "QT", "QE", "扩表",
    "SOFR", "EFFR", "SRF", "ON RRP", "TGA", "财政部", "Treasury", "准备金",
    "流动性", "CPI", "PCE", "通胀", "非农", "就业", "失业率", "GDP",
    "霍尔木兹", "伊朗", "关税", "TACO", "贝森特", "沃什", "德鲁肯米勒",
    "地缘", "中东", "委内瑞拉", "格陵兰", "中美",
    "央行购金", "黄金", "白银",
    "VIX", "大顶", "大底", "纳指", "标普", "道指",
    "政府停摆", "shutdown",
]


# Core methodology signals — tweet is "core" if it expresses general
# investment principles, falsifiability framing, capability circle, etc.
CORE_KEYWORDS = [
    "投资原则", "能力圈", "拿不住", "梭哈", "all in", "All in",
    "不做空", "meme", "认知深度", "确定性", "弹性", "方法论",
    "证伪", "可证伪", "若 .* 则", "杀估值", "杀业绩", "杀逻辑",
    "产业故事", "产业派", "基本面", "技术面", "K 线", "K线",
    "信仰", "高杠杆", "重仓", "仓位",
]


def _make_patterns(aliases: list[str]) -> list[re.Pattern]:
    pats = []
    for a in aliases:
        has_cjk = any("一" <= ch <= "鿿" for ch in a)
        if has_cjk:
            pats.append(re.compile(re.escape(a)))
        else:
            pats.append(re.compile(r"(?<![A-Za-z])" + re.escape(a) + r"(?![A-Za-z])"))
    return pats


ALIAS_PATTERNS: dict[str, list[re.Pattern]] = {
    ticker: _make_patterns(aliases) for ticker, aliases in TICKER_ALIASES.items()
}


def find_tickers(text: str) -> set[str]:
    if not text:
        return set()
    hits: set[str] = set()
    for ticker, patterns in ALIAS_PATTERNS.items():
        for p in patterns:
            if p.search(text):
                hits.add(ticker)
                break
    return hits


def find_sectors(text: str) -> set[str]:
    if not text:
        return set()
    text_l = text.lower()
    hits: set[str] = set()
    for sector, keywords in SECTOR_KEYWORDS.items():
        for kw in keywords:
            if kw in text or kw.lower() in text_l:
                hits.add(sector)
                break
    return hits


def is_macro(text: str) -> bool:
    if not text:
        return False
    text_l = text.lower()
    return any(kw in text or kw.lower() in text_l for kw in MACRO_KEYWORDS)


def is_core(text: str) -> bool:
    if not text:
        return False
    text_l = text.lower()
    return any(kw in text or kw.lower() in text_l for kw in CORE_KEYWORDS)


def main() -> None:
    jsonl_path = ARTIFACTS_EVIDENCE_DIR / "all-tweets.jsonl"
    tweets: list[dict] = []
    with jsonl_path.open(encoding="utf-8") as f:
        for line in f:
            tweets.append(json.loads(line))

    ticker_to_tids: dict[str, list[str]] = defaultdict(list)
    sector_to_tids: dict[str, list[str]] = defaultdict(list)
    macro_tids: list[str] = []
    core_tids: list[str] = []

    enriched_ticker_counts: Counter = Counter()
    discovered_ticker_counts: Counter = Counter()

    bucket_per_tweet: list[dict] = []

    for t in tweets:
        tid = t["tweet_id"]
        text = t.get("text") or ""
        quoted = t.get("quoted_tweet_text") or ""
        full_text = f"{text}\n{quoted}".strip()
        symbols = t.get("symbols") or {}

        # combine enrichment tickers + alias-matched tickers
        enr_tickers = set(symbols.get("tickers") or [])
        for tk in enr_tickers:
            enriched_ticker_counts[tk] += 1
        alias_tickers = find_tickers(full_text)
        for tk in alias_tickers:
            discovered_ticker_counts[tk] += 1
        all_tickers = enr_tickers | alias_tickers

        sectors = find_sectors(full_text)
        macro_flag = is_macro(full_text)
        core_flag = is_core(full_text)

        for tk in all_tickers:
            ticker_to_tids[tk].append(tid)
        for sec in sectors:
            sector_to_tids[sec].append(tid)
        if macro_flag:
            macro_tids.append(tid)
        if core_flag:
            core_tids.append(tid)

        bucket_per_tweet.append({
            "tweet_id": tid,
            "tickers": sorted(all_tickers),
            "sectors": sorted(sectors),
            "is_macro": macro_flag,
            "is_core": core_flag,
        })

    # Build indices
    ticker_index = {
        tk: {"count": len(tids), "tweet_ids": tids}
        for tk, tids in sorted(
            ticker_to_tids.items(), key=lambda kv: -len(kv[1])
        )
    }
    sector_index = {
        sec: {"count": len(tids), "tweet_ids": tids}
        for sec, tids in sorted(
            sector_to_tids.items(), key=lambda kv: -len(kv[1])
        )
    }

    (EVIDENCE_DIR / "ticker-index.json").write_text(
        json.dumps(ticker_index, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (EVIDENCE_DIR / "sector-index.json").write_text(
        json.dumps(sector_index, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    ARTIFACTS_EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    (ARTIFACTS_EVIDENCE_DIR / "bucket-per-tweet.jsonl").write_text(
        "\n".join(json.dumps(b, ensure_ascii=False) for b in bucket_per_tweet) + "\n",
        encoding="utf-8",
    )

    summary = {
        "total_tweets": len(tweets),
        "ticker_counts_combined": {tk: len(tids) for tk, tids in ticker_to_tids.items()},
        "ticker_counts_enrichment_only": dict(enriched_ticker_counts),
        "ticker_counts_alias_discovery_only": dict(discovered_ticker_counts),
        "tickers_recovered_by_alias_matching": sorted(
            {tk for tk in discovered_ticker_counts if tk not in enriched_ticker_counts}
            | {tk for tk in discovered_ticker_counts
               if discovered_ticker_counts[tk] > enriched_ticker_counts.get(tk, 0) * 1.5}
        ),
        "sector_counts": {sec: len(tids) for sec, tids in sector_to_tids.items()},
        "macro_tweet_count": len(macro_tids),
        "core_tweet_count": len(core_tids),
    }
    (EVIDENCE_DIR / "bucket-summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print(f"Indexed {len(tweets)} tweets")
    print(f"Tickers (combined): {len(ticker_to_tids)}")
    print(f"Top 25 tickers: {sorted(((len(v), k) for k, v in ticker_to_tids.items()), reverse=True)[:25]}")
    print(f"Sectors: {dict((s, len(v)) for s, v in sector_to_tids.items())}")
    print(f"Macro tweets: {len(macro_tids)}")
    print(f"Core tweets: {len(core_tids)}")


if __name__ == "__main__":
    main()
