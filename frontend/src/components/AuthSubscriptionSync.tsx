'use client';

import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { readAcquisitionPayload } from '@/lib/acquisition';
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

    const { id: userId, email: userEmail, name: userName } = user;
    let cancelled = false;

    async function syncUserWithSubscriptions() {
      try {
        const result = await api.subscriptions.syncUser(userId, userEmail, userName, readAcquisitionPayload());
        if (!cancelled && result.success && result.synced_channels.length > 0) {
          console.log('[AuthSubscriptionSync] Synced subscriptions:', result.synced_channels.map((channel) => channel.channel));
        }

        if (!hasBeenAutoSubscribed(userId)) {
          try {
            const status = await api.subscriptions.getStatus('daily_report', userEmail);
            if (!cancelled && !status.subscribed) {
              await api.subscriptions.subscribe('daily_report', {
                email: userEmail,
                first_name: userName,
                user_id: userId,
              });
            }
            if (!cancelled) {
              markAsAutoSubscribed(userId);
            }
          } catch (subError) {
            if (!cancelled) {
              console.warn('[AuthSubscriptionSync] Auto-subscribe failed:', subError);
            }
          }
        }

        if (!cancelled) {
          markSynced(userId);
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
  }, [user]);

  return null;
}
