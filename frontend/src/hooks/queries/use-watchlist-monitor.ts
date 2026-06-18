import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from './query-keys';

export function useWatchlistMonitor(userId?: string, enabled: boolean = true) {
  return useQuery({
    queryKey: queryKeys.watchlistMonitor.current(userId || ''),
    queryFn: () => api.getWatchlistMonitor(),
    enabled: enabled && !!userId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useBackfillWatchlistMonitor(userId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (symbols?: string[]) => api.backfillWatchlistMonitor(symbols),
    onSuccess: async () => {
      if (!userId) return;
      await queryClient.invalidateQueries({
        queryKey: queryKeys.watchlistMonitor.current(userId),
      });
    },
  });
}
