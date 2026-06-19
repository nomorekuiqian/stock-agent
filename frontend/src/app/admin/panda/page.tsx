import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getAuthCookies } from '@/lib/auth-cookies';
import { PandaGrantsAdminPanel } from './_components/PandaGrantsAdminPanel';
import type { CommunityAccessGrant } from '@/lib/api';

export const dynamic = 'force-dynamic';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api';

export const metadata: Metadata = {
  title: 'Panda Grants · Admin',
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

type GrantsLoadResult =
  | { ok: true; grants: CommunityAccessGrant[] }
  | { ok: false; status: number | null; message: string };

async function getInitialGrants(accessToken: string): Promise<GrantsLoadResult> {
  try {
    const res = await fetch(`${API_BASE}/admin/community/panda/grants?limit=500`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, status: res.status, message: '当前账号没有 Admin 权限' };
    }
    if (!res.ok) {
      return { ok: false, status: res.status, message: 'Panda 授权 API 暂时不可用' };
    }
    const data = await res.json();
    return { ok: true, grants: data.grants ?? [] };
  } catch {
    return { ok: false, status: null, message: '无法连接后端 API' };
  }
}

function AdminUnavailable({ result }: { result: Exclude<GrantsLoadResult, { ok: true }> }) {
  return (
    <main className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-xl rounded-lg border border-border bg-card p-5">
        <h1 className="text-2xl font-editorial text-foreground">Panda 授权后台无法打开</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {result.message}
          {result.status ? `（HTTP ${result.status}）` : ''}。请确认你已用管理员账号登录，并且本地后端正在运行。
        </p>
      </div>
    </main>
  );
}

export default async function PandaGrantsAdminPage() {
  const token = await getValidAccessToken();
  if (!token) redirect(`/login?redirect=${encodeURIComponent('/admin/panda')}`);

  const result = await getInitialGrants(token);
  if (!result.ok) return <AdminUnavailable result={result} />;

  return <PandaGrantsAdminPanel initialGrants={result.grants} />;
}
