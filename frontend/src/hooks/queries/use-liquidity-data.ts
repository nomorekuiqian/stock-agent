import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from './query-keys';

const LIQUIDITY_STALE_TIME = 10 * 60 * 1000;  // 10 min
const LIQUIDITY_GC_TIME = 60 * 60 * 1000;     // 1 hour

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

export function useGlobalLiquidity() {
  return useQuery({
    queryKey: queryKeys.liquidity.global(),
    queryFn: () => api.getGlobalLiquidity(),
    staleTime: LIQUIDITY_STALE_TIME,
    gcTime: LIQUIDITY_GC_TIME,
  });
}

export function useGlobalLiquidityHistory(days: number = 365) {
  return useQuery({
    queryKey: queryKeys.liquidity.globalHistory(days),
    queryFn: () => api.getGlobalLiquidityHistory(days),
    staleTime: LIQUIDITY_STALE_TIME,
    gcTime: LIQUIDITY_GC_TIME,
  });
}
