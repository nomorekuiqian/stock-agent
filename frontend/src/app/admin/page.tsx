import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { AdminDashboard } from './_components/AdminDashboard';
import { getAuthCookies } from '@/lib/auth-cookies';

export const dynamic = 'force-dynamic';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api';

export const metadata: Metadata = {
  title: 'Admin',
  robots: { index: false, follow: false },
};

export interface UserRecord {
  user_id: string;
  email: string | null;
  name: string | null;
  plan: string | null;
  status: string | null;
  category: string;
  access_expires_at: string | null;
  invite_code: string | null;
  entitlements: string[] | null;
  created_at: string;
  updated_at: string | null;
  auth_created_at: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_end: string | null;
  // Activity stats
  conversations: number;
  messages: number;
  last_conversation_at: string | null;
  feedback_count: number;
  last_feedback_at: string | null;
  api_calls: number;
  api_by_type: Record<string, number>;
  last_active_at: string | null;
  // CRM ops data
  ops_status: string | null;
  ops_priority: string | null;
  ops_name: string | null;
  ops_next_followup: string | null;
  // User feedback data
  contact_feedback_count: number;
  contact_feedback_rating: string | null;
  has_questionnaire: boolean;
  questionnaire_background: string | null;
  // Personal digest aggregates (carried by the admin dashboard query)
  personal_digest_count_30d?: number;
  personal_digest_last_date?: string | null;
  // Entitlement-derived email subscription status, set by /admin/dashboard
  personal_digest_subscribed?: boolean;
}

export interface ActivityDailyRow {
  day: string;
  active_users: number;
  event_count: number;
  api_calls: number;
}

export interface DashboardActivity {
  days: number;
  daily: ActivityDailyRow[];
  summary: {
    today: number;
    yesterday: number;
    avg_7d: number;
    avg_30d: number;
    max_30d: number;
    events_30d: number;
    api_calls_30d: number;
  };
}

export interface DashboardData {
  summary: {
    total: number;
    paid: number;
    active_trial: number;
    expiring_soon: number;
    trial_expired: number;
    never_trialed: number;
  };
  engagement: {
    with_conversations: number;
    with_feedback: number;
    total_conversations: number;
    total_messages: number;
    personal_digest_subscribers: number;
  };
  chip_counts: Record<string, number>;
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
  users: UserRecord[];
  activity?: DashboardActivity;
  error?: string;
}

async function getDashboardData(accessToken: string): Promise<DashboardData | null> {
  try {
    const params = new URLSearchParams({
      page: '1',
      page_size: '50',
      sort_key: 'last_active_at',
      sort_dir: 'desc',
    });
    const res = await fetch(`${API_BASE}/admin/dashboard?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });
    if (res.status === 403 || res.status === 401) return null;
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function getAdminStatus(accessToken: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/admin/whoami`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data?.is_admin === true;
  } catch {
    return false;
  }
}

async function getValidAccessToken(): Promise<string | null> {
  const { accessToken, refreshToken } = await getAuthCookies();
  if (accessToken) return accessToken;
  if (!refreshToken) return null;
  // Access token expired but refresh token exists - try refresh
  const { createServerClient } = await import('@/lib/insforge-server');
  try {
    const client = createServerClient();
    const { data } = await client.auth.refreshSession({ refreshToken });
    if (data?.accessToken) {
      const { setAuthCookies } = await import('@/lib/auth-cookies');
      await setAuthCookies(data.accessToken, data.refreshToken);
      return data.accessToken;
    }
  } catch { /* refresh failed */ }
  return null;
}

function AdminDashboardSkeleton() {
  const cards = Array.from({ length: 6 });
  const rows = Array.from({ length: 8 });
  const chips = Array.from({ length: 16 });

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-8 space-y-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-6 w-40 rounded bg-muted" />
        <div className="h-4 w-full max-w-lg rounded bg-muted/70" />
      </div>

      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {cards.map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-muted/40 px-3 py-3">
            <div className="h-7 w-12 rounded bg-muted" />
            <div className="mt-2 h-3 w-14 rounded bg-muted/70" />
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-border bg-background p-4 space-y-4">
        <div className="flex flex-wrap justify-between gap-4">
          <div className="space-y-2">
            <div className="h-4 w-16 rounded bg-muted" />
            <div className="h-3 w-56 rounded bg-muted/70" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="h-3 w-16 rounded bg-muted/70" />
                <div className="h-6 w-12 rounded bg-muted" />
              </div>
            ))}
          </div>
        </div>
        <div className="flex h-32 items-end gap-1.5 border-t border-border pt-4">
          {Array.from({ length: 30 }).map((_, i) => (
            <div
              key={i}
              className="flex-1 rounded-t bg-muted"
              style={{ height: `${20 + ((i * 17) % 70)}%` }}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="h-9 w-full rounded-lg bg-muted md:w-72" />
        <div className="ml-auto h-8 w-28 rounded-md bg-muted" />
      </div>

      <div className="flex flex-wrap gap-2">
        {chips.map((_, i) => (
          <div key={i} className="h-7 w-20 rounded-full bg-muted/70" />
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <div className="h-10 bg-muted/60" />
        <div className="divide-y divide-border">
          {rows.map((_, i) => (
            <div key={i} className="grid grid-cols-6 gap-3 px-4 py-3">
              <div className="col-span-2 h-4 rounded bg-muted" />
              <div className="h-4 rounded bg-muted/70" />
              <div className="h-4 rounded bg-muted/70" />
              <div className="h-4 rounded bg-muted/70" />
              <div className="h-4 rounded bg-muted/70" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

async function AdminDashboardContent({ accessToken }: { accessToken: string }) {
  const data = await getDashboardData(accessToken);

  if (data === null) {
    notFound();
  }

  if (data.error) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-muted-foreground">
            {data.error}
          </p>
        </div>
      </div>
    );
  }

  return <AdminDashboard data={data} />;
}

export default async function AdminPage() {
  const token = await getValidAccessToken();
  if (!token) notFound();

  const isAdmin = await getAdminStatus(token);
  if (!isAdmin) notFound();

  return (
    <Suspense fallback={<AdminDashboardSkeleton />}>
      <AdminDashboardContent accessToken={token} />
    </Suspense>
  );
}
