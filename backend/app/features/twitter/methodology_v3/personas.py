"""Persona configurations for the v3 distillation pipeline.

Each persona has:
  - username: Twitter handle (for DB queries)
  - draft_dir: legacy subdirectory name under methodologies/_drafts/
  - root_dir: optional material root under methodologies/ for promoted personas
  - ticker_aliases: dict ticker -> [aliases] for bucketize.py
  - sector_keywords: dict sector_name -> [keywords]
  - macro_keywords: list of keywords flagging a tweet as macro
  - core_keywords: list of keywords flagging a tweet as core/methodology

The CLI scripts accept `--persona-key` (default qinbafrank-skill-v3) and look
up the config here. Formal runtime materials live under methodologies/;
generated corpus, slices, compact views, eval, and audit outputs live under
the gitignored `_distillation_artifacts/<draft_dir>/` tree.
"""

from __future__ import annotations

from pathlib import Path
from typing import NotRequired, TypedDict


class PersonaConfig(TypedDict):
    username: str
    draft_dir: str
    root_dir: NotRequired[str]
    ticker_aliases: dict[str, list[str]]
    sector_keywords: dict[str, list[str]]
    macro_keywords: list[str]
    core_keywords: list[str]


# ============================================================
# qinbafrank — Chinese macro/AI-infra analyst
# ============================================================

QINBAFRANK_TICKERS: dict[str, list[str]] = {
    "NVDA": ["英伟达", "Nvidia", "NVDA"],
    "TSM": ["台积电", "台积", "TSMC", "TSM"],
    "ASML": ["阿斯麦", "ASML"],
    "MU": ["美光", "Micron", "MU"],
    "AVGO": ["博通", "Broadcom", "AVGO"],
    "MRVL": ["Marvell", "MRVL", "马维尔"],
    "AMD": ["超微", "AMD"],
    "INTC": ["英特尔", "Intel", "INTC"],
    "ARM": ["ARM"],
    "QCOM": ["高通", "Qualcomm", "QCOM"],
    "SNDK": ["闪迪", "SanDisk", "SNDK"],
    "LITE": ["Lumentum", "LITE"],
    "NVTS": ["Navitas", "NVTS"],
    "ON": ["安森美", "Onsemi", "ONSemi"],
    "ORCL": ["甲骨文", "Oracle", "ORCL"],
    "MSFT": ["微软", "Microsoft", "MSFT"],
    "GOOGL": ["谷歌", "Alphabet", "GOOGL", "GOOG"],
    "AMZN": ["亚马逊", "Amazon", "AMZN"],
    "META": ["脸书", "Meta", "FB"],
    "CRWV": ["CoreWeave", "CRWV"],
    "NBIS": ["Nebius", "NBIS"],
    "IBM": ["IBM"],
    "CRCL": ["Circle", "CRCL"],
    "COIN": ["Coinbase", "COIN"],
    "HOOD": ["罗宾汉", "Robinhood", "HOOD"],
    "MSTR": ["微策略", "MicroStrategy", "MSTR"],
    "BMNR": ["BMNR"],
    "FUTU": ["富途", "FUTU"],
    "TIGR": ["老虎证券", "TIGR"],
    "RKLB": ["Rocket Lab", "RKLB"],
    "ASTS": ["AST SpaceMobile", "ASTS"],
    "LUNR": ["Intuitive Machines", "LUNR"],
    "PLTR": ["Palantir", "PLTR"],
    "LHX": ["L3Harris", "LHX"],
    "BA": ["波音", "Boeing"],
    "CRWD": ["CrowdStrike", "CRWD"],
    "TSLA": ["特斯拉", "Tesla", "TSLA"],
    "NOK": ["诺基亚", "Nokia", "NOK"],
    "BB": ["BlackBerry", "黑莓"],
}

