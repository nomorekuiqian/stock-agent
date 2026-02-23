import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const INSFORGE_BASE_URL =
  process.env.NEXT_PUBLIC_INSFORGE_URL || 'https://9wmhxyi4.us-east.insforge.app';

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
        headers: { Authorization: `Bearer ${accessToken}` },
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
  refreshToken: string
): Promise<{ accessToken: string; user: InsforgeUser } | null> {
  // Strategy 1: POST /api/auth/token with grant_type=refresh_token
  try {
    const res = await fetch(`${INSFORGE_BASE_URL}/api/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
      cache: 'no-store',
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.access_token || data?.accessToken) {
        const newAccessToken = data.access_token || data.accessToken;
        // Validate the new token to get user data
        const validated = await validateToken(newAccessToken);
        if (validated) {
          return { accessToken: newAccessToken, user: validated.user };
        }
      }
    }
  } catch {
    // Fall through to strategy 2
  }

  // Strategy 2: POST /api/auth/refresh with cookie-style header
  try {
    const res = await fetch(`${INSFORGE_BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `insforge-refresh=${refreshToken}`,
      },
      cache: 'no-store',
    });
    if (res.ok) {
      const data = await res.json();
      const newAccessToken =
        data?.access_token || data?.accessToken || data?.session?.access_token;
      if (newAccessToken) {
        const validated = await validateToken(newAccessToken);
        if (validated) {
          return { accessToken: newAccessToken, user: validated.user };
        }
      }
    }
  } catch {
    // Both strategies failed
  }

  return null;
}

export async function GET() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get('insforge-session')?.value;
  const refreshToken = cookieStore.get('insforge-refresh')?.value;

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
    const refreshed = await tryRefreshToken(refreshToken);
    if (refreshed) {
      const response = NextResponse.json({
        authenticated: true,
        accessToken: refreshed.accessToken,
        user: refreshed.user,
      });
      // Update session cookie with new access token
      response.cookies.set('insforge-session', refreshed.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7, // 7 days
      });
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
  return response;
}
