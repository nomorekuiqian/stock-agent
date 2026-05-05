import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { UserDetail } from "./_components/UserDetail";
import { getAuthCookies } from "@/lib/auth-cookies";

export const dynamic = "force-dynamic";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

export const metadata: Metadata = {
  title: "User Detail - Admin",
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

export interface ContactFeedback {
  id: string;
  rating: "helpful" | "neutral" | "not_helpful";
  email: string;
  message: string | null;
  created_at: string;
}

export interface Questionnaire {
  id: string;
  background: string;
  markets: string[];
  trading_style: string[];
  pain_points: string[];
  feedback: string | null;
  email: string | null;
  created_at: string;
}

export interface EmailSubscriptions {
  morning_report: boolean;
  daily_report: boolean;
  weekly_report: boolean;
  personal_digest: boolean;
}

export interface PersonalDigestSummary {
  count_30d: number;
  last_date: string | null;
}

export interface ConversationSummary {
  id: string;
  user_id: string;
  title: string | null;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface ConversationMessage {
  role: "user" | "assistant" | "system";
  content?: string;
  text?: string;
  // Some flows store rich payloads — keep this open-ended.
  [k: string]: unknown;
}

export interface ConversationFull extends ConversationSummary {
  data: { messages?: ConversationMessage[] } | null;
}

export interface Watchlist {
  symbols: string[];
  preferences: { focus?: string[]; style?: string } | Record<string, unknown> | null;
  email: string | null;
  updated_at: string;
}

export interface PortfolioRow {
  symbol: string;
  shares: number | null;
  cost_basis: number | null;
  entry_price: number | null;
  target: number | null;
  stop_loss: number | null;
  conviction: number | null;
  thesis: string | null;
  updated_at: string;
}

export interface UserDetailData {
  user_id: string;
  email: string | null;
  subscription: SubscriptionData | null;
  profile: UserProfile | null;
  interactions: Interaction[];
  contact_feedbacks: ContactFeedback[];
  questionnaires: Questionnaire[];
  email_subscriptions: EmailSubscriptions | null;
  personal_digest: PersonalDigestSummary;
  conversations: ConversationSummary[];
  conversations_total: number;
  watchlist: Watchlist | null;
  portfolio: PortfolioRow[];
}

interface PageProps {
  params: Promise<{ id: string }>;
}

async function getValidAccessToken(): Promise<string | null> {
  const { accessToken, refreshToken } = await getAuthCookies();
  if (accessToken) return accessToken;
  if (!refreshToken) return null;
  const { createServerClient } = await import("@/lib/insforge-server");
  try {
    const client = createServerClient();
    const { data } = await client.auth.refreshSession({ refreshToken });
    if (data?.accessToken) {
      const { setAuthCookies } = await import("@/lib/auth-cookies");
      await setAuthCookies(data.accessToken, data.refreshToken);
      return data.accessToken;
    }
  } catch { /* refresh failed */ }
  return null;
}

export default async function UserDetailPage({ params }: PageProps) {
  const token = await getValidAccessToken();
  if (!token) notFound();

  const { id } = await params;

  let data: UserDetailData;
  try {
    const res = await fetch(`${API_BASE}/admin/crm/users/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (res.status === 403 || res.status === 401) notFound();
    if (!res.ok) notFound();
    data = await res.json();
  } catch {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <p className="text-muted-foreground">无法加载用户数据</p>
      </div>
    );
  }

  return <UserDetail data={data} />;
}
