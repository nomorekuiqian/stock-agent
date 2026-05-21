import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getAuthCookies } from '@/lib/auth-cookies';
import {
  ActivityComparisonPanel,
  type ActivityData,
} from './_components/ActivityComparisonPanel';

export const dynamic = 'force-dynamic';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api';
const DEFAULT_DAYS = 60;

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
    const res = await fetch(`${API_BASE}/admin/activity?days=${DEFAULT_DAYS}`, {
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
