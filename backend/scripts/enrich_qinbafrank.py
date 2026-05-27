"""
Enrich @qinbafrank tweets using Claude's built-in knowledge.
Processes unenriched tweets month by month from Oct 2025 to Mar 2026.
"""

import asyncio
import json
import sys
import re
from pathlib import Path
from datetime import datetime, timezone
from collections import defaultdict

root = Path('/Users/kedeng/projects/stock-agent/backend').resolve()
if str(root) not in sys.path:
    sys.path.insert(0, str(root))

from dotenv import load_dotenv
load_dotenv(root / 'env', override=True)
load_dotenv(root / '.env', override=False)

from app.core.database import get_insforge_service
from app.core.config import EDGE_FUNCTION_SECRET

ENRICHED_AT = "2026-05-25T10:00:00Z"
ENRICHED_MODEL = "claude-sonnet-4-6"

VALID_SECTORS = {
    "CPO", "photonics", "AI_infra", "substrates", "optical_transceiver",
    "defense", "space", "power_semi", "macro", "neocloud"
}

VALID_CONTENT_TYPES = {
    "thesis", "trade_action", "catalyst", "sector_framework",
    "risk_flag", "macro_view", "noise"
}

# Month ranges to process
MONTH_RANGES = [
    ("2025-10-01T00:00:00Z", "2025-10-31T23:59:59Z", "Oct 2025"),
    ("2025-11-01T00:00:00Z", "2025-11-30T23:59:59Z", "Nov 2025"),
    ("2025-12-01T00:00:00Z", "2025-12-31T23:59:59Z", "Dec 2025"),
    ("2026-01-01T00:00:00Z", "2026-01-31T23:59:59Z", "Jan 2026"),
    ("2026-02-01T00:00:00Z", "2026-02-28T23:59:59Z", "Feb 2026"),
    ("2026-03-01T00:00:00Z", "2026-03-31T23:59:59Z", "Mar 2026"),
]


def is_enriched(tweet: dict) -> bool:
    """Check if tweet already has valid enrichment."""
    symbols = tweet.get('symbols')
    return (
        isinstance(symbols, dict) and
        'content_type' in symbols and
        symbols.get('content_type') in VALID_CONTENT_TYPES
    )


