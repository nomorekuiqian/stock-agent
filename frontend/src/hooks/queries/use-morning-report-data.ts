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

export function useMorningReportByDate(date: string) {
  return useQuery({
    queryKey: queryKeys.morningReports.byDate(date),
    queryFn: () => api.morningReports.getByDate(date),
    enabled: !!date,
    staleTime: 30 * 60 * 1000,  // 30 min
    gcTime: 2 * 60 * 60 * 1000, // 2 hours
  });
}

export function useMorningReportLatest(enabled = true) {
  return useQuery({
    queryKey: queryKeys.morningReports.latest(),
    queryFn: () => api.morningReports.getLatest(),
    enabled,
    staleTime: 30 * 60 * 1000,  // 30 min
    gcTime: 2 * 60 * 60 * 1000, // 2 hours
  });
}
