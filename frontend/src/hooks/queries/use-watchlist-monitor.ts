import { useQuery } from '@tanstack/react-query';
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