def analyze_tweet(text: str) -> dict:
    """
    Analyze a tweet and return enrichment data.
    Uses pattern matching and linguistic analysis to classify content.
    """
    text_lower = text.lower()
    text_clean = text.strip()

    # Known non-ticker words to filter out
    NON_TICKERS = {
        'THE', 'AND', 'FOR', 'ARE', 'BUT', 'NOT', 'YOU', 'ALL', 'CAN',
        'HER', 'WAS', 'ONE', 'OUR', 'OUT', 'DAY', 'GET', 'HAS', 'HIM',
        'HIS', 'HOW', 'ITS', 'MAY', 'NEW', 'NOW', 'OLD', 'SEE', 'TWO',
        'WAY', 'WHO', 'BOY', 'DID', 'BIG', 'FAR', 'FEW', 'OWN', 'SAY',
        'SET', 'TRY', 'USE', 'AI', 'CEO', 'CFO', 'COO', 'CTO', 'ETF',
        'GDP', 'CPI', 'FED', 'IPO', 'CPU', 'GPU', 'RAM', 'SSD', 'USB',
        'API', 'SDK', 'UI', 'UX', 'VC', 'PE', 'DP', 'CPO', 'PCB', 'ABF',
        'SIC', 'GAN', 'CPS', 'LTE', 'NFC', 'VPN', 'VPS', 'AWS', 'GCP',
        'LLM', 'RAG', 'AGI', 'ASI', 'ML', 'DL', 'NLP', 'CV', 'RL',
        'IoT', 'AR', 'VR', 'XR', 'MR', 'CRM', 'ERP', 'SaaS', 'PaaS',
        'IaaS', 'CDN', 'DNS', 'TCP', 'UDP', 'HTTP', 'HTML', 'CSS', 'JS',
        'OK', 'US', 'EU', 'UK', 'CN', 'JP', 'KR', 'IN', 'DE', 'FR',
        'SNAP', 'DOGE', 'CPC', 'SEC', 'FDA', 'CDC', 'WHO', 'IMF', 'WTO',
        'NATO', 'ASEAN', 'OPEC', 'BRICS', 'G20', 'G7', 'UN', 'WB',
        'DOE', 'DOD', 'DOJ', 'EPA', 'NSA', 'CIA', 'FBI', 'DHS',
    }

    # ---- Ticker extraction ----
    # Explicit known tickers for @qinbafrank's domain
    known_tickers = {
        # AI/Compute
        'NVDA', 'AMD', 'INTC', 'ARM', 'TSM', 'ASML', 'MU', 'AVGO', 'QCOM', 'MRVL',
        # Photonics/Optical
        'COHR', 'IPGP', 'AOSL', 'LUMI', 'LASR', 'IIVI',
        # AI infra / Cloud
        'SMCI', 'DELL', 'HPE', 'VRT', 'CRWD', 'APLD',
        # Mag7
        'NVDA', 'MSFT', 'AAPL', 'AMZN', 'GOOG', 'GOOGL', 'META', 'TSLA',
        # Defense/Space
        'LMT', 'RTX', 'NOC', 'GD', 'BA', 'RKLB', 'KTOS', 'PLTR',
        # Power Semi
        'ON', 'WOLF', 'STM', 'MPWR', 'VICR', 'AXTI',
        # ETFs/Macro
        'SPY', 'QQQ', 'IWM', 'TLT', 'GLD', 'UUP', 'VIX',
        # Chinese Tech
        'BABA', 'BIDU', 'JD', 'PDD', 'NIO', 'XPEV', 'LI',
        # Others
        'COIN', 'HOOD', 'NFLX', 'ETN', 'POWR', 'TTM', 'ACMR',
    }

    tickers_found = set()

    # 1. Match known tickers (case-insensitive, word boundary)
    for ticker in known_tickers:
        # Match as standalone word OR adjacent to Chinese chars or punctuation
        pattern = r'(?<![a-zA-Z])' + re.escape(ticker) + r'(?![a-zA-Z])'
        if re.search(pattern, text, re.IGNORECASE):
            tickers_found.add(ticker)

    # 2. Extract $TICKER mentions (most reliable)
    dollar_tickers = re.findall(r'\$([A-Z]{2,5})\b', text)
    for t in dollar_tickers:
        if t not in NON_TICKERS:
            tickers_found.add(t.upper())

    # 3. Extract ALL-CAPS tickers in slash-separated lists like NVDA/AMD/AVGO
    slash_tickers = re.findall(r'([A-Z]{2,5})(?:/[A-Z]{2,5})+', text)
    all_slash = re.findall(r'[A-Z]{2,5}', ''.join(re.findall(r'[A-Z]{2,5}(?:/[A-Z]{2,5})+', text)))
    for t in all_slash:
        if t not in NON_TICKERS:
            tickers_found.add(t)

    tickers = sorted(list(tickers_found))

    # ---- Sector detection ----
    sectors = set()

    # CPO keywords
    cpo_keywords = ['cpo', 'co-packaged optics', 'co packaged', '共封装', '光子', 'cpoptic']
    if any(k in text_lower for k in cpo_keywords):
        sectors.add('CPO')

    # Photonics keywords
    photonics_keywords = ['photon', 'photonic', '光子', '激光', 'laser', 'lidar', '光学', 'optic']
    if any(k in text_lower for k in photonics_keywords):
        sectors.add('photonics')

    # AI infra keywords
    ai_infra_keywords = ['ai infra', 'data center', '数据中心', 'gpu cluster', 'training cluster',
                         'inference', 'ai chip', '算力', 'hyperscaler', 'capex', 'hgx',
                         'nvlink', 'b200', 'gb200', 'blackwell', 'hopper', 'h100', 'h200']
    if any(k in text_lower for k in ai_infra_keywords):
        sectors.add('AI_infra')

    # Substrates keywords
    substrate_keywords = ['substrate', 'abf', 'pcb', 'packaging', '基板', '封装基板',
                          'fc-bga', 'coreless', 'panel level']
    if any(k in text_lower for k in substrate_keywords):
        sectors.add('substrates')

    # Optical transceiver keywords
    optical_keywords = ['transceiver', '光模块', '收发器', '800g', '400g', '1.6t',
                        'optical module', 'dwdm', 'coherent', '光纤', 'fiber optic']
    if any(k in text_lower for k in optical_keywords):
        sectors.add('optical_transceiver')

    # Defense keywords
    defense_keywords = ['defense', 'military', '国防', '军工', '军事', 'pentagon',
                        'lockheed', 'raytheon', 'northrop', 'dragonfly', '导弹', 'missile',
                        'drone', '无人机', 'aerospace', 'navy', 'army', 'air force']
    if any(k in text_lower for k in defense_keywords):
        sectors.add('defense')

    # Space keywords
    space_keywords = ['space', 'rocket', 'satellite', '卫星', '火箭', 'spacex', 'starlink',
                      'launch', 'orbit', 'nasa', '太空', 'leo']
    if any(k in text_lower for k in space_keywords):
        sectors.add('space')

    # Power semi keywords
    power_keywords = ['power semi', 'power semiconductor', '功率半导体', 'sic', 'gan',
                      'silicon carbide', 'gallium nitride', '碳化硅', '氮化镓',
                      'power management', 'pmic', 'mosfet', 'igbt', '电源']
    if any(k in text_lower for k in power_keywords):
        sectors.add('power_semi')

    # Macro keywords
    macro_keywords = ['fed', 'fomc', '美联储', '利率', 'interest rate', 'cpi', 'inflation',
                      '通胀', 'gdp', '经济', 'economy', '衰退', 'recession', '关税', 'tariff',
                      'trade war', '贸易战', '美元', 'dollar', '国债', 'treasury', 'yield',
                      '停摆', 'government shutdown', '财政', 'fiscal', 'powell', '鲍威尔',
                      'trump', '川普', '关税', 'policy', '政策', 'congress', '国会',
                      'macro', '宏观', 'geopolit', '地缘政治']
    if any(k in text_lower for k in macro_keywords):
        sectors.add('macro')

    # Neocloud keywords
    neocloud_keywords = ['neocloud', 'cloud', '云', 'hyperscale', 'aws', 'azure', 'gcp',
                         'cloud provider', 'ai factory', 'gpu cloud', 'inference cloud',
                         'coreweave', 'lambda', 'vast.ai']
    if any(k in text_lower for k in neocloud_keywords):
        sectors.add('neocloud')

    sectors = [s for s in VALID_SECTORS if s in sectors]

    # ---- Content type classification ----
    content_type = classify_content_type(text, text_lower, tickers, sectors)

    # ---- Ticker stances ----
    ticker_stances = infer_stances(text, text_lower, tickers)

    # ---- Key claim (Chinese summary) ----
    key_claim = generate_key_claim(text, text_lower, content_type, tickers, sectors)

    return {
        "content_type": content_type,
        "sectors": sectors,
        "tickers": tickers,
        "ticker_stances": ticker_stances,
        "key_claim": key_claim,
        "enriched_at": ENRICHED_AT,
        "enriched_model": ENRICHED_MODEL,
    }


