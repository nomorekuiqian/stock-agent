import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, HealthResponse, HealthLatestResponse } from '@/lib/api';
import { queryKeys } from './query-keys';

export function useHealthLatest(enabled: boolean = true) {
  return useQuery<HealthLatestResponse>({
    queryKey: queryKeys.health.latest(),
    queryFn: () => api.forYou.getHealthLatest(),
    enabled,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}

export function useHealthReport(enabled: boolean = true) {
  return useQuery<HealthResponse>({
    queryKey: queryKeys.health.report(),
    queryFn: () => api.forYou.generateHealthCheck(false),
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });
}

export function useGenerateHealthCheck() {
  const queryClient = useQueryClient();
  return useMutation<HealthResponse, Error, { force?: boolean }>({
    mutationFn: ({ force = false }) => api.forYou.generateHealthCheck(force),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.health.report(), data);
      queryClient.invalidateQueries({ queryKey: queryKeys.health.latest() });
      queryClient.invalidateQueries({ queryKey: queryKeys.actionBar.all });
    },
  });
}
