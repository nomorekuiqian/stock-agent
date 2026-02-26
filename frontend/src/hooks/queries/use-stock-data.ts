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

export function useTechnicalSnapshot(symbol: string, enabled: boolean = false) {
  return useQuery({
    queryKey: queryKeys.stocks.technicalSnapshot(symbol),
    queryFn: async () => {
      const response = await fetch(`${API_BASE_URL}/stocks/${symbol}/technical-snapshot`);
      if (!response.ok) return null;
      const result = await response.json();
      return result.success ? result : null;
    },
    enabled: enabled && !!symbol,
    staleTime: 10 * 60 * 1000,  // 10 min
    gcTime: 30 * 60 * 1000,     // 30 min
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
