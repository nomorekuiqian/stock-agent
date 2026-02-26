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
    technicalSnapshot: (symbol: string) => ['stocks', 'technical-snapshot', symbol] as const,
  },
  watchlist: {
    all: ['watchlist'] as const,
  },
  digests: {
    all: ['digests'] as const,
    list: (limit: number, offset: number) => ['digests', 'list', limit, offset] as const,
    byId: (id: string) => ['digests', id] as const,
  },
};
