import { isFeaturePaused } from '@/lib/feature-pause';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, HealthResponse, HealthLatestResponse } from '@/lib/api';
import { queryKeys } from './query-keys';

export function useHealthLatest(enabled: boolean = true) {
  return useQuery<HealthLatestResponse>({
    queryKey: queryKeys.health.latest(),
    queryFn: () => api.forYou.getHealthLatest(),
    enabled: enabled && !isFeaturePaused('portfolio_health'),
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}

export function useHealthReport(enabled: boolean = true) {
  return useQuery<HealthResponse>({
    queryKey: queryKeys.health.report(),
    queryFn: () => api.forYou.generateHealthCheck(false),
    enabled: enabled && !isFeaturePaused('portfolio_health'),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });
}

export function useGenerateHealthCheck() {
  const queryClient = useQueryClient();
  return useMutation<HealthResponse, Error, { force?: boolean }>({
    mutationFn: ({ force = false }) => {
      if (isFeaturePaused('portfolio_health')) return Promise.reject(new Error('该功能暂时停用'));
      return api.forYou.generateHealthCheck(force);
    },
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.health.report(), data);
      queryClient.invalidateQueries({ queryKey: queryKeys.health.latest() });
      queryClient.invalidateQueries({ queryKey: queryKeys.actionBar.all });
    },
  });
}
