import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from './query-keys';

export function useReportList(limit: number, offset: number) {
  return useQuery({
    queryKey: queryKeys.reports.list(limit, offset),
    queryFn: () => api.reports.list(limit, offset),
    staleTime: 5 * 60 * 1000,   // 5 min
    gcTime: 30 * 60 * 1000,     // 30 min
  });
}

export function useLatestReport() {
  return useQuery({
    queryKey: queryKeys.reports.latest(),
    queryFn: () => api.reports.getLatest(),
    staleTime: 30 * 60 * 1000,  // 30 min
    gcTime: 2 * 60 * 60 * 1000, // 2 hours
  });
}

export function useReportByDate(date: string) {
  return useQuery({
    queryKey: queryKeys.reports.byDate(date),
    queryFn: () => api.reports.getByDate(date),
    enabled: !!date,
    staleTime: 30 * 60 * 1000,  // 30 min
    gcTime: 2 * 60 * 60 * 1000, // 2 hours
  });
}

export function useReportById(id: string) {
  return useQuery({
    queryKey: queryKeys.reports.byId(id),
    queryFn: () => api.reports.getById(id),
    enabled: !!id,
    staleTime: 30 * 60 * 1000,  // 30 min
    gcTime: 2 * 60 * 60 * 1000, // 2 hours
  });
}
