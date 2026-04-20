import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from './query-keys';

// FRED data updates weekly (some daily) — 30 min stale is safe and reduces
// redundant API calls / FRED rate-limit pressure.
const LIQUIDITY_STALE_TIME = 30 * 60 * 1000;  // 30 min
const LIQUIDITY_GC_TIME = 2 * 60 * 60 * 1000; // 2 hours

export function useLiquidityMetrics() {
  return useQuery({
    queryKey: queryKeys.liquidity.metrics(),
    queryFn: () => api.getLiquidityMetrics(),
    staleTime: LIQUIDITY_STALE_TIME,
    gcTime: LIQUIDITY_GC_TIME,
  });
}

export function useLiquidityHistory(days: number = 365) {
  return useQuery({
    queryKey: queryKeys.liquidity.history(days),
    queryFn: () => api.getLiquidityHistory(days),
    staleTime: LIQUIDITY_STALE_TIME,
    gcTime: LIQUIDITY_GC_TIME,
  });
}

export function useGlobalLiquidity(enabled: boolean = true) {
  return useQuery({
    queryKey: queryKeys.liquidity.global(),
    queryFn: () => api.getGlobalLiquidity(),
    staleTime: LIQUIDITY_STALE_TIME,
    gcTime: LIQUIDITY_GC_TIME,
    enabled,
  });
}

export function useGlobalLiquidityHistory(days: number = 365, enabled: boolean = true) {
  return useQuery({
    queryKey: queryKeys.liquidity.globalHistory(days),
    queryFn: () => api.getGlobalLiquidityHistory(days),
    staleTime: LIQUIDITY_STALE_TIME,
    gcTime: LIQUIDITY_GC_TIME,
    enabled,
  });
}