QINBAFRANK_SECTORS: dict[str, list[str]] = {
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

QINBAFRANK_MACRO: list[str] = [
    "Fed", "联储", "美联储", "降息", "加息", "缩表", "QT", "QE", "扩表",
    "SOFR", "EFFR", "SRF", "ON RRP", "TGA", "财政部", "Treasury", "准备金",
    "流动性", "CPI", "PCE", "通胀", "非农", "就业", "失业率", "GDP",
    "霍尔木兹", "伊朗", "关税", "TACO", "贝森特", "沃什", "德鲁肯米勒",
    "地缘", "中东", "委内瑞拉", "格陵兰", "中美",
    "央行购金", "黄金", "白银",
    "VIX", "大顶", "大底", "纳指", "标普", "道指",
    "政府停摆", "shutdown",
]

QINBAFRANK_CORE: list[str] = [
    "投资原则", "能力圈", "拿不住", "梭哈", "all in", "All in",
    "不做空", "meme", "认知深度", "确定性", "弹性", "方法论",
    "证伪", "可证伪", "若 .* 则", "杀估值", "杀业绩", "杀逻辑",
    "产业故事", "产业派", "基本面", "技术面", "K 线", "K线",
    "信仰", "高杠杆", "重仓", "仓位",
]


# ============================================================
# Serenity (aleabitoreddit) — English AI/Semi supply-chain analyst
# ============================================================

SERENITY_TICKERS: dict[str, list[str]] = {
    # High coverage (≥80 mentions)
    "SIVE": ["Sivers", "SIVE"],
    "LITE": ["Lumentum", "LITE"],
    "AXTI": ["AXT Inc", "AXT", "AXTI"],
    "AAOI": ["Applied Optoelectronics", "AOI", "AAOI"],
    "NBIS": ["Nebius", "NBIS"],
    "MRVL": ["Marvell", "MRVL"],
    "NVDA": ["Nvidia", "NVDA"],
    "COHR": ["Coherent", "COHR"],
    "SNDK": ["SanDisk", "SNDK"],
    "SOI": ["Soitec", "SOI"],
    "MU": ["Micron", "MU"],
    # Medium (30-80)
    "IREN": ["Iris Energy", "IREN"],
    "IQE": ["IQE plc", "IQE"],
    "TSM": ["TSMC", "Taiwan Semi", "TSM"],
    "EWY": ["EWY"],
    "AVGO": ["Broadcom", "AVGO"],
    "AEHR": ["Aehr Test", "AEHR"],
    "TSEM": ["Tower Semi", "TowerJazz", "TSEM"],
    "AMZN": ["Amazon", "AMZN"],
    "META": ["Meta", "FB"],
    "GOOGL": ["Alphabet", "GOOGL", "GOOG"],
    "INTC": ["Intel", "INTC"],
    "MSFT": ["Microsoft", "MSFT"],
    "JBL": ["Jabil", "JBL"],
    "RKLB": ["Rocket Lab", "RKLB"],
    # Low (10-30)
    "AMD": ["AMD"],
    "CIFR": ["Cipher Mining", "CIFR"],
    "POET": ["POET Technologies", "POET"],
    "HOOD": ["Robinhood", "HOOD"],
    "RDDT": ["Reddit", "RDDT"],
    "CRWV": ["CoreWeave", "CRWV"],
    "WULF": ["TeraWulf", "WULF"],
    "ALAB": ["Astera Labs", "ALAB"],
    "LPK": ["LPKF", "LPK"],
    "HPS.A": ["HPS.A"],
    # Also commonly mentioned upstream
    "ASML": ["ASML"],
    "ARM": ["ARM"],
    "QCOM": ["Qualcomm", "QCOM"],
    "ON": ["Onsemi", "ON"],
}

SERENITY_SECTORS: dict[str, list[str]] = {
    "photonics-and-cpo": [
        "photonics", "photonic", "CPO", "co-packaged optics", "co packaged",
        "silicon photonics", "SiPh", "optical interconnect",
        "光通信", "光子", "光封装", "光互连",
    ],
    "optical-transceivers": [
        "transceiver", "EML", "VCSEL", "DSP", "optical module", "800G",
        "1.6T", "OSFP", "QSFP", "DR8", "FR8", "linear drive", "LPO",
        "光模块",
    ],
    "substrates": [
        "substrate", "substrates", "GaAs", "InP", "gallium arsenide",
        "indium phosphide", "epi wafer", "epi-wafer", "epitaxial",
        "衬底", "外延",
    ],
    "memory-and-hbm": [
        "HBM", "DRAM", "NAND", "high bandwidth memory", "memory",
        "SSD", "NOR", "QLC",
        "存储", "闪存",
    ],
    "neocloud": [
        "neocloud", "neoclouds", "GPU cloud", "hyperscaler capex",
        "capex funnel", "GPU rental", "Nebius", "CoreWeave",
        "新兴云", "GPU 租赁",
    ],
    "ai-infrastructure-mag7": [
        "Blackwell", "Hopper", "Rubin", "Vera", "GB200", "GB300",
        "custom silicon", "ASIC", "MAIA", "TPU", "Trainium", "Inferentia",
        "AI infra", "hyperscaler",
    ],
    "power-and-electrical": [
        "power", "transformer", "grid", "800V", "HVDC", "electrification",
        "data center power", "kW", "MW", "GW", "PSU",
        "电力", "变压器",
    ],
    "defense-and-space": [
        "defense", "space", "satellite", "missile", "drone", "rocket",
        "Direct-to-Cell", "national security",
        "国防", "军工", "太空", "卫星", "火箭",
    ],
    "humanoid-robotics": [
        "humanoid", "robotics", "robot", "harmonic drive", "Optimus",
        "Tesla bot", "Ubtech", "Boston Dynamics", "Figure",
        "人形机器人", "机器人",
    ],
}

# Serenity rarely tweets Fed/liquidity macro. Her macro signals are
# AI capex cycle + KR/TW/JP supply-chain geopolitics + tariffs.
SERENITY_MACRO: list[str] = [
    # AI capex cycle
    "capex", "CapEx", "hyperscaler capex", "AI capex",
    "AI cycle", "supercycle", "super cycle", "bubble",
    # Asia supply chain geopolitics
    "Korea", "Taiwan", "Japan", "TSMC", "Samsung", "Hynix", "SK Hynix",
    "EWY", "China export", "export control", "chip ban",
    "tariff", "tariffs", "national security",
    # Macro market
    "Fed", "rate cut", "rate hike", "yields", "treasury",
    "VIX", "drawdown", "correction", "rotation",
    "recession", "inflation",
    # Power/grid as macro constraint
    "grid", "power constraint", "电力",
]

SERENITY_CORE: list[str] = [
    # Her engineer-grade thinking + WSB roots
    "bottleneck", "unknown bottleneck", "supply chain",
    "engineer", "engineering", "physical layer", "physics",
    "RISC-V", "research scientist",
    # Her style markers
    "go brr", "supercycle", "called out", "before the supercycle",
    "last year", "this year",
    # Her risk management language
    "conviction", "high conviction", "FOMO", "parroting",
    "bot farms", "thesis", "long thesis", "short thesis",
    # Position sizing
    "all in", "concentrated", "position", "1.5M", "$1.5M",
    # Methodology
    "methodology", "framework", "approach",
]


# ============================================================
# Registry
# ============================================================

PERSONAS: dict[str, PersonaConfig] = {
    "qinbafrank-skill-v3": {
        "username": "qinbafrank",
        "draft_dir": "qinbafrank-skill-v3",
        "root_dir": "qinbafrank",
        "ticker_aliases": QINBAFRANK_TICKERS,
        "sector_keywords": QINBAFRANK_SECTORS,
        "macro_keywords": QINBAFRANK_MACRO,
        "core_keywords": QINBAFRANK_CORE,
    },
    "serenity-skill-v1": {
        "username": "aleabitoreddit",
        "draft_dir": "serenity-skill-v1",
        "root_dir": "aleabitoreddit",
        "ticker_aliases": SERENITY_TICKERS,
        "sector_keywords": SERENITY_SECTORS,
        "macro_keywords": SERENITY_MACRO,
        "core_keywords": SERENITY_CORE,
    },
}


def get_persona(persona_key: str) -> PersonaConfig:
    if persona_key not in PERSONAS:
        raise SystemExit(
            f"Unknown persona key: {persona_key!r}. "
            f"Available: {sorted(PERSONAS.keys())}"
        )
    return PERSONAS[persona_key]


def material_root(cfg: PersonaConfig) -> Path:
    root = Path(__file__).resolve().parents[1] / "methodologies"
    root_dir = cfg.get("root_dir")
    if root_dir:
        return root / root_dir
    return root / "_drafts" / cfg["draft_dir"]


def artifact_root(cfg: PersonaConfig) -> Path:
    return (
        Path(__file__).resolve().parents[1]
        / "_distillation_artifacts"
        / cfg["draft_dir"]
    )


def evidence_dir(cfg: PersonaConfig) -> Path:
    return artifact_root(cfg) / "evidence"


def eval_dir(cfg: PersonaConfig) -> Path:
    return artifact_root(cfg) / "eval"
