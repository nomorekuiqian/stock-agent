import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAccessTokenAsync } from '@/contexts/AuthContext';
import { queryKeys } from './queries/query-keys';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

async function fetchFlags(): Promise<string[]> {
  const token = await getAccessTokenAsync();
  if (!token) return [];
  const res = await fetch(`${API}/flags`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.flags || [];
}

export function useFeatureFlags() {
  const { data: flags = [], isLoading } = useQuery({
    queryKey: queryKeys.featureFlags.all,
    queryFn: fetchFlags,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const flagSet = useMemo(() => new Set(flags), [flags]);

  return {
    flags: flagSet,
    isLoading,
    has: (flag: string) => flagSet.has(flag),
  };
}
