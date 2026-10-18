/**
 * Shared stock name mapping (English + Chinese).
 * Used by stock/page.tsx, for-you/page.tsx, and WatchlistPanel.
 */

export const STOCK_NAMES: Record<string, { en: string; zh: string }> = {
  // Mag 7
  'AAPL': { en: 'Apple Inc.', zh: '苹果' },
  'MSFT': { en: 'Microsoft Corp.', zh: '微软' },
  'GOOGL': { en: 'Alphabet Inc.', zh: '谷歌' },
  'GOOG': { en: 'Alphabet Inc.', zh: '谷歌' },
  'AMZN': { en: 'Amazon.com Inc.', zh: '亚马逊' },
  'META': { en: 'Meta Platforms', zh: 'Meta' },
  'NVDA': { en: 'NVIDIA Corp.', zh: '英伟达' },
  'TSLA': { en: 'Tesla Inc.', zh: '特斯拉' },
  // AI & Infrastructure
  'AI': { en: 'C3.ai Inc.', zh: 'C3.ai' },
  'SMCI': { en: 'Super Micro Computer', zh: '超微电脑' },
  // Semiconductors
  'AMD': { en: 'AMD Inc.', zh: 'AMD' },
  'INTC': { en: 'Intel Corp.', zh: '英特尔' },
  'AVGO': { en: 'Broadcom Inc.', zh: '博通' },
  'TSM': { en: 'TSMC', zh: '台积电' },
  'ARM': { en: 'Arm Holdings', zh: 'Arm' },
  'MRVL': { en: 'Marvell Technology', zh: 'Marvell' },
  'ASML': { en: 'ASML Holding', zh: 'ASML' },
  'QCOM': { en: 'Qualcomm', zh: '高通' },
  'MU': { en: 'Micron Technology', zh: '美光' },
  'LRCX': { en: 'Lam Research', zh: '泛林集团' },
  'KLAC': { en: 'KLA Corp.', zh: 'KLA' },
  // Enterprise Software & Cybersecurity
  'CRM': { en: 'Salesforce', zh: 'Salesforce' },
  'ORCL': { en: 'Oracle Corp.', zh: '甲骨文' },
  'ADBE': { en: 'Adobe Inc.', zh: 'Adobe' },
  'NOW': { en: 'ServiceNow', zh: 'ServiceNow' },
  'PLTR': { en: 'Palantir', zh: 'Palantir' },
  'SNOW': { en: 'Snowflake', zh: 'Snowflake' },
  'MDB': { en: 'MongoDB', zh: 'MongoDB' },
  'PANW': { en: 'Palo Alto Networks', zh: '派拓网络' },
  'CRWD': { en: 'CrowdStrike', zh: 'CrowdStrike' },
  'ZS': { en: 'Zscaler', zh: 'Zscaler' },
  'DDOG': { en: 'Datadog', zh: 'Datadog' },
  'NET': { en: 'Cloudflare', zh: 'Cloudflare' },
  // Banks & Finance
  'JPM': { en: 'JPMorgan Chase', zh: '摩根大通' },
  'GS': { en: 'Goldman Sachs', zh: '高盛' },
  'MS': { en: 'Morgan Stanley', zh: '摩根士丹利' },
  'BAC': { en: 'Bank of America', zh: '美国银行' },
  'WFC': { en: 'Wells Fargo', zh: '富国银行' },
  'C': { en: 'Citigroup', zh: '花旗' },
  'BLK': { en: 'BlackRock', zh: '贝莱德' },
  'SCHW': { en: 'Charles Schwab', zh: '嘉信理财' },
  'AXP': { en: 'American Express', zh: '美国运通' },
  'BRK.B': { en: 'Berkshire Hathaway', zh: '伯克希尔' },
  // Payments & Fintech
  'V': { en: 'Visa Inc.', zh: 'Visa' },
  'MA': { en: 'Mastercard', zh: '万事达' },
  'PYPL': { en: 'PayPal', zh: 'PayPal' },
  'SQ': { en: 'Block Inc.', zh: 'Block' },
  'AFRM': { en: 'Affirm', zh: 'Affirm' },
  'FI': { en: 'Fiserv', zh: 'Fiserv' },
  'GPN': { en: 'Global Payments', zh: 'Global Payments' },
  // Consumer
  'COST': { en: 'Costco', zh: '好市多' },
  'WMT': { en: 'Walmart', zh: '沃尔玛' },
  'HD': { en: 'Home Depot', zh: '家得宝' },
  'MCD': { en: 'McDonald\'s', zh: '麦当劳' },
  'SBUX': { en: 'Starbucks', zh: '星巴克' },
  'NKE': { en: 'Nike', zh: '耐克' },
  'TGT': { en: 'Target', zh: 'Target' },
  'PG': { en: 'Procter & Gamble', zh: '宝洁' },
  'KO': { en: 'Coca-Cola', zh: '可口可乐' },
  'PEP': { en: 'PepsiCo', zh: '百事' },
  // Electric Vehicles
  'NIO': { en: 'NIO Inc.', zh: '蔚来' },
  'LI': { en: 'Li Auto Inc.', zh: '理想' },
  'XPEV': { en: 'XPeng Inc.', zh: '小鹏' },
  'RIVN': { en: 'Rivian', zh: 'Rivian' },
  'GM': { en: 'General Motors', zh: '通用汽车' },
  'F': { en: 'Ford Motor', zh: '福特' },
  'BYDDY': { en: 'BYD Company', zh: '比亚迪' },
  // Healthcare & Pharma
  'UNH': { en: 'UnitedHealth', zh: '联合健康' },
  'JNJ': { en: 'Johnson & Johnson', zh: '强生' },
  'LLY': { en: 'Eli Lilly', zh: '礼来' },
  'PFE': { en: 'Pfizer', zh: '辉瑞' },
  'ABBV': { en: 'AbbVie', zh: 'AbbVie' },
  'MRK': { en: 'Merck', zh: '默沙东' },
  'TMO': { en: 'Thermo Fisher', zh: '赛默飞' },
  'AMGN': { en: 'Amgen', zh: '安进' },
  'GILD': { en: 'Gilead Sciences', zh: '吉利德' },
  'ISRG': { en: 'Intuitive Surgical', zh: '直觉外科' },
  'BMY': { en: 'Bristol-Myers Squibb', zh: '百时美施贵宝' },
  // Energy & Oil
  'XOM': { en: 'Exxon Mobil', zh: '埃克森美孚' },
  'CVX': { en: 'Chevron Corp.', zh: '雪佛龙' },
  'COP': { en: 'ConocoPhillips', zh: '康菲石油' },
  'SLB': { en: 'Schlumberger', zh: '斯伦贝谢' },
  'EOG': { en: 'EOG Resources', zh: 'EOG' },
  'OXY': { en: 'Occidental Petroleum', zh: '西方石油' },
  'MPC': { en: 'Marathon Petroleum', zh: '马拉松石油' },
  'PSX': { en: 'Phillips 66', zh: 'Phillips 66' },
  'VLO': { en: 'Valero Energy', zh: 'Valero' },
  // Defense & Aerospace
  'LMT': { en: 'Lockheed Martin', zh: '洛克希德马丁' },
  'RTX': { en: 'RTX Corp.', zh: '雷神' },
  'NOC': { en: 'Northrop Grumman', zh: '诺斯罗普格鲁曼' },
  'GD': { en: 'General Dynamics', zh: '通用动力' },
  'BA': { en: 'Boeing', zh: '波音' },
  'LHX': { en: 'L3Harris Technologies', zh: 'L3Harris' },
  'HII': { en: 'Huntington Ingalls', zh: '亨廷顿英格尔斯' },
  'TDG': { en: 'TransDigm Group', zh: 'TransDigm' },
  // China ADRs
  'BABA': { en: 'Alibaba Group', zh: '阿里巴巴' },
  'PDD': { en: 'PDD Holdings', zh: '拼多多' },
  'JD': { en: 'JD.com Inc.', zh: '京东' },
  'BIDU': { en: 'Baidu Inc.', zh: '百度' },
  'TME': { en: 'Tencent Music', zh: '腾讯音乐' },
  'NTES': { en: 'NetEase', zh: '网易' },
  'BILI': { en: 'Bilibili', zh: '哔哩哔哩' },
  'FUTU': { en: 'Futu Holdings', zh: '富途' },
  'TIGR': { en: 'UP Fintech', zh: '老虎证券' },
  // Crypto & Blockchain
  'COIN': { en: 'Coinbase', zh: 'Coinbase' },
  'MSTR': { en: 'MicroStrategy', zh: 'MicroStrategy' },
  'MARA': { en: 'Marathon Digital', zh: 'Marathon' },
  'RIOT': { en: 'Riot Platforms', zh: 'Riot' },
  'HUT': { en: 'Hut 8 Corp.', zh: 'Hut 8' },
  'CLSK': { en: 'CleanSpark', zh: 'CleanSpark' },
  'BITF': { en: 'Bitfarms', zh: 'Bitfarms' },
  'HOOD': { en: 'Robinhood', zh: 'Robinhood' },
  // Streaming & Media
  'NFLX': { en: 'Netflix', zh: '奈飞' },
  'DIS': { en: 'Walt Disney', zh: '迪士尼' },
  'SPOT': { en: 'Spotify', zh: 'Spotify' },
  'WBD': { en: 'Warner Bros. Discovery', zh: '华纳兄弟' },
  'ROKU': { en: 'Roku Inc.', zh: 'Roku' },
  'RBLX': { en: 'Roblox', zh: 'Roblox' },
  'TTWO': { en: 'Take-Two Interactive', zh: 'Take-Two' },
  'EA': { en: 'Electronic Arts', zh: 'EA' },
  // Tech & Misc
  'UBER': { en: 'Uber Technologies', zh: 'Uber' },
  'ABNB': { en: 'Airbnb', zh: 'Airbnb' },
  'LCID': { en: 'Lucid Group', zh: 'Lucid' },
  // ETFs & Index Funds
  'SPY': { en: 'SPDR S&P 500 ETF', zh: '标普500 ETF' },
  'QQQ': { en: 'Invesco QQQ Trust', zh: '纳指100 ETF' },
  'VTI': { en: 'Vanguard Total Stock', zh: '全美股票 ETF' },
  'VXUS': { en: 'Vanguard Intl Stock', zh: '国际股票 ETF' },
  'BND': { en: 'Vanguard Total Bond', zh: '总债券 ETF' },
};

/**
 * Get Chinese display name for a symbol, with fallback.
 */
export function getStockDisplayName(symbol: string, fallback?: string): string {
  const info = STOCK_NAMES[symbol];
  return info?.zh || info?.en || fallback || symbol;
}

// Reviewed SEO sample aliases; English names stay English where no Chinese name is confirmed.
import seoSamples from './seo-samples.json';
for (const sample of seoSamples) {
  if (!STOCK_NAMES[sample.symbol]) STOCK_NAMES[sample.symbol] = {zh:sample.name,en:sample.symbol};
}