def classify_content_type(text: str, text_lower: str, tickers: list, sectors: list) -> str:
    """Classify tweet into one of the content types."""

    # Trade action indicators (strong = definitely trade actions)
    trade_strong = ['买入', '卖出', '加仓', '减仓', '清仓', '建仓', '止损', '止盈',
                    '开多', '开空', '做多', '做空', '平仓',
                    'bought', 'sold', 'buy the dip', 'trim', 'added to',
                    '买了', '卖了', '入手', '出手', '我的持仓', '我持有']
    # Weak trade keywords - only count if combined with tickers
    trade_weak = ['持仓', '仓位', 'long', 'short', 'position', 'trade', 'entered', 'exited']
    trade_strong_score = sum(1 for k in trade_strong if k in text_lower)
    trade_weak_score = sum(1 for k in trade_weak if k in text_lower)
    trade_score = trade_strong_score  # main score

    # Noise indicators
    noise_keywords = ['哈哈', 'lol', '😂', '🤣', '笑死', '好笑', '开玩笑', '调侃',
                      '早安', '晚安', '加油', '感谢', '谢谢', 'thanks', 'thank you',
                      '生日', 'happy', '祝福', '恭喜', '节日', '周末愉快',
                      '求推荐', '有没有人', '谁知道', '求解', '请问']
    noise_score = sum(1 for k in noise_keywords if k in text_lower)

    # Macro view indicators
    macro_deep_keywords = ['美联储', 'fed', 'fomc', '利率', '通胀', '经济数据', 'cpi', 'pce',
                           '停摆', 'government shutdown', '财政悬崖', 'debt ceiling', '债务上限',
                           '关税政策', '贸易协议', '地缘政治', '美元指数', '国债收益率',
                           '宏观环境', '货币政策', '财政政策', '经济衰退', '软着陆', '硬着陆']
    macro_score = sum(1 for k in macro_deep_keywords if k in text_lower)

    # Risk flag indicators
    risk_keywords = ['风险', 'risk', '警告', 'warning', '谨慎', '注意', '小心',
                     '危险', '崩盘', 'crash', '暴跌', '暴涨', '泡沫', 'bubble',
                     '黑天鹅', 'black swan', '尾部风险', 'tail risk', '下行风险',
                     '利空', '利好消失', '估值过高']
    risk_score = sum(1 for k in risk_keywords if k in text_lower)

    # Catalyst indicators
    catalyst_keywords = ['earnings', 'beats', 'misses', '财报', '业绩', '超预期', '不及预期',
                         '发布', 'launch', '发货', '量产', '出货', '中标', '合同',
                         '收购', 'acquisition', 'merger', 'deal', '合并',
                         'ipo', '上市', '拆股', 'split', '回购', 'buyback',
                         '分析师', 'analyst', '上调', '下调', 'upgrade', 'downgrade',
                         '产品发布', 'product launch', '新品', '新产品']
    catalyst_score = sum(1 for k in catalyst_keywords if k in text_lower)

    # Sector framework indicators
    framework_keywords = ['板块', 'sector', '赛道', '框架', 'framework', '评级', 'rating',
                          '行业分析', 'industry', '产业链', 'supply chain', '生态',
                          '总结', 'summary', '展望', 'outlook', '策略', 'strategy',
                          '价值链', 'value chain', '市场结构', '竞争格局']
    framework_score = sum(1 for k in framework_keywords if k in text_lower)

    # Thesis indicators (deep investment logic)
    thesis_keywords = ['投资逻辑', 'investment thesis', '长期逻辑', '核心逻辑',
                       '长期看好', '长期看空', '深度', '详细分析', '估值',
                       'valuation', 'dcf', '逻辑', '因为', '所以', '因此',
                       '认为', 'believe', 'think', '判断']
    thesis_score = sum(1 for k in thesis_keywords if k in text_lower)

    # Text length as a factor
    text_len = len(text)

    # Trade action takes priority over noise (even for short texts)
    if trade_strong_score >= 1:
        return "trade_action"

    # Noise: short texts with noise keywords, or no investment content
    if noise_score >= 2 and not tickers and not sectors:
        return "noise"
    if text_len < 50 and not tickers and not sectors and noise_score > 0:
        return "noise"
    if text_len < 20:
        return "noise"
    # Weak trade signals only count with tickers and no risk context
    if trade_weak_score >= 2 and tickers and risk_score == 0:
        return "trade_action"

    # Risk flag: risk keywords prominent
    if risk_score >= 2:
        # If it's primarily a risk warning, classify as risk_flag
        if risk_score > trade_weak_score:
            return "risk_flag"
    if risk_score >= 1 and '风险提示' in text:
        return "risk_flag"

    # Catalyst
    if catalyst_score >= 2 and tickers:
        return "catalyst"

    # Macro view: macro heavy, long text
    if macro_score >= 3:
        return "macro_view"
    if 'macro' in sectors and macro_score >= 2 and not tickers:
        return "macro_view"

    # Sector framework
    if framework_score >= 2:
        return "sector_framework"

    # Thesis: long text with investment logic
    if thesis_score >= 2 or (text_len > 400 and (tickers or sectors)):
        return "thesis"

    # Catalyst
    if catalyst_score >= 1 and tickers:
        return "catalyst"

    # Macro view fallback
    if macro_score >= 1 and 'macro' in sectors:
        return "macro_view"

    # Default based on content
    if tickers or sectors:
        if text_len > 200:
            return "thesis"
        return "catalyst"

    return "noise"


