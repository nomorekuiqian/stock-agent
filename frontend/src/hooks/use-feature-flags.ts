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
  if (!res.ok) {
    // Throw so React Query treats it as an error: retries kick in and any
    // previously-cached flags are preserved via `placeholderData`. Returning
    // `[]` here would cache a false-negative (silently hiding gated features
    // until staleTime expires).
    throw new Error(`Feature flags fetch failed: ${res.status}`);
  }
  const data = await res.json();
  return data.flags || [];
}

export function useFeatureFlags() {
  const { data: flags = [], isLoading } = useQuery({
    queryKey: queryKeys.featureFlags.all,
    queryFn: fetchFlags,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 3,
    placeholderData: (prev) => prev,
  });

  const flagSet = useMemo(() => new Set(flags), [flags]);

  return {
    flags: flagSet,
    isLoading,
    has: (flag: string) => flagSet.has(flag),
  };
}
