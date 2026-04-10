'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getAccessTokenAsync as getAccessToken } from '@/contexts/AuthContext';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

interface EntitlementsContextValue {
  entitlements: Set<string>;
  isLoading: boolean;
  has: (feature: string) => boolean;
  refresh: (opts?: { fresh?: boolean }) => Promise<void>;
}

const EntitlementsContext = createContext<EntitlementsContextValue | null>(null);

export function EntitlementsProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [entitlements, setEntitlements] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async (opts?: { fresh?: boolean }) => {
    if (!isAuthenticated) {
      setEntitlements(new Set());
      setIsLoading(false);
      return;
    }
    try {
      const token = await getAccessToken();
      if (!token) {
        setIsLoading(false);
        return;
      }
      const url = opts?.fresh
        ? `${API_BASE_URL}/payment/me/entitlements?fresh=true`
        : `${API_BASE_URL}/payment/me/entitlements`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setEntitlements(new Set(data.entitlements || []));
      }
    } catch {
      // Silently fail - entitlements will be empty, paywall will show
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!authLoading) {
      refresh();
    }
  }, [isAuthenticated, authLoading, refresh]);

  const has = useCallback(
    (feature: string) => entitlements.has(feature),
    [entitlements]
  );

  return (
    <EntitlementsContext.Provider value={{ entitlements, isLoading, has, refresh }}>
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
