'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { getAccessTokenAsync, getAccessTokenSync } from '@/contexts/AuthContext';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api';

async function fetchAdminStatus(): Promise<boolean> {
  const token = getAccessTokenSync() ?? (await getAccessTokenAsync());
  if (!token) return false;
  const res = await fetch(`${API_BASE}/admin/whoami`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) return false;
  const data = (await res.json()) as { is_admin?: boolean };
  return Boolean(data.is_admin);
}

export function useIsAdmin(): boolean {
  const { user, isAuthenticated } = useAuth();
  const { data } = useQuery({
    queryKey: ['admin-whoami', user?.id ?? null],
    queryFn: fetchAdminStatus,
    enabled: isAuthenticated && !!user?.id,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
  return data === true;
}
