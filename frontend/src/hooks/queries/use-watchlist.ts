import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, WatchlistData } from '@/lib/api';
import { queryKeys } from './query-keys';

export function useWatchlist(enabled: boolean = true) {
  return useQuery({
    queryKey: queryKeys.watchlist.all,
    queryFn: () => api.watchlist.get(),
    enabled,
    staleTime: Infinity,
    gcTime: 10 * 60 * 1000,  // 10 min
  });
}

export function useSaveWatchlist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, symbols, email }: { userId: string; symbols: string[]; email?: string }) =>
      api.watchlist.save(userId, symbols, email),
    onMutate: async ({ symbols }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.watchlist.all });
      const previous = queryClient.getQueryData<WatchlistData | null>(queryKeys.watchlist.all);
      queryClient.setQueryData<WatchlistData | null>(queryKeys.watchlist.all, (old) =>
        old ? { ...old, symbols } : null
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(queryKeys.watchlist.all, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.watchlist.all });
    },
  });
}
