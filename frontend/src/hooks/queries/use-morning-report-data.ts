import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from './query-keys';

export function useMorningReportList(limit: number, offset: number) {
  return useQuery({
    queryKey: queryKeys.morningReports.list(limit, offset),
    queryFn: () => api.morningReports.list(limit, offset),
    staleTime: 5 * 60 * 1000,   // 5 min
    gcTime: 30 * 60 * 1000,     // 30 min
  });
}