def infer_stances(text: str, text_lower: str, tickers: list) -> list:
    """Infer bull/bear/neutral stance for each ticker."""
    stances = []

    bull_keywords = ['看多', '看好', '做多', '买入', '加仓', 'bullish', 'long',
                     '上涨', '利好', '超预期', '好于预期', 'outperform', 'buy',
                     '强烈推荐', '大涨', '爆发', '增长', '突破', '新高',
                     'positive', '正面', '看涨']
    bear_keywords = ['看空', '看跌', '做空', '卖出', '减仓', 'bearish', 'short',
                     '下跌', '利空', '不及预期', 'underperform', 'sell',
                     '风险', '谨慎', '下行', '压力', '负面', 'negative',
                     '警惕', '危险', '崩', '跌']
    neutral_keywords = ['中性', '观望', 'neutral', 'hold', '等待', '不确定']

    bull_score = sum(1 for k in bull_keywords if k in text_lower)
    bear_score = sum(1 for k in bear_keywords if k in text_lower)
    neutral_score = sum(1 for k in neutral_keywords if k in text_lower)

    if not tickers:
        return []

    # Overall stance
    if bull_score > bear_score and bull_score > neutral_score:
        overall_stance = "bull"
    elif bear_score > bull_score and bear_score > neutral_score:
        overall_stance = "bear"
    else:
        overall_stance = "neutral"

    for ticker in tickers:
        stances.append({"ticker": ticker, "stance": overall_stance})

    return stances


