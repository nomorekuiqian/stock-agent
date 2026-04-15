import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { AdminDashboard } from './_components/AdminDashboard';

export const dynamic = 'force-dynamic';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api';
const CRON_SECRET = process.env.CRON_SECRET ?? '';
const IS_DEV = process.env.NODE_ENV === 'development';

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
  error?: string;
}

async function getDashboardData(): Promise<DashboardData | null> {
  if (!CRON_SECRET) return null;
  try {
    const res = await fetch(`${API_BASE}/admin/dashboard`, {
      headers: { 'X-Cron-Secret': CRON_SECRET },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export default async function AdminPage() {
  if (!IS_DEV) notFound();

  const data = await getDashboardData();

  if (!data || data.error) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-muted-foreground">
            {data?.error ?? '无法加载管理面板数据'}
          </p>
          <p className="text-xs text-muted-foreground/60">
            请确认 CRON_SECRET 环境变量已配置
          </p>
        </div>
      </div>
    );
  }

  return <AdminDashboard data={data} cronSecret={CRON_SECRET} />;
}
