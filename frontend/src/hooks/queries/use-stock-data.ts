import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from './query-keys';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

export function useStockQuotes(symbols: string[]) {
  return useQuery({
    queryKey: queryKeys.stocks.quotes(symbols),
    queryFn: () => api.getStockQuotes(symbols),
    enabled: symbols.length > 0,
    staleTime: 1 * 60 * 1000,  // 1 min
    gcTime: 5 * 60 * 1000,     // 5 min
  });
}

export function useStockProfile(symbol: string) {
  return useQuery({
    queryKey: queryKeys.stocks.profile(symbol),
    queryFn: async () => {
      const response = await fetch(`${API_BASE_URL}/stocks/${symbol}/profile`);
      if (!response.ok) return null;
      const result = await response.json();
      return result.success && result.profile ? result.profile : null;
    },
    enabled: !!symbol,
    staleTime: 10 * 60 * 1000,  // 10 min
    gcTime: 30 * 60 * 1000,     // 30 min
  });
}

export function useStockDetail(symbol: string) {
  return useQuery({
    queryKey: queryKeys.stocks.detail(symbol),
    queryFn: async () => {
      const response = await fetch(`${API_BASE_URL}/stocks/${symbol}`);
      if (!response.ok) throw new Error(`Failed to fetch stock data: ${response.status}`);
      return response.json();
    },
    enabled: !!symbol,
    staleTime: 10 * 60 * 1000,  // 10 min
    gcTime: 30 * 60 * 1000,     // 30 min
  });
}

export function usePriceHistory(symbol: string, days: number = 1825) {
  return useQuery({
    queryKey: queryKeys.stocks.priceHistory(symbol, days),
    queryFn: async () => {
      const response = await fetch(`${API_BASE_URL}/stocks/${symbol}/history?days=${days}`);
      if (!response.ok) throw new Error(`Failed to fetch price history: ${response.status}`);
      const result = await response.json();
      return result.data || [];
    },
    enabled: !!symbol,
    staleTime: 15 * 60 * 1000,  // 15 min
    gcTime: 60 * 60 * 1000,     // 1 hour
  });
}

export function useValuationComparison(symbol: string) {
  return useQuery({
    queryKey: queryKeys.stocks.valuation(symbol),
    queryFn: async () => {
      const response = await fetch(`${API_BASE_URL}/stocks/${symbol}/valuation`);
      if (!response.ok) return null;
      const result = await response.json();
      return result.success ? result : null;
    },
    enabled: !!symbol,
    staleTime: 10 * 60 * 1000,  // 10 min
    gcTime: 30 * 60 * 1000,     // 30 min
  });
}

// Auto-fetch cached analysis on page load (GET, no AI generation)
export function useStockAnalysisCache(symbol: string) {
  return useQuery({
    queryKey: queryKeys.stocks.analysis(symbol),
    queryFn: async () => {
      const response = await fetch(`${API_BASE_URL}/stocks/${symbol}/analysis/cache`);
      if (!response.ok) return null;
      const result = await response.json();
      return result.success ? result.analysis : null;
    },
    enabled: !!symbol,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });
}

export function useGenerateStockAnalysis(symbol: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ force = false }: { force?: boolean } = {}) => {
      const response = await fetch(`${API_BASE_URL}/stocks/${symbol}/analysis?force=${force}`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error(`Failed to generate analysis: ${response.status}`);
      const result = await response.json();
      return result.success ? result.analysis : null;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.stocks.analysis(symbol), data);
    },
  });
}

export function useGenerateTechnicalAnalysis(symbol: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ force = false, timeframe = 'daily' }: { force?: boolean; timeframe?: string } = {}) => {
      const response = await fetch(
        `${API_BASE_URL}/stocks/${symbol}/technical?force=${force}&timeframe=${timeframe}`,
        { method: 'POST' }
      );
      if (!response.ok) throw new Error(`Failed to generate technical analysis: ${response.status}`);
      const result = await response.json();
      return result.success ? result.analysis : null;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.stocks.technical(symbol), data);
    },
  });
}

