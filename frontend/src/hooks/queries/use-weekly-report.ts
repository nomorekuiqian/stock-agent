import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from './query-keys';

export function useWeeklyReport() {
  return useQuery({
    queryKey: queryKeys.weeklyReport.latest(),
    queryFn: () => api.weeklyReport.getLatest(),
    staleTime: 30 * 60 * 1000,  // 30 min
    gcTime: 2 * 60 * 60 * 1000, // 2 hours
  });
}
