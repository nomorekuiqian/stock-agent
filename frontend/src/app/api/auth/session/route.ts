import { NextResponse } from 'next/server';
import { Buffer } from 'node:buffer';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/insforge-server';
import { getAuthCookies, setAuthCookies, clearAuthCookies } from '@/lib/auth-cookies';

function parseE2EUser(accessToken: string) {
  try {
    const payload = accessToken.split('.')[1];
    if (!payload) return null;
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      sub?: string;
      email?: string;
      name?: string;
    };
    if (!decoded.sub || !decoded.email) return null;
    return {
      id: decoded.sub,
      email: decoded.email,
      name: decoded.name ?? null,
      avatarUrl: null,
    };
  } catch {
    return null;
  }
}

async function isE2EAuthMockEnabled(): Promise<boolean> {
  if (process.env.E2E_AUTH_MOCK === '1') return true;
  if (process.env.NODE_ENV === 'production') return false;
  try {
    const cookieStore = await cookies();
    return cookieStore.get('e2e_auth_mock')?.value === '1';
  } catch {
    return false;
  }
}

export async function GET() {
  const { accessToken, refreshToken } = await getAuthCookies();

  if (await isE2EAuthMockEnabled()) {
    if (!accessToken) {
      return NextResponse.json({ user: null, accessToken: null });
    }
    const user = parseE2EUser(accessToken);
    return NextResponse.json({
      user,
      accessToken: user ? accessToken : null,
    });
  }

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
        // Explicit rejection from Insforge — the refresh token is genuinely
        // invalid/revoked. Safe to clear so we don't keep retrying a dead token.
        await clearAuthCookies();
      }
    } catch {
      // Transient failure (network blip / Insforge unreachable). Do NOT clear
      // cookies: the session may still be perfectly valid, and clearing here
      // would log a genuinely-logged-in user out on a momentary hiccup. Return
      // null for this round; a later refresh (12-min interval / tab focus)
      // recovers without forcing re-login.
    }
  }

  return NextResponse.json({ user: null, accessToken: null });
}
