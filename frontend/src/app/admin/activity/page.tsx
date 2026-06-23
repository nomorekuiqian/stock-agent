import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getAuthCookies } from '@/lib/auth-cookies';
import {
  ActivityComparisonPanel,
  type ActivityData,
} from './_components/ActivityComparisonPanel';

export const dynamic = 'force-dynamic';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api';
const DEFAULT_ACTIVITY_DAYS = 60;
const DEFAULT_FILTER_DAYS = 30;

export const metadata: Metadata = {
  title: 'Activity Trends · Admin',
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

async function getInitialData(accessToken: string): Promise<ActivityData | null> {
  try {
    const { startDate, endDate } = defaultDateRange(DEFAULT_FILTER_DAYS);
    const params = new URLSearchParams({
      days: String(DEFAULT_ACTIVITY_DAYS),
      growth_start: startDate,
      growth_end: endDate,
      email_start: startDate,
      email_end: endDate,
    });
    const res = await fetch(`${API_BASE}/admin/activity?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });
    if (res.status === 401) redirect('/login?redirect=/admin/activity');
    if (!res.ok) return null;
    return (await res.json()) as ActivityData;
  } catch {
    return null;
  }
}

function defaultDateRange(days: number): { startDate: string; endDate: string } {
  const endParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    endParts.find((item) => item.type === type)?.value ?? '01';
  const end = new Date(Date.UTC(
    Number(part('year')),
    Number(part('month')) - 1,
    Number(part('day')),
  ));
  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - (days - 1));
  return {
    startDate: formatDateOnly(start),
    endDate: formatDateOnly(end),
  };
}

function formatDateOnly(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default async function ActivityAdminPage() {
  const token = await getValidAccessToken();
  if (!token) redirect('/login?redirect=/admin/activity');

  const data = await getInitialData(token);
  if (!data) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="max-w-md text-center space-y-2">
          <h1 className="text-xl font-semibold text-foreground">Activity data unavailable</h1>
          <p className="text-sm text-muted-foreground">
            无法加载活跃趋势数据，请确认当前账号有 admin 权限。
          </p>
        </div>
      </main>
    );
  }

  return <ActivityComparisonPanel initialData={data} />;
}