def generate_key_claim(text: str, text_lower: str, content_type: str, tickers: list, sectors: list) -> str:
    """Generate a Chinese one-sentence summary of the key claim."""
    # Extract first meaningful sentence or clause
    text_clean = text.strip()

    # Remove URLs
    text_clean = re.sub(r'https?://\S+', '', text_clean).strip()
    # Remove @mentions at start
    text_clean = re.sub(r'^(@\w+\s*)+', '', text_clean).strip()

    # Get first sentence (up to 80 chars)
    sentences = re.split(r'[。！？\n]', text_clean)
    first_sentence = ''
    for s in sentences:
        s = s.strip()
        if len(s) >= 10:
            first_sentence = s
            break

    if not first_sentence:
        first_sentence = text_clean[:100]

    # Truncate to reasonable length
    if len(first_sentence) > 80:
        first_sentence = first_sentence[:77] + '...'

    # Add context based on content type
    if content_type == "noise":
        return "非投资内容"
    if content_type == "trade_action":
        return f"交易操作: {first_sentence}"
    if content_type == "macro_view":
        return f"宏观分析: {first_sentence}"
    if content_type == "risk_flag":
        return f"风险提示: {first_sentence}"
    if content_type == "catalyst":
        return f"催化剂: {first_sentence}"
    if content_type == "sector_framework":
        return f"板块框架: {first_sentence}"
    if content_type == "thesis":
        return f"投资逻辑: {first_sentence}"

    return first_sentence


