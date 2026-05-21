import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getAuthCookies } from '@/lib/auth-cookies';
import { LlmUsagePanel, type LlmUsageData } from './_components/LlmUsagePanel';

export const dynamic = 'force-dynamic';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api';
const DEFAULT_DAYS = 14;

export const metadata: Metadata = {
  title: 'LLM Usage · Admin',
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
  } catch { /* refresh failed */ }
  return null;
}

async function getInitialData(accessToken: string): Promise<LlmUsageData | null> {
  try {
    const res = await fetch(`${API_BASE}/admin/llm-usage?days=${DEFAULT_DAYS}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });
    if (res.status === 401 || res.status === 403) return null;
    if (!res.ok) return null;
    return (await res.json()) as LlmUsageData;
  } catch {
    return null;
  }
}

export default async function LlmUsageAdminPage() {
  const token = await getValidAccessToken();
  if (!token) notFound();

  const data = await getInitialData(token);
  if (!data) notFound();

  return <LlmUsagePanel initialData={data} initialDays={DEFAULT_DAYS} />;
}
