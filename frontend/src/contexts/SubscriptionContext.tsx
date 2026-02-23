'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getAccessToken } from '@/lib/auth';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';
const PAYWALL_ENABLED = process.env.NEXT_PUBLIC_ENABLE_PAYWALL === 'true';

interface SubscriptionContextType {
  isPro: boolean;
  isLoading: boolean;
  isCheckoutLoading: boolean;
  checkoutError: string | null;
  plan: string;
  status: string;
  currentPeriodEnd: string | null;
  createCheckout: (returnPath?: string) => Promise<void>;
  openBillingPortal: () => Promise<void>;
  refreshSubscription: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

const CACHE_KEY = 'sub_status';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function readCache(userId: string) {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (cached.userId !== userId) return null;
    if (Date.now() - cached.ts > CACHE_TTL) return null;
    return cached;
  } catch { return null; }
}

function writeCache(userId: string, plan: string, status: string, periodEnd: string | null) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      userId, plan, status, periodEnd, ts: Date.now(),
    }));
  } catch {}
}

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [plan, setPlan] = useState('free');
  const [status, setStatus] = useState('none');
  const [currentPeriodEnd, setCurrentPeriodEnd] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const isPro = !PAYWALL_ENABLED || (plan === 'pro' && status === 'active');

  // Detect checkout return once on mount
  const isCheckoutReturn = typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('checkout') === 'success';

  const refreshSubscription = useCallback(async () => {
    if (!PAYWALL_ENABLED || !user?.id) {
      setPlan('free');
      setStatus('none');
      setCurrentPeriodEnd(null);
      setIsLoading(false);
      return;
    }

    try {
      const token = await getAccessToken();
      if (!token) {
        setIsLoading(false);
        return;
      }
      const res = await fetch(
        `${API_BASE_URL}/payment/subscription-status`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        const p = data.plan || 'free';
        const s = data.status || 'none';
        const pe = data.current_period_end || null;
        setPlan(p);
        setStatus(s);
        setCurrentPeriodEnd(pe);
        writeCache(user.id, p, s, pe);
      }
    } catch (err) {
      console.error('[Subscription] Failed to fetch status:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  // Poll until subscription is active (for checkout return)
  const pollForProStatus = useCallback(async () => {
    if (!PAYWALL_ENABLED || !user?.id) return;
    const maxAttempts = 10;
    const interval = 1000; // 1 second between polls

    for (let i = 0; i < maxAttempts; i++) {
      try {
        const token = await getAccessToken();
        if (!token) break;
        const res = await fetch(
          `${API_BASE_URL}/payment/subscription-status`,
          { headers: { 'Authorization': `Bearer ${token}` } }
        );
        if (res.ok) {
          const data = await res.json();
          const p = data.plan || 'free';
          const s = data.status || 'none';
          const pe = data.current_period_end || null;
          setPlan(p);
          setStatus(s);
          setCurrentPeriodEnd(pe);
          writeCache(user.id, p, s, pe);

          if (p === 'pro' && s === 'active') {
            setIsLoading(false);
            // Clean up URL query param
            if (typeof window !== 'undefined' && window.history.replaceState) {
              const url = new URL(window.location.href);
              url.searchParams.delete('checkout');
              window.history.replaceState({}, '', url.toString());
            }
            return;
          }
        }
      } catch (err) {
        console.error('[Subscription] Poll attempt failed:', err);
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    // After max attempts, stop loading regardless
    setIsLoading(false);
  }, [user?.id]);

  useEffect(() => {
    // Wait for auth to finish loading before making any decisions
    if (authLoading) return;

    if (!PAYWALL_ENABLED) {
      setIsLoading(false);
      return;
    }

    if (isAuthenticated && user?.id) {
      if (isCheckoutReturn) {
        // Checkout return: invalidate cache, keep loading, poll for pro status
        localStorage.removeItem(CACHE_KEY);
        pollForProStatus();
      } else {
        // Normal flow: try loading from cache first for instant render
        const cached = readCache(user.id);
        if (cached) {
          setPlan(cached.plan);
          setStatus(cached.status);
          setCurrentPeriodEnd(cached.periodEnd);
          setIsLoading(false);
          // Refresh in background to keep fresh
          refreshSubscription();
        } else {
          refreshSubscription();
        }
      }
    } else {
      setIsLoading(false);
    }
  }, [authLoading, isAuthenticated, user?.id, refreshSubscription, isCheckoutReturn, pollForProStatus]);

  const createCheckout = useCallback(async (returnPath?: string) => {
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

    // Use provided path or current page path
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
        body: JSON.stringify({ user_id: user.id, email, return_path: currentPath }),
      });

      if (res.ok) {
        const data = await res.json();
        window.location.href = data.checkout_url;
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
  }, [user?.id, user?.email]);

  const openBillingPortal = useCallback(async () => {
    if (!user?.id) return;

    try {
      const token = await getAccessToken();
      if (!token) return;
      const res = await fetch(
        `${API_BASE_URL}/payment/portal-session`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
        }
      );
      if (res.ok) {
        const data = await res.json();
        window.location.href = data.portal_url;
      }
    } catch (err) {
      console.error('[Subscription] Failed to open portal:', err);
    }
  }, [user?.id]);

  return (
    <SubscriptionContext.Provider
      value={{
        isPro,
        isLoading,
        isCheckoutLoading,
        checkoutError,
        plan,
        status,
        currentPeriodEnd,
        createCheckout,
        openBillingPortal,
        refreshSubscription,
      }}
    >
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
