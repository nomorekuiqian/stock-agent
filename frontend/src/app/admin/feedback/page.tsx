import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getAuthCookies } from '@/lib/auth-cookies';
import {
  FeedbackDashboard,
  type FeedbackDashboardData,
} from './_components/FeedbackDashboard';

export const dynamic = 'force-dynamic';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api';
const DEFAULT_DAYS = 30;
const PAGE_SIZE = 20;

export const metadata: Metadata = {
  title: 'Feedback · Admin',
  robots: { index: false, follow: false },
};

async function getValidAccessToken(): Promise<string | null> {
  const { accessToken, refreshToken } = await getAuthCookies();
  if (accessToken) return accessToken;
  if (!refreshToken) return null;

  const { createServerClient } = await import('@/lib/insforge-server');
  try {
    const client = createServerClient();
    const { data } = await client.auth.refreshSession({ refreshToken });
    if (data?.accessToken) {
      const { setAuthCookies } = await import('@/lib/auth-cookies');
      await setAuthCookies(data.accessToken, data.refreshToken);
      return data.accessToken;
    }
  } catch {
    // refresh failed
  }
  return null;
}

function isoDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function buildDateRange(days: number): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - Math.max(days - 1, 0));
  return {
    startDate: isoDateOnly(start),
    endDate: isoDateOnly(end),
  };
}

async function getInitialData(
  accessToken: string,
): Promise<{ data: FeedbackDashboardData | null; error: string | null; denied: boolean }> {
  const { startDate, endDate } = buildDateRange(DEFAULT_DAYS);
  const params = new URLSearchParams({
    start_date: startDate,
    end_date: endDate,
    page: '1',
    page_size: String(PAGE_SIZE),
  });

  try {
    const res = await fetch(`${API_BASE}/admin/feedback?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });

    if (res.status === 401 || res.status === 403) {
      return { data: null, error: null, denied: true };
    }

    if (!res.ok) {
      const text = await res.text();
      return {
        data: null,
        error: `反馈数据加载失败: HTTP ${res.status} ${text.slice(0, 160)}`,
        denied: false,
      };
    }

    return {
      data: (await res.json()) as FeedbackDashboardData,
      error: null,
      denied: false,
    };
  } catch (error) {
    return {
      data: null,
      error: `反馈数据加载失败: ${String(error)}`,
      denied: false,
    };
  }
}

export default async function AdminFeedbackPage() {
  const token = await getValidAccessToken();
  if (!token) notFound();

  const initial = await getInitialData(token);
  if (initial.denied) notFound();

  return (
    <FeedbackDashboard
      initialData={initial.data}
      initialDays={DEFAULT_DAYS}
      initialError={initial.error}
      pageSize={PAGE_SIZE}
    />
  );
}
