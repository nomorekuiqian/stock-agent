import { useQuery } from '@tanstack/react-query';
import { api, ActionBarResponse } from '@/lib/api';
import { queryKeys } from './query-keys';

export function useActionBar(enabled: boolean = true) {
  return useQuery<ActionBarResponse>({
    queryKey: queryKeys.actionBar.current(),
    queryFn: () => api.forYou.getActionBar(),
    enabled,
    staleTime: 60 * 1000,        // 60s stale time
    gcTime: 5 * 60 * 1000,       // 5 min gc
    retry: 1,
    refetchOnWindowFocus: true,
  });
}
