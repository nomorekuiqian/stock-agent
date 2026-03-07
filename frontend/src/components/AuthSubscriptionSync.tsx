'use client';

import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';

function getAutoSubscribedKey(userId: string): string {
  return `auto_subscribed_${userId}`;
}

function hasBeenAutoSubscribed(userId: string): boolean {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem(getAutoSubscribedKey(userId)) === 'true';
}

function markAsAutoSubscribed(userId: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(getAutoSubscribedKey(userId), 'true');
  }
}

const SYNC_KEY = 'sub_synced';
const SYNC_TTL = 60 * 60 * 1000; // 1 hour

function needsSync(userId: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = localStorage.getItem(SYNC_KEY);
    if (!raw) return true;
    const cached = JSON.parse(raw);
    if (cached.userId !== userId) return true;
    return Date.now() - cached.ts > SYNC_TTL;
  } catch {
    return true;
  }
}

function markSynced(userId: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SYNC_KEY, JSON.stringify({ userId, ts: Date.now() }));
}

export function AuthSubscriptionSync() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user || !needsSync(user.id)) return;

    let cancelled = false;

    async function syncUserWithSubscriptions() {
      try {
        const result = await api.subscriptions.syncUser(user.id, user.email, user.name);
        if (!cancelled && result.success && result.synced_channels.length > 0) {
          console.log('[AuthSubscriptionSync] Synced subscriptions:', result.synced_channels.map((channel) => channel.channel));
        }

        if (!hasBeenAutoSubscribed(user.id)) {
          try {
            const status = await api.subscriptions.getStatus('daily_report', user.email);
            if (!cancelled && !status.subscribed) {
              await api.subscriptions.subscribe('daily_report', {
                email: user.email,
                first_name: user.name,
                user_id: user.id,
              });
            }
            if (!cancelled) {
              markAsAutoSubscribed(user.id);
            }
          } catch (subError) {
            if (!cancelled) {
              console.warn('[AuthSubscriptionSync] Auto-subscribe failed:', subError);
            }
          }
        }

        if (!cancelled) {
          markSynced(user.id);
        }
      } catch (error) {
        if (!cancelled) {
          console.warn('[AuthSubscriptionSync] Sync subscriptions failed:', error);
        }
      }
    }

    syncUserWithSubscriptions();

    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.email, user?.name, user]);

  return null;
}
