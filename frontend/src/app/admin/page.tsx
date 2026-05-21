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
  // Personal digest aggregates (carried by subscriptions list_all edge function)
  personal_digest_count_30d?: number;
  personal_digest_last_date?: string | null;
  // Real-time subscription status (Resend audience membership, set by /admin/dashboard)
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
  users: UserRecord[];
  activity?: DashboardActivity;
  error?: string;
}

async function getDashboardData(accessToken: string): Promise<DashboardData | null> {
  try {
    const res = await fetch(`${API_BASE}/admin/dashboard`, {
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

export default async function AdminPage() {
  const token = await getValidAccessToken();
  if (!token) notFound();

  const data = await getDashboardData(token);

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
