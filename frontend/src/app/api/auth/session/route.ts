import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/insforge-server';
import { getAuthCookies, setAuthCookies, clearAuthCookies } from '@/lib/auth-cookies';

export async function GET() {
  const { accessToken, refreshToken } = await getAuthCookies();

  // No cookies at all — unauthenticated
  if (!accessToken && !refreshToken) {
    return NextResponse.json({ user: null, accessToken: null });
  }

  // Fast path: try the access token directly
  if (accessToken) {
    try {
      const client = createServerClient(accessToken);
      const { data } = await client.auth.getCurrentUser();
      if (data?.user) {
        return NextResponse.json({
          user: {
            id: data.user.id,
            email: data.user.email,
            name: data.user.profile?.name ?? null,
            avatarUrl: data.user.profile?.avatar_url ?? null,
          },
          accessToken,
        });
      }
    } catch {
      // Access token expired or invalid — fall through to refresh
    }
  }

  // Access token missing or invalid — try refresh
  if (refreshToken) {
    try {
      const client = createServerClient();
      const { data, error } = await client.auth.refreshSession({ refreshToken });
      if (data?.accessToken && data.user) {
        // Pass refreshToken to renew cookie TTL on every successful refresh
        await setAuthCookies(data.accessToken, data.refreshToken);
        return NextResponse.json({
          user: {
            id: data.user.id,
            email: data.user.email,
            name: data.user.profile?.name ?? null,
            avatarUrl: data.user.profile?.avatar_url ?? null,
          },
          accessToken: data.accessToken,
        });
      }
      if (error) {
        await clearAuthCookies();
      }
    } catch {
      await clearAuthCookies();
    }
  }

  return NextResponse.json({ user: null, accessToken: null });
}
