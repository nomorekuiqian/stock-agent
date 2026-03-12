import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from './query-keys';

export function useEmailPreferences(enabled: boolean = true) {
  return useQuery({
    queryKey: queryKeys.subscriptions.preferences(),
    queryFn: async () => {
      const result = await api.subscriptions.getPreferences();
      if (!result.success) throw new Error('Failed to load preferences');
      return result.preferences;
    },
    enabled,
    staleTime: 5 * 60 * 1000,  // 5 min
    gcTime: 30 * 60 * 1000,    // 30 min
  });
}