export function useGenerateNewsAnalysis(symbol: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ force = false }: { force?: boolean } = {}) => {
      const response = await fetch(`${API_BASE_URL}/stocks/${symbol}/news?force=${force}`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error(`Failed to generate news analysis: ${response.status}`);
      const result = await response.json();
      return result.success ? result.analysis : null;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.stocks.newsAnalysis(symbol), data);
    },
  });
}

export function useGenerateMacroAnalysis(symbol: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ force = false }: { force?: boolean } = {}) => {
      const response = await fetch(`${API_BASE_URL}/stocks/${symbol}/macro?force=${force}`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error(`Failed to generate macro analysis: ${response.status}`);
      const result = await response.json();
      return result.success ? result.analysis : null;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.stocks.macroAnalysis(symbol), data);
    },
  });
}

export function useEarningsData(symbol: string) {
  return useQuery({
    queryKey: queryKeys.stocks.earningsData(symbol),
    queryFn: async () => {
      const response = await fetch(`${API_BASE_URL}/stocks/${symbol}/earnings-data`);
      if (!response.ok) throw new Error(`Failed to fetch earnings data: ${response.status}`);
      return response.json();
    },
    enabled: !!symbol,
    staleTime: 30 * 60 * 1000,  // 30 min
    gcTime: 60 * 60 * 1000,     // 1 hour
  });
}

export function useTranscript(symbol: string, year: number | null, quarter: number | null) {
  return useQuery({
    queryKey: ['transcript', symbol, year, quarter],
    queryFn: async () => {
      const response = await fetch(
        `${API_BASE_URL}/stocks/${symbol}/transcript?year=${year}&quarter=${quarter}`
      );
      if (!response.ok) throw new Error(`Failed to fetch transcript: ${response.status}`);
      return response.json() as Promise<{
        symbol: string;
        year: number;
        quarter: number;
        content: string;
        available: boolean;
      }>;
    },
    enabled: !!symbol && year !== null && quarter !== null,
    staleTime: Infinity,  // Transcripts never change
    gcTime: 24 * 60 * 60 * 1000,  // 24 hours
  });
}

export function useGenerateEarningsAnalysis(symbol: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ force = false }: { force?: boolean } = {}) => {
      const response = await fetch(`${API_BASE_URL}/stocks/${symbol}/earnings?force=${force}`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error(`Failed to generate earnings analysis: ${response.status}`);
      const result = await response.json();
      return result.success ? result.analysis : null;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.stocks.earningsAnalysis(symbol), data);
    },
  });
}

export function useNewsFeed(symbol: string, days: number = 7) {
  return useQuery({
    queryKey: queryKeys.stocks.newsFeed(symbol, days),
    queryFn: async () => {
      const response = await fetch(`${API_BASE_URL}/stocks/${symbol}/news-feed?days=${days}`);
      if (!response.ok) throw new Error(`Failed to fetch news feed: ${response.status}`);
      return response.json();
    },
    enabled: !!symbol,
    staleTime: 15 * 60 * 1000,  // 15 min
    gcTime: 30 * 60 * 1000,     // 30 min
  });
}

export function useInsiderTrading(symbol: string) {
  return useQuery({
    queryKey: queryKeys.stocks.insiderTrading(symbol),
    queryFn: async () => {
      const response = await fetch(`${API_BASE_URL}/stocks/${symbol}/insider-trading`);
      if (!response.ok) throw new Error(`Failed to fetch insider trading: ${response.status}`);
      return response.json();
    },
    enabled: !!symbol,
    staleTime: 30 * 60 * 1000,  // 30 min
    gcTime: 60 * 60 * 1000,     // 1 hour
  });
}

// =============================================================================
// Market Tab revamp — Phase 1 / 2 hooks
// =============================================================================

export interface AnalystGradeSummary {
  strong_buy: number;
  buy: number;
  hold: number;
  sell: number;
  strong_sell: number;
  consensus: string;
  total: number;
}

