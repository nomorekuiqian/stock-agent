'use client';

import { createContext, useContext, useRef, useState, useCallback, useMemo, useEffect, ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth, getAccessTokenAsync as getAccessToken } from '@/contexts/AuthContext';
import { queryKeys } from '@/hooks/queries/query-keys';
import { trackCheckoutComplete, type CheckoutProduct } from '@/lib/paywall-analytics';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';
const PAYWALL_ENABLED = process.env.NEXT_PUBLIC_ENABLE_PAYWALL === 'true';

interface SubscriptionStatus {
  plan: string;
  status: string;
  current_period_end: string | null;
  access_expires_at: string | null;
  stripe_price_id?: string | null;
  billing_amount_cents?: number | null;
  billing_currency?: string | null;
  billing_interval?: string | null;
  billing_interval_count?: number | null;
  stripe_account_ref?: string | null;
  stripe_migration_state?: string | null;
  cancel_at_period_end?: boolean;
  cancel_at?: string | null;
  canceled_at?: string | null;
}

interface SubscriptionContextType {
  isPro: boolean;
  isMax: boolean;
  isLoading: boolean;
  isCheckoutLoading: boolean;
  isCancellationLoading: boolean;
  checkoutError: string | null;
  portalError: string | null;
  cancellationError: string | null;
  plan: string;
  status: string;
  currentPeriodEnd: string | null;
  accessExpiresAt: string | null;
  stripePriceId: string | null;
  billingAmountCents: number | null;
  billingCurrency: string | null;
  billingInterval: string | null;
  billingIntervalCount: number | null;
  stripeAccountRef: string | null;
  stripeMigrationState: string | null;
  cancelAtPeriodEnd: boolean;
  cancelAt: string | null;
  canceledAt: string | null;
  createCheckout: (
    product?: CheckoutProduct,
    returnPath?: string,
    opts?: { billingInterval?: 'monthly' },
  ) => Promise<void>;
  openBillingPortal: (opts?: {
    returnPath?: string;
    product?: CheckoutProduct;
    billingInterval?: 'monthly';
  }) => Promise<void>;
  cancelSubscription: () => Promise<boolean>;
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

function planRank(plan: string): number {
  if (plan === 'max' || plan === 'ultra') return 2;
  if (plan === 'pro') return 1;
  return 0;
}

function normalizePlan(plan: string | undefined | null): string {
  if (plan === 'ultra') return 'max';
  return plan || 'free';
}

async function fetchSubscriptionStatus(fresh = true): Promise<SubscriptionStatus> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('No access token');
  }
  const url = fresh
    ? `${API_BASE_URL}/payment/subscription-status?fresh=true`
    : `${API_BASE_URL}/payment/subscription-status`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Subscription status fetch failed: ${res.status}`);
  }
  return res.json();
}

async function readApiError(res: Response): Promise<string | null> {
  const text = await res.text().catch(() => '');
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as { detail?: unknown; error?: unknown };
    if (typeof parsed.detail === 'string') return parsed.detail;
    if (typeof parsed.error === 'string') return parsed.error;
  } catch {
    // Fall through to raw text for non-JSON errors.
  }
  return text;
}

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();

  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false);
  const [isCancellationLoading, setIsCancellationLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [portalError, setPortalError] = useState<string | null>(null);
  const [cancellationError, setCancellationError] = useState<string | null>(null);

  // One-shot read at mount: are we returning from a Stripe Checkout success?
  const [isCheckoutReturn] = useState(
    () => typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('checkout') === 'success'
  );

  const queryKey = useMemo(
    () => user?.id
      ? queryKeys.subscriptionStatus.byUser(user.id)
      : queryKeys.subscriptionStatus.all,
    [user?.id]
  );

  const { data, isLoading: queryLoading } = useQuery({
    queryKey,
    queryFn: () => fetchSubscriptionStatus(),
    enabled: PAYWALL_ENABLED && !authLoading && isAuthenticated && !!user?.id,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 3,
    placeholderData: (prev) => prev,
    // After Stripe checkout returns, poll every second until the webhook
    // flips plan to pro/max + status=active. Legacy ultra rows count as max.
    refetchInterval: (q) => {
      if (!isCheckoutReturn) return false;
      const sub = q.state.data as SubscriptionStatus | undefined;
      const normalized = normalizePlan(sub?.plan);
      if (sub && (normalized === 'pro' || normalized === 'max') && hasActiveAccessStatus(sub.status)) {
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
    const normalized = normalizePlan(data.plan);
    if ((normalized === 'pro' || normalized === 'max') && hasActiveAccessStatus(data.status)) {
      if (!completionTrackedRef.current) {
        trackCheckoutComplete({ tier: normalized as CheckoutProduct });
        completionTrackedRef.current = true;
      }
      if (typeof window !== 'undefined' && window.history.replaceState) {
        const url = new URL(window.location.href);
        url.searchParams.delete('checkout');
        window.history.replaceState({}, '', url.toString());
      }
    }
  }, [isCheckoutReturn, data]);

  const plan = normalizePlan(data?.plan);
  const status = data?.status || 'none';
  const currentPeriodEnd = data?.current_period_end || null;
  const accessExpiresAt = data?.access_expires_at || null;
  const stripePriceId = data?.stripe_price_id || null;
  const billingAmountCents = data?.billing_amount_cents ?? null;
  const billingCurrency = data?.billing_currency || null;
  const billingInterval = data?.billing_interval || null;
  const billingIntervalCount = data?.billing_interval_count ?? null;
  const stripeAccountRef = data?.stripe_account_ref || null;
  const stripeMigrationState = data?.stripe_migration_state || null;
  const cancelAtPeriodEnd = data?.cancel_at_period_end || false;
  const cancelAt = data?.cancel_at || null;
  const canceledAt = data?.canceled_at || null;
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

  const openBillingPortal = useCallback(async (opts?: {
    returnPath?: string;
    product?: CheckoutProduct;
    billingInterval?: 'monthly';
  }) => {
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
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          return_path: opts?.returnPath,
          product: opts?.product,
          billing_interval: opts?.billingInterval || 'monthly',
        }),
      });
      if (res.ok) {
        const json = await res.json();
        window.location.href = json.portal_url;
      } else {
        const detail = await readApiError(res);
        console.error('[Subscription] Portal session failed:', res.status, detail);
        setPortalError(detail || '无法打开订阅管理，请稍后再试');
      }
    } catch (err) {
      console.error('[Subscription] Failed to open portal:', err);
      setPortalError('网络错误，请检查连接后重试');
    }
  }, [user?.id]);

  const cancelSubscription = useCallback(async (): Promise<boolean> => {
    if (!user?.id) return false;
    setCancellationError(null);
    setIsCancellationLoading(true);

    try {
      const token = await getAccessToken();
      if (!token) {
        setCancellationError('登录已过期，请重新登录');
        return false;
      }
      const res = await fetch(`${API_BASE_URL}/payment/cancel-subscription`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const detail = await readApiError(res);
        setCancellationError(detail || '无法取消自动续费，请稍后再试');
        return false;
      }

      const json = await res.json();
      queryClient.setQueryData(queryKey, (prev: SubscriptionStatus | undefined) => ({
        ...(prev || {}),
        plan: json.plan || prev?.plan || plan,
        status: json.status || prev?.status || status,
        current_period_end: json.current_period_end ?? prev?.current_period_end ?? currentPeriodEnd,
        access_expires_at: prev?.access_expires_at ?? accessExpiresAt,
        cancel_at_period_end: json.cancel_at_period_end ?? true,
        cancel_at: json.cancel_at ?? prev?.cancel_at ?? currentPeriodEnd,
        canceled_at: json.canceled_at ?? prev?.canceled_at ?? null,
        stripe_account_ref: json.stripe_account_ref ?? prev?.stripe_account_ref ?? stripeAccountRef,
        stripe_migration_state: json.stripe_migration_state
          ?? prev?.stripe_migration_state
          ?? stripeMigrationState,
      }));
      await queryClient.invalidateQueries({ queryKey });
      return true;
    } catch (err) {
      console.error('[Subscription] Failed to cancel subscription:', err);
      setCancellationError('网络错误，请检查连接后重试');
      return false;
    } finally {
      setIsCancellationLoading(false);
    }
  }, [
    accessExpiresAt,
    currentPeriodEnd,
    plan,
    queryClient,
    queryKey,
    status,
    stripeAccountRef,
    stripeMigrationState,
    user?.id,
  ]);

  const createCheckout = useCallback(async (
    product: CheckoutProduct = 'pro',
    returnPath?: string,
    opts?: { billingInterval?: 'monthly' },
  ) => {
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
    const currentRank = planRank(plan);
    const targetRank = planRank(product);
    const shouldUsePortal =
      PAYWALL_ENABLED &&
      isActive &&
      !accessExpiresAt &&
      currentRank > 0 &&
      targetRank > currentRank;

    try {
      const token = await getAccessToken();
      if (!token) {
        setCheckoutError('Session expired. Please sign in again.');
        setIsCheckoutLoading(false);
        return;
      }

      if (shouldUsePortal) {
        await openBillingPortal({
          returnPath: currentPath,
          product,
          billingInterval: opts?.billingInterval || 'monthly',
        });
        setIsCheckoutLoading(false);
        return;
      }

      if (PAYWALL_ENABLED && isActive && currentRank >= targetRank && targetRank > 0) {
        setCheckoutError('当前订阅已包含该方案，无需重复开通。');
        setIsCheckoutLoading(false);
        return;
      }

      const res = await fetch(`${API_BASE_URL}/payment/checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          user_id: user.id,
          email,
          return_path: currentPath,
          tier: product,
          product,
          billing_interval: opts?.billingInterval || 'monthly',
        }),
      });

      if (res.ok) {
        const json = await res.json();
        window.location.href = json.checkout_url;
      } else {
        const detail = await readApiError(res);
        setCheckoutError(detail || 'Failed to create checkout session. Please try again.');
        setIsCheckoutLoading(false);
      }
    } catch (err) {
      console.error('[Subscription] Failed to create checkout:', err);
      setCheckoutError('Network error. Please check your connection and try again.');
      setIsCheckoutLoading(false);
    }
  }, [accessExpiresAt, isActive, openBillingPortal, plan, user]);

  const value = useMemo<SubscriptionContextType>(
    () => ({
      isPro,
      isMax,
      isLoading,
      isCheckoutLoading,
      isCancellationLoading,
      checkoutError,
      portalError,
      cancellationError,
      plan,
      status,
      currentPeriodEnd,
      accessExpiresAt,
      stripePriceId,
      billingAmountCents,
      billingCurrency,
      billingInterval,
      billingIntervalCount,
      stripeAccountRef,
      stripeMigrationState,
      cancelAtPeriodEnd,
      cancelAt,
      canceledAt,
      createCheckout,
      openBillingPortal,
      cancelSubscription,
      refreshSubscription,
    }),
    [
      isPro, isMax, isLoading, isCheckoutLoading, isCancellationLoading,
      checkoutError, portalError, cancellationError,
      plan, status, currentPeriodEnd, accessExpiresAt, stripePriceId,
      billingAmountCents, billingCurrency, billingInterval, billingIntervalCount,
      stripeAccountRef, stripeMigrationState,
      cancelAtPeriodEnd, cancelAt, canceledAt,
      createCheckout, openBillingPortal, cancelSubscription, refreshSubscription,
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
