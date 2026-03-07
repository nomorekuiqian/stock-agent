import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, WatchlistData } from '@/lib/api';
import { queryKeys } from './query-keys';

export function useWatchlist(userId?: string, enabled: boolean = true) {
  return useQuery({
    queryKey: queryKeys.watchlist.byUser(userId || ''),
    queryFn: () => api.watchlist.get(),
    enabled: enabled && !!userId,
    staleTime: Infinity,
    gcTime: 10 * 60 * 1000,  // 10 min
  });
}

export function useSaveWatchlist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      userId,
      symbols,
      email,
      baseUpdatedAt,
    }: {
      userId: string;
      symbols: string[];
      email?: string;
      baseUpdatedAt?: string;
    }) => api.watchlist.save(userId, symbols, email, baseUpdatedAt),
    onMutate: async ({ userId, symbols, baseUpdatedAt }) => {
      const key = queryKeys.watchlist.byUser(userId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<WatchlistData | null>(key);
      queryClient.setQueryData<WatchlistData | null>(key, (old) =>
        old ? { ...old, symbols } : { user_id: userId, symbols, updated_at: baseUpdatedAt }
      );
      return { previous, key };
    },
    onSuccess: (data, vars) => {
      if (data.data) {
        queryClient.setQueryData(queryKeys.watchlist.byUser(vars.userId), data.data);
      }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous !== undefined && context.key) {
        queryClient.setQueryData(context.key, context.previous);
      }
    },
    onSettled: (_data, _error, vars) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.watchlist.byUser(vars.userId) });
    },
  });
}
