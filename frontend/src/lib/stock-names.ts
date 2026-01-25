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
  // AI Infrastructure
  'AMD': { en: 'AMD Inc.', zh: 'AMD' },
  'INTC': { en: 'Intel Corp.', zh: '英特尔' },
  'AVGO': { en: 'Broadcom Inc.', zh: '博通' },
  'TSM': { en: 'TSMC', zh: '台积电' },
  'ARM': { en: 'Arm Holdings', zh: 'Arm' },
  'MRVL': { en: 'Marvell Technology', zh: 'Marvell' },
  'ASML': { en: 'ASML Holding', zh: 'ASML' },
  // Enterprise Software
  'CRM': { en: 'Salesforce', zh: 'Salesforce' },
  'ORCL': { en: 'Oracle Corp.', zh: '甲骨文' },
  'ADBE': { en: 'Adobe Inc.', zh: 'Adobe' },
  'NOW': { en: 'ServiceNow', zh: 'ServiceNow' },
  'PLTR': { en: 'Palantir', zh: 'Palantir' },
  // Banks & Payments
  'JPM': { en: 'JPMorgan Chase', zh: '摩根大通' },
  'GS': { en: 'Goldman Sachs', zh: '高盛' },
  'MS': { en: 'Morgan Stanley', zh: '摩根士丹利' },
  'V': { en: 'Visa Inc.', zh: 'Visa' },
  'MA': { en: 'Mastercard', zh: '万事达' },
  'BAC': { en: 'Bank of America', zh: '美国银行' },
  'WFC': { en: 'Wells Fargo', zh: '富国银行' },
  'BRK.B': { en: 'Berkshire Hathaway', zh: '伯克希尔' },
  // China ADRs
  'BABA': { en: 'Alibaba Group', zh: '阿里巴巴' },
  'PDD': { en: 'PDD Holdings', zh: '拼多多' },
  'JD': { en: 'JD.com Inc.', zh: '京东' },
  'BIDU': { en: 'Baidu Inc.', zh: '百度' },
  'NIO': { en: 'NIO Inc.', zh: '蔚来' },
  'LI': { en: 'Li Auto Inc.', zh: '理想' },
  'XPEV': { en: 'XPeng Inc.', zh: '小鹏' },
  // Consumer & Healthcare
  'COST': { en: 'Costco', zh: '好市多' },
  'LLY': { en: 'Eli Lilly', zh: '礼来' },
  'UNH': { en: 'UnitedHealth', zh: '联合健康' },
  'NFLX': { en: 'Netflix', zh: '奈飞' },
  'MCD': { en: 'McDonald\'s', zh: '麦当劳' },
  'JNJ': { en: 'Johnson & Johnson', zh: '强生' },
  'XOM': { en: 'Exxon Mobil', zh: '埃克森美孚' },
  'CVX': { en: 'Chevron Corp.', zh: '雪佛龙' },
  'WMT': { en: 'Walmart', zh: '沃尔玛' },
  'HD': { en: 'Home Depot', zh: '家得宝' },
  'SBUX': { en: 'Starbucks', zh: '星巴克' },
  'DIS': { en: 'Walt Disney', zh: '迪士尼' },
  // Tech & Misc
  'COIN': { en: 'Coinbase', zh: 'Coinbase' },
  'SNOW': { en: 'Snowflake', zh: 'Snowflake' },
  'UBER': { en: 'Uber Technologies', zh: 'Uber' },
  'ABNB': { en: 'Airbnb', zh: 'Airbnb' },
};

/**
 * Get Chinese display name for a symbol, with fallback.
 */
export function getStockDisplayName(symbol: string, fallback?: string): string {
  const info = STOCK_NAMES[symbol];
  return info?.zh || info?.en || fallback || symbol;
}