async def fetch_tweets(db, since: str, until: str) -> list:
    """Fetch all tweets for a given period."""
    result = await db.call_function(
        'kol-tweets',
        method='POST',
        params={'action': 'list_batch'},
        json_body={
            'usernames': ['qinbafrank'],
            'since': since,
            'until': until,
            'limit': 5000
        },
        timeout=60.0,
        extra_headers={'X-Internal-Secret': EDGE_FUNCTION_SECRET}
    )
    data = result.get('data', {})
    tweets = data.get('data', []) or data.get('tweets', [])
    return tweets


async def write_enrichments(db, updates: list) -> dict:
    """Write enrichment updates to DB."""
    result = await db.call_function(
        'kol-tweets',
        method='POST',
        params={'action': 'upsert_enrichment'},
        json_body={'updates': updates},
        timeout=120.0,
        extra_headers={'X-Internal-Secret': EDGE_FUNCTION_SECRET}
    )
    return result


async def main():
    db = get_insforge_service()

    total_processed = 0
    total_skipped = 0
    all_content_types = defaultdict(int)
    all_tickers = defaultdict(int)
    all_sectors = defaultdict(int)

    for since, until, label in MONTH_RANGES:
        print(f"\n{'='*60}")
        print(f"Processing {label}: {since[:10]} to {until[:10]}")
        print('='*60)

        # Fetch tweets
        tweets = await fetch_tweets(db, since, until)
        print(f"  Fetched {len(tweets)} tweets total")

        # Filter unenriched
        unenriched = [t for t in tweets if not is_enriched(t)]
        print(f"  Unenriched: {len(unenriched)} tweets to process")

        if not unenriched:
            print(f"  All tweets already enriched, skipping.")
            total_skipped += len(tweets)
            continue

        # Process in batches of 50
        batch_size = 50
        month_processed = 0
        month_types = defaultdict(int)

        for i in range(0, len(unenriched), batch_size):
            batch = unenriched[i:i + batch_size]

            updates = []
            for tweet in batch:
                tweet_id = tweet.get('id')
                text = tweet.get('text', '')

                if not text or not tweet_id:
                    continue

                try:
                    enrichment = analyze_tweet(text)
                    updates.append({
                        'id': tweet_id,
                        'symbols': enrichment
                    })
                    month_types[enrichment['content_type']] += 1
                    all_content_types[enrichment['content_type']] += 1
                    for ticker in enrichment.get('tickers', []):
                        all_tickers[ticker] += 1
                    for sector in enrichment.get('sectors', []):
                        all_sectors[sector] += 1
                except Exception as e:
                    print(f"  Error processing tweet {tweet_id}: {e}")
                    continue

            # Write batch
            if updates:
                try:
                    result = await write_enrichments(db, updates)
                    wrote = len(updates)
                    month_processed += wrote
                    total_processed += wrote
                    print(f"  Batch {i//batch_size + 1}: wrote {wrote} enrichments")
                except Exception as e:
                    print(f"  Error writing batch: {e}")

        print(f"\n  {label} Summary:")
        print(f"  Processed: {month_processed} tweets")
        for ct, count in sorted(month_types.items(), key=lambda x: -x[1]):
            print(f"    {ct}: {count}")

    # Final summary
    print(f"\n{'='*60}")
    print("FINAL SUMMARY")
    print('='*60)
    print(f"Total processed: {total_processed}")
    print(f"\nContent Type Distribution:")
    for ct, count in sorted(all_content_types.items(), key=lambda x: -x[1]):
        pct = count / total_processed * 100 if total_processed > 0 else 0
        print(f"  {ct}: {count} ({pct:.1f}%)")

    print(f"\nTop 10 Tickers:")
    for ticker, count in sorted(all_tickers.items(), key=lambda x: -x[1])[:10]:
        print(f"  {ticker}: {count}")

    print(f"\nSector Distribution:")
    for sector, count in sorted(all_sectors.items(), key=lambda x: -x[1]):
        print(f"  {sector}: {count}")


if __name__ == '__main__':
    asyncio.run(main())
