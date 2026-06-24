import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getAuthCookies } from '@/lib/auth-cookies';
import { JobMonitorPanel, type JobSource } from './_components/JobMonitorPanel';

export const dynamic = 'force-dynamic';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api';

export const metadata: Metadata = {
  title: '后台任务监控 · Admin',
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
    /* refresh failed */
  }
  return null;
}

async function getSources(accessToken: string): Promise<JobSource[] | null> {
  try {
    const res = await fetch(`${API_BASE}/admin/jobs`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });
    // 401/403 = not an admin → hide the page entirely.
    if (res.status === 401 || res.status === 403) return null;
    if (!res.ok) return null;
    const data = await res.json();
    return (data.sources ?? []) as JobSource[];
  } catch {
    return null;
  }
}

export default async function JobsAdminPage() {
  const token = await getValidAccessToken();
  if (!token) notFound();

  const sources = await getSources(token);
  if (!sources) notFound();

  return <JobMonitorPanel sources={sources} />;
}
