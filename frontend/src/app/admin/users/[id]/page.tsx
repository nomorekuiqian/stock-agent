import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { UserDetail } from './_components/UserDetail';

export const dynamic = 'force-dynamic';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api';
const CRON_SECRET = process.env.CRON_SECRET ?? '';
const IS_DEV = process.env.NODE_ENV === 'development';

export const metadata: Metadata = {
  title: 'User Detail - Admin',
  robots: { index: false, follow: false },
};

interface SubscriptionData {
  user_id: string;
  email: string | null;
  plan: string | null;
  status: string | null;
  access_expires_at: string | null;
  invite_code: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_end: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface UserProfile {
  id: string;
  user_id: string;
  name: string | null;
  wechat: string | null;
  channel: string | null;
  ops_status: string;
  priority: string;
  tags: string[];
  notes: string | null;
  next_followup: string | null;
  created_at: string;
  updated_at: string;
}

export interface Interaction {
  id: string;
  user_id: string;
  date: string;
  type: string | null;
  summary: string | null;
  content: string | null;
  key_feedback: string[];
  action_items: string[];
  sentiment: string | null;
  created_at: string;
}

export interface UserDetailData {
  user_id: string;
  email: string | null;
  subscription: SubscriptionData | null;
  profile: UserProfile | null;
  interactions: Interaction[];
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function UserDetailPage({ params }: PageProps) {
  if (!IS_DEV) notFound();

  const { id } = await params;

  try {
    const res = await fetch(`${API_BASE}/admin/crm/users/${id}`, {
      headers: { 'X-Cron-Secret': CRON_SECRET },
      cache: 'no-store',
    });
    if (!res.ok) notFound();
    const data: UserDetailData = await res.json();
    return <UserDetail data={data} cronSecret={CRON_SECRET} />;
  } catch {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <p className="text-muted-foreground">无法加载用户数据</p>
      </div>
    );
  }
}
