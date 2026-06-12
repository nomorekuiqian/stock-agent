export const queryKeys = {
  macro: {
    all: ['macro'] as const,
    economy: () => ['macro', 'economy'] as const,
    sentiment: () => ['macro', 'sentiment'] as const,
    inflationRates: () => ['macro', 'inflation-rates'] as const,
    cpiBreakdown: () => ['macro', 'cpi-breakdown'] as const,
    treasuryCommodities: () => ['macro', 'treasury-commodities'] as const,
    riskDashboard: () => ['macro', 'risk-dashboard'] as const,
  },
  liquidity: {
    all: ['liquidity'] as const,
    metrics: () => ['liquidity', 'metrics'] as const,
    history: (days: number) => ['liquidity', 'history', days] as const,
    global: () => ['liquidity', 'global'] as const,
    globalHistory: (days: number) => ['liquidity', 'global-history', days] as const,
  },
  weeklyReport: {
    all: ['weekly-report'] as const,
    latest: () => ['weekly-report', 'latest'] as const,
  },
  reports: {
    all: ['reports'] as const,
    list: (limit: number, offset: number) => ['reports', 'list', limit, offset] as const,
    latest: () => ['reports', 'latest'] as const,
    byId: (id: string) => ['reports', id] as const,
    byDate: (date: string) => ['reports', 'date', date] as const,
  },
  stocks: {
    all: ['stocks'] as const,
    quotes: (symbols: string[]) => ['stocks', 'quotes', symbols.sort().join(',')] as const,
    profile: (symbol: string) => ['stocks', 'profile', symbol] as const,
    detail: (symbol: string) => ['stocks', 'detail', symbol] as const,
    priceHistory: (symbol: string, days: number) => ['stocks', 'price-history', symbol, days] as const,
    valuation: (symbol: string) => ['stocks', 'valuation', symbol] as const,
    analysis: (symbol: string) => ['stocks', 'analysis', symbol] as const,
    technical: (symbol: string) => ['stocks', 'technical', symbol] as const,
    newsAnalysis: (symbol: string) => ['stocks', 'news-analysis', symbol] as const,
    macroAnalysis: (symbol: string) => ['stocks', 'macro-analysis', symbol] as const,
    earningsData: (symbol: string) => ['stocks', 'earnings-data', symbol] as const,
    earningsAnalysis: (symbol: string) => ['stocks', 'earnings-analysis', symbol] as const,
    newsFeed: (symbol: string, days: number) => ['stocks', 'news-feed', symbol, days] as const,
    insiderTrading: (symbol: string) => ['stocks', 'insider-trading', symbol] as const,
    technicalData: (symbol: string, timeframe: string) => ['stocks', 'technical-data', symbol, timeframe] as const,
    marketOverview: (symbol: string) => ['stocks', 'market-overview', symbol] as const,
    pressReleases: (symbol: string, limit: number) => ['stocks', 'press-releases', symbol, limit] as const,
    marketAnalysis: (symbol: string) => ['stocks', 'market-analysis', symbol] as const,
  },
  watchlist: {
    all: ['watchlist'] as const,
    byUser: (userId: string) => ['watchlist', userId] as const,
  },
  portfolio: {
    all: ['portfolio'] as const,
    byUser: (userId: string) => ['portfolio', userId] as const,
  },
  investmentProfile: {
    all: ['investment-profile'] as const,
    byUser: (userId: string) => ['investment-profile', userId] as const,
  },
  actionBar: {
    all: ['action-bar'] as const,
    current: () => ['action-bar', 'current'] as const,
  },
  health: {
    all: ['health'] as const,
    latest: () => ['health', 'latest'] as const,
    report: () => ['health', 'report'] as const,
  },
  morningReports: {
    all: ['morning-reports'] as const,
    list: (limit: number, offset: number) => ['morning-reports', 'list', limit, offset] as const,
    latest: () => ['morning-reports', 'latest'] as const,
    byId: (id: string) => ['morning-reports', id] as const,
    byDate: (date: string) => ['morning-reports', 'date', date] as const,
  },
  digests: {
    all: ['digests'] as const,
    list: (limit: number, offset: number) => ['digests', 'list', limit, offset] as const,
    byId: (id: string) => ['digests', id] as const,
  },
  screener: {
    all: ['screener'] as const,
    filter: (key: string) => ['screener', 'filter', key] as const,
    sectors: () => ['screener', 'sectors'] as const,
    status: () => ['screener', 'status'] as const,
  },
  research: {
    all: ['research'] as const,
    conversations: (userId: string, pageSize: number, search = '') => (
      search
        ? ['research', 'conversations', userId, pageSize, search] as const
        : ['research', 'conversations', userId, pageSize] as const
    ),
  },
  subscriptions: {
    all: ['subscriptions'] as const,
    preferences: () => ['subscriptions', 'preferences'] as const,
  },
  entitlements: {
    all: ['entitlements'] as const,
    me: () => ['entitlements', 'me'] as const,
  },
  subscriptionStatus: {
    all: ['subscription-status'] as const,
    byUser: (userId: string) => ['subscription-status', userId] as const,
  },
  featureFlags: {
    all: ['feature-flags'] as const,
  },
  kol: {
    all: ['kol'] as const,
    profile: (username: string) => ['kol', username, 'profile'] as const,
    tickers: (username: string) => ['kol', username, 'tickers'] as const,
    topics: (username: string) => ['kol', username, 'topics'] as const,
    feed: (
      username: string,
      sector: string | null,
      ticker: string | null,
      limit: number,
      offset: number,
      topic: string | null = null,
    ) => ['kol', username, 'feed', { sector, ticker, topic, limit, offset }] as const,
    sectors: (username: string) => ['kol', username, 'sectors'] as const,
    sectorDetail: (username: string, sectorKey: string) =>
      ['kol', username, 'sector', sectorKey] as const,
    industryChain: (username: string, boardKey: string) =>
      ['kol', username, 'industry-chain', boardKey] as const,
    tickerDetail: (username: string, ticker: string) =>
      ['kol', username, 'ticker', ticker] as const,
    tickerTimeline: (username: string, ticker: string) =>
      ['kol', username, 'ticker-timeline', ticker] as const,
    evidenceTweets: (username: string, ids: string[]) =>
      ['kol', username, 'evidence-tweets', ids.join(',')] as const,
    highConviction: (username: string) =>
      ['kol', username, 'high-conviction'] as const,
  },
};
