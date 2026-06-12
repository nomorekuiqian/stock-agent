import { Suspense } from "react";
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
  agent_id: string;
  session_id: string;
  agent_kind: string | null;
  persona_username?: string | null;
  title: string | null;
  message_count: number;
  user_message_count?: number;
  assistant_message_count?: number;
  created_at: string;
  updated_at: string;
  last_message_at?: string | null;
}

export interface ConversationMessage {
  role: "user" | "assistant" | "system" | "tool";
  content?: string;
  text?: string;
  event_type?: string;
  created_at?: string;
  turn_id?: string | null;
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

export default function UserDetailPage({ params }: PageProps) {
  // Stream the shell immediately; the data-dependent body streams in once the
  // backend responds, so the user sees a skeleton instead of a blank wait for TTFB.
  return (
    <Suspense fallback={<UserDetailSkeleton />}>
      <UserDetailLoader params={params} />
    </Suspense>
  );
}

async function UserDetailLoader({ params }: PageProps) {
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

function UserDetailSkeleton() {
  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 space-y-6 animate-pulse">
      <div className="h-4 w-40 rounded bg-muted" />
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="h-6 w-48 rounded bg-muted" />
          <div className="h-4 w-56 rounded bg-muted" />
        </div>
        <div className="h-6 w-24 rounded-full bg-muted" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <div className="h-64 rounded-lg border border-border bg-muted/40" />
          <div className="h-80 rounded-lg border border-border bg-muted/40" />
        </div>
        <div className="lg:col-span-2 space-y-6">
          <div className="h-40 rounded-lg border border-border bg-muted/40" />
          <div className="h-40 rounded-lg border border-border bg-muted/40" />
          <div className="h-56 rounded-lg border border-border bg-muted/40" />
        </div>
      </div>
    </div>
  );
}
