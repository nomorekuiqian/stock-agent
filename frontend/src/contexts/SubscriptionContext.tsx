'use client';

import { createContext, useContext, useRef, useState, useCallback, useMemo, useEffect, ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth, getAccessTokenAsync as getAccessToken } from '@/contexts/AuthContext';
import { queryKeys } from '@/hooks/queries/query-keys';
import { trackCheckoutComplete } from '@/lib/paywall-analytics';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';
const PAYWALL_ENABLED = process.env.NEXT_PUBLIC_ENABLE_PAYWALL === 'true';

interface SubscriptionStatus {
  plan: string;
  status: string;
  current_period_end: string | null;
  access_expires_at: string | null;
}

interface SubscriptionContextType {
  isPro: boolean;
  isMax: boolean;
  isLoading: boolean;
  isCheckoutLoading: boolean;
  checkoutError: string | null;
  portalError: string | null;
  plan: string;
  status: string;
  currentPeriodEnd: string | null;
  accessExpiresAt: string | null;
  createCheckout: (tier?: 'pro' | 'max', returnPath?: string) => Promise<void>;
  openBillingPortal: () => Promise<void>;
  refreshSubscription: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

function isExpired(accessExpiresAt: string | null): boolean {
  if (!accessExpiresAt) return false;
  return new Date(accessExpiresAt) <= new Date();
}

function hasActiveAccessStatus(status: string): boolean {
  return status === 'active' || status === 'trialing';
}

async function fetchSubscriptionStatus(): Promise<SubscriptionStatus> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('No access token');
  }
  const res = await fetch(`${API_BASE_URL}/payment/subscription-status`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Subscription status fetch failed: ${res.status}`);
  }
  return res.json();
}

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();

  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [portalError, setPortalError] = useState<string | null>(null);

  // One-shot read at mount: are we returning from a Stripe Checkout success?
  const [isCheckoutReturn] = useState(
    () => typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('checkout') === 'success'
  );

  const queryKey = user?.id
    ? queryKeys.subscriptionStatus.byUser(user.id)
    : queryKeys.subscriptionStatus.all;

  const { data, isLoading: queryLoading } = useQuery({
    queryKey,
    queryFn: fetchSubscriptionStatus,
    enabled: PAYWALL_ENABLED && !authLoading && isAuthenticated && !!user?.id,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 3,
    placeholderData: (prev) => prev,
    // After Stripe checkout returns, poll every second until the webhook
    // flips plan to pro/max + status=active. Stops automatically once active.
    refetchInterval: (q) => {
      if (!isCheckoutReturn) return false;
      const sub = q.state.data as SubscriptionStatus | undefined;
      if (sub && (sub.plan === 'pro' || sub.plan === 'max') && hasActiveAccessStatus(sub.status)) {
        return false;
      }
      return 1000;
    },
  });

  // Clean ?checkout=success from URL once active, and fire the completion
  // event for the paywall funnel exactly once.
  const completionTrackedRef = useRef(false);
  useEffect(() => {
    if (!isCheckoutReturn || !data) return;
    if ((data.plan === 'pro' || data.plan === 'max') && hasActiveAccessStatus(data.status)) {
      if (!completionTrackedRef.current) {
        trackCheckoutComplete({ tier: data.plan as 'pro' | 'max' });
        completionTrackedRef.current = true;
      }
      if (typeof window !== 'undefined' && window.history.replaceState) {
        const url = new URL(window.location.href);
        url.searchParams.delete('checkout');
        window.history.replaceState({}, '', url.toString());
      }
    }
  }, [isCheckoutReturn, data]);

  const plan = data?.plan || 'free';
  const status = data?.status || 'none';
  const currentPeriodEnd = data?.current_period_end || null;
  const accessExpiresAt = data?.access_expires_at || null;
  const isActive = hasActiveAccessStatus(status) && !isExpired(accessExpiresAt);

  const isPro = !PAYWALL_ENABLED || ((plan === 'pro' || plan === 'max') && isActive);
  const isMax = !PAYWALL_ENABLED || (plan === 'max' && isActive);

  // Mirrors EntitlementsContext: only "loading" while we've never had data.
  // A refresh failure does not flip back to loading and cannot silently
  // demote a paying user.
  const isLoading = authLoading || (PAYWALL_ENABLED && isAuthenticated && queryLoading && !data);

  const refreshSubscription = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey });
  }, [queryClient, queryKey]);

  const createCheckout = useCallback(async (tier: 'pro' | 'max' = 'pro', returnPath?: string) => {
    if (!user?.id) {
      setCheckoutError('Please sign in first.');
      return;
    }
    const email = user.email || '';
    if (!email) {
      setCheckoutError('No email found. Please sign out and sign in again.');
      return;
    }

    setIsCheckoutLoading(true);
    setCheckoutError(null);

    const currentPath = returnPath || (typeof window !== 'undefined' ? window.location.pathname : '/for-you');

    try {
      const token = await getAccessToken();
      if (!token) {
        setCheckoutError('Session expired. Please sign in again.');
        setIsCheckoutLoading(false);
        return;
      }
      const res = await fetch(`${API_BASE_URL}/payment/checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ user_id: user.id, email, return_path: currentPath, tier }),
      });

      if (res.ok) {
        const json = await res.json();
        window.location.href = json.checkout_url;
      } else {
        const errorData = await res.json().catch(() => ({}));
        setCheckoutError(errorData.detail || 'Failed to create checkout session. Please try again.');
        setIsCheckoutLoading(false);
      }
    } catch (err) {
      console.error('[Subscription] Failed to create checkout:', err);
      setCheckoutError('Network error. Please check your connection and try again.');
      setIsCheckoutLoading(false);
    }
  }, [user]);

  const openBillingPortal = useCallback(async () => {
    if (!user?.id) return;
    setPortalError(null);

    try {
      const token = await getAccessToken();
      if (!token) {
        setPortalError('登录已过期，请重新登录');
        return;
      }
      const res = await fetch(`${API_BASE_URL}/payment/portal-session`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        window.location.href = json.portal_url;
      } else {
        const errorData = await res.json().catch(() => ({}));
        console.error('[Subscription] Portal session failed:', res.status, errorData);
        setPortalError(errorData.detail || '无法打开订阅管理，请稍后再试');
      }
    } catch (err) {
      console.error('[Subscription] Failed to open portal:', err);
      setPortalError('网络错误，请检查连接后重试');
    }
  }, [user?.id]);

  const value = useMemo<SubscriptionContextType>(
    () => ({
      isPro,
      isMax,
      isLoading,
      isCheckoutLoading,
      checkoutError,
      portalError,
      plan,
      status,
      currentPeriodEnd,
      accessExpiresAt,
      createCheckout,
      openBillingPortal,
      refreshSubscription,
    }),
    [
      isPro, isMax, isLoading, isCheckoutLoading, checkoutError, portalError,
      plan, status, currentPeriodEnd, accessExpiresAt,
      createCheckout, openBillingPortal, refreshSubscription,
    ]
  );

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (context === undefined) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
}
