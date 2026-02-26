import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from './query-keys';

const MACRO_STALE_TIME = 10 * 60 * 1000;  // 10 min
const MACRO_GC_TIME = 60 * 60 * 1000;     // 1 hour

export function useEconomicFundamentals() {
  return useQuery({
    queryKey: queryKeys.macro.economy(),
    queryFn: () => api.getEconomicFundamentals(),
    staleTime: MACRO_STALE_TIME,
    gcTime: MACRO_GC_TIME,
  });
}

export function useMarketSentiment() {
  return useQuery({
    queryKey: queryKeys.macro.sentiment(),
    queryFn: () => api.getMarketSentiment(),
    staleTime: MACRO_STALE_TIME,
    gcTime: MACRO_GC_TIME,
  });
}

export function useInflationRates() {
  return useQuery({
    queryKey: queryKeys.macro.inflationRates(),
    queryFn: () => api.getInflationRates(),
    staleTime: MACRO_STALE_TIME,
    gcTime: MACRO_GC_TIME,
  });
}

export function useCpiBreakdown() {
  return useQuery({
    queryKey: queryKeys.macro.cpiBreakdown(),
    queryFn: () => api.getCpiBreakdown(),
    staleTime: MACRO_STALE_TIME,
    gcTime: MACRO_GC_TIME,
  });
}

export function useTreasuryCommodities() {
  return useQuery({
    queryKey: queryKeys.macro.treasuryCommodities(),
    queryFn: () => api.getTreasuryCommodities(),
    staleTime: MACRO_STALE_TIME,
    gcTime: MACRO_GC_TIME,
  });
}

export function useMacroRiskDashboard() {
  return useQuery({
    queryKey: queryKeys.macro.riskDashboard(),
    queryFn: () => api.getMacroRiskDashboard(),
    staleTime: MACRO_STALE_TIME,
    gcTime: MACRO_GC_TIME,
  });
}
