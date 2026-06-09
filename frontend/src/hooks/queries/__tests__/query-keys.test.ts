import { describe, it, expect } from 'vitest';
import { queryKeys } from '../query-keys';

describe('queryKeys', () => {
  describe('macro', () => {
    it('all is a static array', () => {
      expect(queryKeys.macro.all).toEqual(['macro']);
    });

    it.each([
      ['economy', ['macro', 'economy']],
      ['sentiment', ['macro', 'sentiment']],
      ['inflationRates', ['macro', 'inflation-rates']],
      ['cpiBreakdown', ['macro', 'cpi-breakdown']],
      ['treasuryCommodities', ['macro', 'treasury-commodities']],
      ['riskDashboard', ['macro', 'risk-dashboard']],
    ] as const)('%s() returns correct key', (method, expected) => {
      expect(queryKeys.macro[method]()).toEqual(expected);
    });
  });

  describe('liquidity', () => {
    it('all is a static array', () => {
      expect(queryKeys.liquidity.all).toEqual(['liquidity']);
    });

    it('metrics() returns correct key', () => {
      expect(queryKeys.liquidity.metrics()).toEqual(['liquidity', 'metrics']);
    });

    it('history(days) includes days parameter', () => {
      expect(queryKeys.liquidity.history(365)).toEqual(['liquidity', 'history', 365]);
      expect(queryKeys.liquidity.history(30)).toEqual(['liquidity', 'history', 30]);
    });

    it('global() returns correct key', () => {
      expect(queryKeys.liquidity.global()).toEqual(['liquidity', 'global']);
    });

    it('globalHistory(days) includes days parameter', () => {
      expect(queryKeys.liquidity.globalHistory(365)).toEqual(['liquidity', 'global-history', 365]);
    });
  });

  describe('weeklyReport', () => {
    it('all is a static array', () => {
      expect(queryKeys.weeklyReport.all).toEqual(['weekly-report']);
    });

    it('latest() returns correct key', () => {
      expect(queryKeys.weeklyReport.latest()).toEqual(['weekly-report', 'latest']);
    });
  });

  describe('reports', () => {
    it('all is a static array', () => {
      expect(queryKeys.reports.all).toEqual(['reports']);
    });

    it('list(limit, offset) includes pagination params', () => {
      expect(queryKeys.reports.list(20, 0)).toEqual(['reports', 'list', 20, 0]);
      expect(queryKeys.reports.list(10, 30)).toEqual(['reports', 'list', 10, 30]);
    });

    it('latest() returns correct key', () => {
      expect(queryKeys.reports.latest()).toEqual(['reports', 'latest']);
    });

    it('byId(id) includes the id', () => {
      expect(queryKeys.reports.byId('abc-123')).toEqual(['reports', 'abc-123']);
    });

    it('byDate(date) includes the date', () => {
      expect(queryKeys.reports.byDate('2026-02-26')).toEqual(['reports', 'date', '2026-02-26']);
    });
  });

  describe('stocks', () => {
    it('all is a static array', () => {
      expect(queryKeys.stocks.all).toEqual(['stocks']);
    });

    it('quotes() sorts symbols for stable cache keys', () => {
      const key1 = queryKeys.stocks.quotes(['GOOGL', 'AAPL', 'MSFT']);
      const key2 = queryKeys.stocks.quotes(['MSFT', 'AAPL', 'GOOGL']);
      expect(key1).toEqual(key2);
      expect(key1).toEqual(['stocks', 'quotes', 'AAPL,GOOGL,MSFT']);
    });

    it('quotes() handles empty array', () => {
      expect(queryKeys.stocks.quotes([])).toEqual(['stocks', 'quotes', '']);
    });

    it('quotes() handles single symbol', () => {
      expect(queryKeys.stocks.quotes(['AAPL'])).toEqual(['stocks', 'quotes', 'AAPL']);
    });

    it('profile(symbol) includes symbol', () => {
      expect(queryKeys.stocks.profile('AAPL')).toEqual(['stocks', 'profile', 'AAPL']);
    });

    it('detail(symbol) includes symbol', () => {
      expect(queryKeys.stocks.detail('TSLA')).toEqual(['stocks', 'detail', 'TSLA']);
    });

    it('priceHistory(symbol, days) includes both params', () => {
      expect(queryKeys.stocks.priceHistory('NVDA', 1825)).toEqual(['stocks', 'price-history', 'NVDA', 1825]);
    });

    it('valuation(symbol) includes symbol', () => {
      expect(queryKeys.stocks.valuation('META')).toEqual(['stocks', 'valuation', 'META']);
    });

    it('analysis(symbol) includes symbol', () => {
      expect(queryKeys.stocks.analysis('AMZN')).toEqual(['stocks', 'analysis', 'AMZN']);
    });

    it('technical(symbol) includes symbol', () => {
      expect(queryKeys.stocks.technical('BABA')).toEqual(['stocks', 'technical', 'BABA']);
    });

    it('earningsData(symbol) includes symbol', () => {
      expect(queryKeys.stocks.earningsData('AAPL')).toEqual(['stocks', 'earnings-data', 'AAPL']);
    });

    it('earningsAnalysis(symbol) includes symbol', () => {
      expect(queryKeys.stocks.earningsAnalysis('MSFT')).toEqual(['stocks', 'earnings-analysis', 'MSFT']);
    });

    it('newsFeed(symbol, days) includes both params', () => {
      expect(queryKeys.stocks.newsFeed('NVDA', 7)).toEqual(['stocks', 'news-feed', 'NVDA', 7]);
      expect(queryKeys.stocks.newsFeed('TSLA', 14)).toEqual(['stocks', 'news-feed', 'TSLA', 14]);
    });

    it('insiderTrading(symbol) includes symbol', () => {
      expect(queryKeys.stocks.insiderTrading('GOOGL')).toEqual(['stocks', 'insider-trading', 'GOOGL']);
    });
  });

  describe('watchlist', () => {
    it('all is a static array', () => {
      expect(queryKeys.watchlist.all).toEqual(['watchlist']);
    });

    it('byUser(userId) includes user id for cache isolation', () => {
      expect(queryKeys.watchlist.byUser('user-123')).toEqual(['watchlist', 'user-123']);
    });
  });

  describe('digests', () => {
    it('all is a static array', () => {
      expect(queryKeys.digests.all).toEqual(['digests']);
    });

    it('list(limit, offset) includes pagination params', () => {
      expect(queryKeys.digests.list(10, 0)).toEqual(['digests', 'list', 10, 0]);
    });

    it('byId(id) includes the id', () => {
      expect(queryKeys.digests.byId('xyz-789')).toEqual(['digests', 'xyz-789']);
    });
  });

  describe('research', () => {
    it('conversations(userId, pageSize) includes user id and page size', () => {
      expect(queryKeys.research.conversations('user-123', 20)).toEqual([
        'research',
        'conversations',
        'user-123',
        20,
      ]);
    });
  });

  describe('kol', () => {
    it('highConviction(username) includes persona username', () => {
      expect(queryKeys.kol.highConviction('aleabitoreddit')).toEqual([
        'kol',
        'aleabitoreddit',
        'high-conviction',
      ]);
    });
  });
});