export interface AnalystPriceTarget {
  low: number | null;
  average: number | null;
  median: number | null;
  high: number | null;
  last_month_avg: number | null;
  last_month_count: number;
  last_quarter_avg: number | null;
  last_quarter_count: number;
  last_year_avg: number | null;
  last_year_count: number;
  all_time_avg: number | null;
  all_time_count: number;
}

export interface AnalystGradeChange {
  date: string;
  firm: string;
  previous_grade: string | null;
  new_grade: string;
  action: string;  // "upgrade" | "downgrade" | "maintain" | "initialise"
}

export interface AnalystHistoricalPoint {
  date: string;
  strong_buy: number;
  buy: number;
  hold: number;
  sell: number;
  strong_sell: number;
}

export interface AnalystActivityResponse {
  success: boolean;
  symbol: string;
  summary: AnalystGradeSummary;
  price_target: AnalystPriceTarget;
  grade_changes: AnalystGradeChange[];
  historical_timeline: AnalystHistoricalPoint[];
}

export function useAnalystActivity(symbol: string) {
  return useQuery<AnalystActivityResponse>({
    queryKey: queryKeys.stocks.analystActivity(symbol),
    queryFn: async () => {
      const response = await fetch(`${API_BASE_URL}/stocks/${symbol}/analyst-activity`);
      if (!response.ok) throw new Error(`Failed to fetch analyst activity: ${response.status}`);
      return response.json();
    },
    enabled: !!symbol,
    staleTime: 30 * 60 * 1000,  // 30 min
    gcTime: 60 * 60 * 1000,     // 1 hour
  });
}

export interface MarketOverviewResponse {
  success: boolean;
  symbol: string;
  header: {
    next_earnings: { date: string; days_until: number | null; eps_estimate: number | null } | null;
    market_badges: {
      gainers_rank: number | null;
      losers_rank: number | null;
      most_active_rank: number | null;
    };
  };
  kpis: {
    news_24h: number;
    grade_changes_7d: number;
    target_consensus: number | null;
    current_price: number | null;
    target_upside_pct: number | null;
    sector_relative_perf_today: number | null;
    stock_sector: string | null;
  };
  market_heat: {
    rankings: {
      gainers_rank: number | null;
      losers_rank: number | null;
      most_active_rank: number | null;
    };
    sector_perf: {
      sector_name: string | null;
      stock_change_today_pct: number | null;
      sector_avg_today_pct: number | null;
    };
  };
  peers_comparison: Array<{
    symbol: string;
    name: string;
    price: number | null;
    change_pct_today: number | null;
  }>;
}

export function useMarketOverview(symbol: string) {
  return useQuery<MarketOverviewResponse>({
    queryKey: queryKeys.stocks.marketOverview(symbol),
    queryFn: async () => {
      const response = await fetch(`${API_BASE_URL}/stocks/${symbol}/market-overview`);
      if (!response.ok) throw new Error(`Failed to fetch market overview: ${response.status}`);
      return response.json();
    },
    enabled: !!symbol,
    staleTime: 10 * 60 * 1000,  // 10 min
    gcTime: 30 * 60 * 1000,
  });
}

export interface PressRelease {
  symbol: string;
  published_date: string;
  publisher: string;
  title: string;
  image: string;
  site: string;
  url: string;
  preview: string;
}

export interface PressReleasesResponse {
  success: boolean;
  symbol: string;
  count: number;
  releases: PressRelease[];
}

export function usePressReleases(symbol: string, limit: number = 30) {
  return useQuery<PressReleasesResponse>({
    queryKey: queryKeys.stocks.pressReleases(symbol, limit),
    queryFn: async () => {
      const response = await fetch(`${API_BASE_URL}/stocks/${symbol}/press-releases?limit=${limit}`);
      if (!response.ok) throw new Error(`Failed to fetch press releases: ${response.status}`);
      return response.json();
    },
    enabled: !!symbol,
    staleTime: 15 * 60 * 1000,  // 15 min
    gcTime: 30 * 60 * 1000,
  });
}
