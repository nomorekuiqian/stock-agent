'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { getAccessTokenAsync, useAuth } from '@/contexts/AuthContext';
import { queryKeys } from '@/hooks/queries/query-keys';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';
const ACTIVATION_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 1_000;

type CheckoutTier = 'pro' | 'max';

interface SubscriptionStatus {
  plan: string;
  status: string;
  current_period_end: string | null;
  access_expires_at: string | null;
}

interface EntitlementsResponse {
  entitlements: string[];
  trial_eligible?: boolean;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeNext(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/for-you';
  return raw;
}

function normalizeTier(raw: string | null, nextPath: string): CheckoutTier | null {
  if (raw === 'pro' || raw === 'max') return raw;
  if (nextPath.startsWith('/research')) return 'max';
  return null;
}

function isActiveSubscription(sub: SubscriptionStatus): boolean {
  if (sub.status !== 'active') return false;
  if (!sub.access_expires_at) return true;
  return new Date(sub.access_expires_at) > new Date();
}

function isActivationReady(
  sub: SubscriptionStatus,
  entitlements: string[],
  tier: CheckoutTier | null,
): boolean {
  if (!isActiveSubscription(sub)) return false;
  if (tier === 'max') {
    return sub.plan === 'max' && entitlements.includes('ai_research_engine');
  }
  if (tier === 'pro') {
    return (sub.plan === 'pro' || sub.plan === 'max') && entitlements.length > 0;
  }
  if (sub.plan === 'max') return entitlements.includes('ai_research_engine');
  return sub.plan === 'pro' && entitlements.length > 0;
}

async function fetchJson<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Activation fetch failed: ${res.status}`);
  }
  return res.json();
}

function CheckoutSuccessContent() {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const { user, isLoading: authLoading } = useAuth();
  const [status, setStatus] = useState<'activating' | 'ready' | 'timeout'>('activating');
  const target = normalizeNext(params.get('next'));
  const tier = normalizeTier(params.get('tier'), target);

  useEffect(() => {
    if (authLoading) return;

    let cancelled = false;
    let redirectTimer: ReturnType<typeof setTimeout> | null = null;

    const run = async () => {
      const token = await getAccessTokenAsync();
      if (!token) {
        if (!cancelled) setStatus('timeout');
        return;
      }

      const deadline = Date.now() + ACTIVATION_TIMEOUT_MS;
      while (!cancelled && Date.now() < deadline) {
        try {
          const [sub, ents] = await Promise.all([
            fetchJson<SubscriptionStatus>('/payment/subscription-status?fresh=true', token),
            fetchJson<EntitlementsResponse>('/payment/me/entitlements?fresh=true', token),
          ]);

          queryClient.setQueryData(queryKeys.entitlements.me(), ents);
          if (user?.id) {
            queryClient.setQueryData(queryKeys.subscriptionStatus.byUser(user.id), sub);
          }

          if (isActivationReady(sub, ents.entitlements || [], tier)) {
            await queryClient.invalidateQueries({ queryKey: queryKeys.featureFlags.all });
            if (cancelled) return;
            setStatus('ready');
            redirectTimer = setTimeout(() => {
              if (!cancelled) router.replace(target);
            }, 600);
            return;
          }
        } catch {
          // Webhooks can land a moment after Checkout redirects back. Keep polling
          // until the activation deadline instead of flashing a stale paywall.
        }
        await sleep(POLL_INTERVAL_MS);
      }

      if (!cancelled) setStatus('timeout');
    };

    run();
    return () => {
      cancelled = true;
      if (redirectTimer) clearTimeout(redirectTimer);
    };
  }, [authLoading, queryClient, router, target, tier, user?.id]);

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center space-y-4">
        {status === 'activating' && (
          <>
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-zinc-400">正在激活你的订阅...</p>
          </>
        )}
        {status === 'ready' && (
          <p className="text-emerald-400 text-lg font-medium">订阅已激活，正在跳转...</p>
        )}
        {status === 'timeout' && (
          <div className="space-y-2">
            <p className="text-zinc-300">激活稍有延迟</p>
            <p className="text-zinc-500 text-sm">请刷新页面，或联系我们获取帮助</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <CheckoutSuccessContent />
    </Suspense>
  );
}
