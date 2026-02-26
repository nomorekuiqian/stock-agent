import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const INSFORGE_BASE_URL =
  process.env.NEXT_PUBLIC_INSFORGE_URL || 'https://9wmhxyi4.us-east.insforge.app';
const INSFORGE_ANON_KEY = process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY || '';

interface InsforgeUser {
  id: string;
  email: string;
  profile?: { name?: string; avatar_url?: string };
}

async function validateToken(
  accessToken: string
): Promise<{ user: InsforgeUser } | null> {
  try {
    const res = await fetch(
      `${INSFORGE_BASE_URL}/api/auth/sessions/current`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: INSFORGE_ANON_KEY,
        },
        cache: 'no-store',
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.user) return { user: data.user };
    if (data?.session?.user) return { user: data.session.user };
    return null;
  } catch {
    return null;
  }
}

async function tryRefreshToken(
  refreshToken: string,
  csrfToken?: string
): Promise<{ accessToken: string; refreshToken?: string; csrfToken?: string; user: InsforgeUser } | null> {
  // Insforge SDK uses POST /api/auth/refresh with:
  // 1. Refresh token in httpOnly cookie named "insforge_refresh_token"
  // 2. CSRF token in X-CSRF-Token header
  // 3. Authorization with anon key
  // From the server side we set headers manually (allowed in Node.js).
  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${INSFORGE_ANON_KEY}`,
      Cookie: `insforge_refresh_token=${refreshToken}`,
    };
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }

    const res = await fetch(`${INSFORGE_BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      headers,
      cache: 'no-store',
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.error(`[auth/session] refresh failed: ${res.status} ${errBody}`);
      return null;
    }

    const data = await res.json();
    const newAccessToken = data?.accessToken;
    if (!newAccessToken) return null;

    // Extract rotated refresh token from Set-Cookie if present
    let newRefreshToken: string | undefined;
    const setCookies = res.headers.getSetCookie?.() ?? [];
    for (const header of setCookies) {
      const match = header.match(/insforge_refresh_token=([^;]+)/);
      if (match?.[1]) {
        newRefreshToken = match[1];
        break;
      }
    }

    // Extract new CSRF token if present
    const newCsrfToken = data?.csrfToken;

    // Validate the new token to get user data
    const validated = await validateToken(newAccessToken);
    if (!validated) return null;

    return { accessToken: newAccessToken, refreshToken: newRefreshToken, csrfToken: newCsrfToken, user: validated.user };
  } catch {
    return null;
  }
}

export async function GET() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get('insforge-session')?.value;
  const refreshToken = cookieStore.get('insforge-refresh')?.value;
  const csrfToken = cookieStore.get('insforge-csrf')?.value;

  if (!accessToken && !refreshToken) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  // 1. Try current access token
  if (accessToken) {
    const valid = await validateToken(accessToken);
    if (valid) {
      return NextResponse.json({
        authenticated: true,
        accessToken,
        user: valid.user,
      });
    }
  }

  // 2. Access token expired/invalid, try refresh
  if (refreshToken) {
    const refreshed = await tryRefreshToken(refreshToken, csrfToken);
    if (refreshed) {
      const response = NextResponse.json({
        authenticated: true,
        accessToken: refreshed.accessToken,
        user: refreshed.user,
      });
      const cookieOpts = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax' as const,
        path: '/',
      };
      // Update session cookie with new access token
      response.cookies.set('insforge-session', refreshed.accessToken, {
        ...cookieOpts,
        maxAge: 60 * 60 * 24 * 7, // 7 days
      });
      // Update refresh cookie if Insforge rotated it
      if (refreshed.refreshToken) {
        response.cookies.set('insforge-refresh', refreshed.refreshToken, {
          ...cookieOpts,
          maxAge: 60 * 60 * 24 * 30, // 30 days
        });
      }
      // Update CSRF token if Insforge rotated it
      if (refreshed.csrfToken) {
        response.cookies.set('insforge-csrf', refreshed.csrfToken, {
          ...cookieOpts,
          maxAge: 60 * 60 * 24 * 30, // 30 days
        });
      }
      return response;
    }
  }

  // 3. All failed - clear stale cookies
  const response = NextResponse.json(
    { authenticated: false },
    { status: 401 }
  );
  response.cookies.delete('insforge-session');
  response.cookies.delete('insforge-refresh');
  response.cookies.delete('insforge-csrf');
  return response;
}
