'use client';

import { createContext, useContext, useMemo, ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth, getAccessTokenAsync as getAccessToken } from '@/contexts/AuthContext';
import { queryKeys } from '@/hooks/queries/query-keys';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

interface EntitlementsResponse {
  entitlements: string[];
  // `trial_eligible` is still returned by the backend for now (legacy)
  // but no UI consumes it post-freemium; intentionally not surfaced here.
}

interface EntitlementsContextValue {
  entitlements: Set<string>;
  isLoading: boolean;
  has: (feature: string) => boolean;
  refresh: (opts?: { fresh?: boolean }) => Promise<void>;
}

const EntitlementsContext = createContext<EntitlementsContextValue | null>(null);

async function fetchEntitlements(fresh: boolean): Promise<EntitlementsResponse> {
  const token = await getAccessToken();
  if (!token) {
    // Surface as an error so React Query retries — never cache an empty
    // set just because we momentarily lacked a token. The `enabled` flag
    // on useQuery prevents the call entirely when truly unauthenticated.
    throw new Error('No access token');
  }
  const url = fresh
    ? `${API_BASE_URL}/payment/me/entitlements?fresh=true`
    : `${API_BASE_URL}/payment/me/entitlements`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Entitlements fetch failed: ${res.status}`);
  }
  return res.json();
}

export function EntitlementsProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading: queryLoading } = useQuery({
    queryKey: queryKeys.entitlements.me(),
    queryFn: () => fetchEntitlements(false),
    enabled: !authLoading && isAuthenticated,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 3,
    placeholderData: (prev) => prev,
  });

  const entitlements = useMemo(
    () => new Set(data?.entitlements || []),
    [data?.entitlements]
  );

  // isLoading: while auth is hydrating, OR while we have NEVER had data and
  // are authenticated + actively fetching. Subsequent background refetches
  // do not flip isLoading back to true (React Query preserves data + uses
  // isFetching for that), so a refresh failure cannot silently demote a
  // paying user to "free".
  const isLoading = authLoading || (isAuthenticated && queryLoading && !data);

  const refresh = useMemo(
    () => async (opts?: { fresh?: boolean }) => {
      if (opts?.fresh) {
        // Bypass backend's 5-min subscription cache (e.g. right after
        // Stripe webhook / lifetime grant). Don't go through React Query's
        // invalidate path because that wouldn't pass fresh=true.
        try {
          const data = await fetchEntitlements(true);
          queryClient.setQueryData(queryKeys.entitlements.me(), data);
        } catch {
          // Swallow — existing cached value (placeholderData) stays.
        }
      } else {
        await queryClient.invalidateQueries({ queryKey: queryKeys.entitlements.me() });
      }
    },
    [queryClient]
  );

  const has = useMemo(
    () => (feature: string) => entitlements.has(feature),
    [entitlements]
  );

  const value = useMemo(
    () => ({ entitlements, isLoading, has, refresh }),
    [entitlements, isLoading, has, refresh]
  );

  return (
    <EntitlementsContext.Provider value={value}>
      {children}
    </EntitlementsContext.Provider>
  );
}

export function useEntitlements() {
  const ctx = useContext(EntitlementsContext);
  if (!ctx) {
    throw new Error('useEntitlements must be used within EntitlementsProvider');
  }
  return ctx;
}
