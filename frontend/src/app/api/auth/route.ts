import { NextRequest, NextResponse } from 'next/server';
import { createAuthRouteHandlers } from '@insforge/nextjs/api';

const baseUrl = process.env.NEXT_PUBLIC_INSFORGE_URL;
const anonKey = process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY;
if (!baseUrl) {
  throw new Error('[Auth Route] Missing NEXT_PUBLIC_INSFORGE_URL');
}

const handlers = createAuthRouteHandlers({
  baseUrl,
});

function resolveSharedAuthCookieDomain(request: NextRequest): string | undefined {
  const hostname = request.nextUrl.hostname;
  if (process.env.NODE_ENV !== 'production') {
    return undefined;
  }

  if (hostname === 'themarketbrew.com' || hostname.endsWith('.themarketbrew.com')) {
    return '.themarketbrew.com';
  }

  return undefined;
}

function buildAuthCookieOptions(request: NextRequest) {
  const domain = resolveSharedAuthCookieDomain(request);

  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 7 * 24 * 60 * 60,
    path: '/',
    ...(domain ? { domain } : {}),
  };
}

function clearAuthCookie(response: NextResponse, request: NextRequest, name: string) {
  response.cookies.set(name, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });

  const domain = resolveSharedAuthCookieDomain(request);
  if (domain) {
    response.cookies.set(name, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0,
      path: '/',
      domain,
    });
  }
}

function extractRefreshToken(response: Response): string | null {
  const getSetCookie = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  const setCookieHeaders = typeof getSetCookie === 'function'
    ? getSetCookie.call(response.headers)
    : [];

  for (const cookie of setCookieHeaders) {
    if (cookie.startsWith('insforge_refresh_token=')) {
      return cookie.split('=')[1]?.split(';')[0] || null;
    }
  }

  const combinedSetCookie = response.headers.get('set-cookie');
  if (!combinedSetCookie) {
    return null;
  }

  const match = combinedSetCookie.match(/insforge_refresh_token=([^;,\s]+)/);
  return match?.[1] || null;
}

// Wrap POST to add a "refresh" action that the SDK doesn't provide.
// When the access token expires, the client calls this to exchange
// the insforge-refresh cookie for a new access token.
async function POST(request: NextRequest) {
  const cloned = request.clone();
  let body: { action?: string } | null = null;
  try {
    body = await cloned.json();
  } catch {
    // Not JSON — delegate to SDK handler
  }

  if (body?.action === 'sign-in') {
    return handleSignIn(request, body as { email: string; password: string });
  }

  if (body?.action === 'refresh') {
    return handleRefresh(request);
  }

  return handlers.POST(request);
}

async function handleSignIn(request: NextRequest, body: { email: string; password: string }): Promise<NextResponse> {
  const { email, password } = body;
  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
  }

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (anonKey) {
      headers.Authorization = `Bearer ${anonKey}`;
      headers.apikey = anonKey;
    }

    const response = await fetch(`${baseUrl}/api/auth/sessions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      let errorMessage = 'Login failed';
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorData.message || errorMessage;
      } catch {
        // Response might not be JSON
      }
      return NextResponse.json({ error: errorMessage }, { status: response.status });
    }

    const data = await response.json();
    if (!data.accessToken) {
      return NextResponse.json({ error: 'Login response invalid' }, { status: 500 });
    }

    const nextResponse = NextResponse.json({
      accessToken: data.accessToken,
      user: data.user,
      csrfToken: data.csrfToken,
    });

    const cookieOptions = buildAuthCookieOptions(request);

    nextResponse.cookies.set('insforge-session', data.accessToken, cookieOptions);

    if (data.user) {
      nextResponse.cookies.set(
        'insforge-user',
        JSON.stringify({
          id: data.user.id,
          email: data.user.email,
          profile: data.user.profile || null,
        }),
        cookieOptions,
      );
    }

    if (data.csrfToken) {
      nextResponse.cookies.set('insforge-csrf', data.csrfToken, cookieOptions);
    }

    // Extract refresh token from Set-Cookie header and store on our domain
    const refreshedToken = extractRefreshToken(response);
    if (refreshedToken) {
      nextResponse.cookies.set('insforge-refresh', refreshedToken, cookieOptions);
      nextResponse.cookies.set('insforge_refresh_token', refreshedToken, cookieOptions);
    }

    return nextResponse;
  } catch (error) {
    console.error('[Auth Route] Sign-in error:', error);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}

async function handleRefresh(request: NextRequest): Promise<NextResponse> {
  const refreshToken = request.cookies.get('insforge-refresh')?.value
    || request.cookies.get('insforge_refresh_token')?.value;
  const csrfToken = request.cookies.get('insforge-csrf')?.value
    || request.cookies.get('insforge_csrf_token')?.value;

  if (!refreshToken) {
    return NextResponse.json(
      { error: 'No refresh token available' },
      { status: 401 },
    );
  }

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Cookie: `insforge_refresh_token=${refreshToken}`,
    };

    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }
    if (anonKey) {
      headers.Authorization = `Bearer ${anonKey}`;
      headers.apikey = anonKey;
    }

    const response = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Auth Route] Refresh failed:', response.status, errorText);
      return NextResponse.json(
        { error: 'Token refresh failed' },
        { status: 401 },
      );
    }

    const data = await response.json();
    if (!data.accessToken) {
      console.error('[Auth Route] Refresh response missing accessToken');
      return NextResponse.json(
        { error: 'Refresh response invalid' },
        { status: 401 },
      );
    }

    const nextResponse = NextResponse.json({
      accessToken: data.accessToken,
      user: data.user,
      csrfToken: data.csrfToken,
    });

    const cookieOptions = buildAuthCookieOptions(request);

    nextResponse.cookies.set('insforge-session', data.accessToken, cookieOptions);

    if (data.user) {
      nextResponse.cookies.set(
        'insforge-user',
        JSON.stringify({
          id: data.user.id,
          email: data.user.email,
          profile: data.user.profile || null,
        }),
        cookieOptions,
      );
    }

    const rotatedRefreshToken = extractRefreshToken(response);
    if (rotatedRefreshToken) {
      nextResponse.cookies.set('insforge-refresh', rotatedRefreshToken, cookieOptions);
      nextResponse.cookies.set('insforge_refresh_token', rotatedRefreshToken, cookieOptions);
    }

    return nextResponse;
  } catch (error) {
    console.error('[Auth Route] Refresh error:', error);
    return NextResponse.json(
      { error: 'Token refresh failed' },
      { status: 500 },
    );
  }
}

const GET = handlers.GET;

async function DELETE(request: NextRequest) {
  const response = await handlers.DELETE(request);

  clearAuthCookie(response, request, 'insforge-refresh');
  clearAuthCookie(response, request, 'insforge_refresh_token');
  clearAuthCookie(response, request, 'insforge-session');
  clearAuthCookie(response, request, 'insforge-user');
  clearAuthCookie(response, request, 'insforge-csrf');
  clearAuthCookie(response, request, 'insforge_csrf_token');

  return response;
}

export { POST, GET, DELETE };
