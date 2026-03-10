import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  buildCookieOptions,
  buildExpiredCookieOptions,
  extractRefreshToken,
} from '../helpers';

const INSFORGE_BASE_URL =
  process.env.NEXT_PUBLIC_INSFORGE_URL || 'https://9wmhxyi4.us-east.insforge.app';
const INSFORGE_ANON_KEY = process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY || '';

interface InsforgeUser {
  id: string;
  email: string;
  profile?: { name?: string; avatar_url?: string };
}

async function validateToken(accessToken: string): Promise<{ user: InsforgeUser } | null> {
  try {
    const res = await fetch(`${INSFORGE_BASE_URL}/api/auth/sessions/current`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: INSFORGE_ANON_KEY,
      },
      cache: 'no-store',
    });
    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    if (data?.user) {
      return { user: data.user };
    }
    if (data?.session?.user) {
      return { user: data.session.user };
    }
    return null;
  } catch {
    return null;
  }
}

async function tryRefreshToken(
  refreshToken: string,
  csrfToken?: string,
): Promise<{
  accessToken: string;
  refreshToken: string;
  csrfToken?: string;
  user: InsforgeUser;
} | null> {
  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${INSFORGE_ANON_KEY}`,
      apikey: INSFORGE_ANON_KEY,
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
      return null;
    }

    const data = await res.json();
    const newAccessToken = data?.accessToken;
    if (!newAccessToken) {
      return null;
    }

    const validated = await validateToken(newAccessToken);
    if (!validated) {
      return null;
    }

    return {
      accessToken: newAccessToken,
      refreshToken: extractRefreshToken(res) ?? refreshToken,
      csrfToken: data?.csrfToken ?? csrfToken,
      user: validated.user,
    };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get('insforge-session')?.value;
  const refreshToken = cookieStore.get('insforge-refresh')?.value;
  const csrfToken = cookieStore.get('insforge-csrf')?.value;

  if (!accessToken && !refreshToken) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

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

  if (refreshToken) {
    const refreshed = await tryRefreshToken(refreshToken, csrfToken);
    if (refreshed) {
      const response = NextResponse.json({
        authenticated: true,
        accessToken: refreshed.accessToken,
        user: refreshed.user,
      });

      response.cookies.set(
        'insforge-session',
        refreshed.accessToken,
        buildCookieOptions(request, true, 60 * 60 * 24 * 7),
      );

      response.cookies.set(
        'insforge-refresh',
        refreshed.refreshToken,
        buildCookieOptions(request, true, 60 * 60 * 24 * 30),
      );

      if (refreshed.csrfToken) {
        response.cookies.set(
          'insforge-csrf',
          refreshed.csrfToken,
          buildCookieOptions(request, true, 60 * 60 * 24 * 30),
        );
      }

      return response;
    }
  }

  const response = NextResponse.json({ authenticated: false }, { status: 401 });
  const expired = buildExpiredCookieOptions(request);
  response.cookies.set('insforge-session', '', expired);
  response.cookies.set('insforge-refresh', '', expired);
  response.cookies.set('insforge-csrf', '', expired);
  return response;
}
