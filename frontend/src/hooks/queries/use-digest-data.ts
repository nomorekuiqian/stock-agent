import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from './query-keys';

export function useDigestList(userId: string, limit: number = 10, offset: number = 0, enabled: boolean = true) {
  return useQuery({
    queryKey: queryKeys.digests.list(limit, offset),
    queryFn: () => api.digests.list(userId, limit, offset),
    enabled: enabled && !!userId,
    staleTime: 5 * 60 * 1000,   // 5 min
    gcTime: 30 * 60 * 1000,     // 30 min
  });
}

export function useDigestById(id: string, enabled: boolean = true) {
  return useQuery({
    queryKey: queryKeys.digests.byId(id),
    queryFn: () => api.digests.getById(id),
    enabled: enabled && !!id,
    staleTime: 5 * 60 * 1000,   // 5 min
    gcTime: 30 * 60 * 1000,     // 30 min
  });
}

export function useGenerateDigest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ symbols, userId }: { symbols: string[]; userId?: string }) =>
      api.generateDigest(symbols, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.digests.all });
    },
  });
}
