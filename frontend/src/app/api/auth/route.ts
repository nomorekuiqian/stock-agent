import { NextRequest, NextResponse } from 'next/server';

const baseUrl = process.env.NEXT_PUBLIC_INSFORGE_URL;
const anonKey = process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY;
if (!baseUrl) {
  throw new Error('[Auth Route] Missing NEXT_PUBLIC_INSFORGE_URL');
}

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

function buildClientReadableCookieOptions(request: NextRequest) {
  const domain = resolveSharedAuthCookieDomain(request);

  return {
    httpOnly: false,
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

function setCsrfCookies(response: NextResponse, request: NextRequest, csrfToken: string) {
  response.cookies.set('insforge-csrf', csrfToken, buildAuthCookieOptions(request));
  response.cookies.set('insforge_csrf_token', csrfToken, buildClientReadableCookieOptions(request));
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

function buildInsforgeHeaders(additionalHeaders: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (anonKey) {
    headers.Authorization = `Bearer ${anonKey}`;
    headers.apikey = anonKey;
  }

  return {
    ...headers,
    ...additionalHeaders,
  };
}

function setSessionCookies(
  response: NextResponse,
  request: NextRequest,
  session: {
    accessToken: string;
    user?: {
      id: string;
      email?: string | null;
      profile?: unknown;
    } | null;
    csrfToken?: string | null;
  },
  refreshToken?: string | null,
) {
  const cookieOptions = buildAuthCookieOptions(request);

  response.cookies.set('insforge-session', session.accessToken, cookieOptions);

  if (session.user) {
    response.cookies.set(
      'insforge-user',
      JSON.stringify({
        id: session.user.id,
        email: session.user.email,
        profile: session.user.profile || null,
      }),
      cookieOptions,
    );
  }

  if (session.csrfToken) {
    setCsrfCookies(response, request, session.csrfToken);
  }

  if (refreshToken) {
    response.cookies.set('insforge-refresh', refreshToken, cookieOptions);
    response.cookies.set('insforge_refresh_token', refreshToken, cookieOptions);
  }
}

async function verifyAccessToken(accessToken: string): Promise<{
  user?: {
    id: string;
    email?: string | null;
    profile?: unknown;
  };
}> {
  const response = await fetch(`${baseUrl}/api/auth/sessions/current`, {
    method: 'GET',
    headers: buildInsforgeHeaders({
      Authorization: `Bearer ${accessToken}`,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Token verification failed');
  }

  return response.json();
}

async function POST(request: NextRequest) {
  let body: { action?: string } | null = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (body?.action === 'sign-in') {
    return handleSignIn(request, body as { email: string; password: string });
  }

  if (body?.action === 'refresh') {
    return handleRefresh(request);
  }

  if (body?.action === 'verify-email') {
    return handleVerifyEmail(request, body as { otp: string; email?: string });
  }

  if (body?.action === 'oauth-exchange') {
    return handleOAuthExchange(request, body as { code: string; codeVerifier: string });
  }

  if (body?.action === 'bridge-session') {
    return handleBridgeSession(request, body as { accessToken: string; csrfToken?: string | null });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

async function handleSignIn(request: NextRequest, body: { email: string; password: string }): Promise<NextResponse> {
  const { email, password } = body;
  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
  }

  try {
    const response = await fetch(`${baseUrl}/api/auth/sessions`, {
      method: 'POST',
      headers: buildInsforgeHeaders(),
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

    // Extract refresh token from Set-Cookie header and store on our domain
    const refreshedToken = extractRefreshToken(response);
    setSessionCookies(nextResponse, request, data, refreshedToken);

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
    const headers = buildInsforgeHeaders({
      Cookie: `insforge_refresh_token=${refreshToken}`,
    });

    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
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

    const rotatedRefreshToken = extractRefreshToken(response);
    setSessionCookies(nextResponse, request, data, rotatedRefreshToken);

    return nextResponse;
  } catch (error) {
    console.error('[Auth Route] Refresh error:', error);
    return NextResponse.json(
      { error: 'Token refresh failed' },
      { status: 500 },
    );
  }
}

async function handleVerifyEmail(
  request: NextRequest,
  body: { otp: string; email?: string },
): Promise<NextResponse> {
  if (!body.otp) {
    return NextResponse.json({ error: 'Verification code required' }, { status: 400 });
  }

  try {
    const response = await fetch(`${baseUrl}/api/auth/email/verify`, {
      method: 'POST',
      headers: buildInsforgeHeaders(),
      body: JSON.stringify(body.email ? { otp: body.otp, email: body.email } : { otp: body.otp }),
    });

    if (!response.ok) {
      let errorMessage = 'Verification failed';
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorData.message || errorMessage;
      } catch {
        // Response might not be JSON.
      }
      return NextResponse.json({ error: errorMessage }, { status: response.status });
    }

    const data = await response.json();
    if (!data.accessToken || !data.user) {
      return NextResponse.json({ error: 'Verification response invalid' }, { status: 500 });
    }

    const nextResponse = NextResponse.json({
      accessToken: data.accessToken,
      user: data.user,
      csrfToken: data.csrfToken,
    });
    setSessionCookies(nextResponse, request, data, extractRefreshToken(response));
    return nextResponse;
  } catch (error) {
    console.error('[Auth Route] Verify email error:', error);
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }
}

async function handleOAuthExchange(
  request: NextRequest,
  body: { code: string; codeVerifier: string },
): Promise<NextResponse> {
  if (!body.code || !body.codeVerifier) {
    return NextResponse.json({ error: 'OAuth callback data missing' }, { status: 400 });
  }

  try {
    const response = await fetch(`${baseUrl}/api/auth/oauth/exchange`, {
      method: 'POST',
      headers: buildInsforgeHeaders(),
      body: JSON.stringify({
        code: body.code,
        code_verifier: body.codeVerifier,
      }),
    });

    if (!response.ok) {
      let errorMessage = 'OAuth code exchange failed';
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorData.message || errorMessage;
      } catch {
        // Response might not be JSON.
      }
      return NextResponse.json({ error: errorMessage }, { status: response.status });
    }

    const data = await response.json();
    if (!data.accessToken || !data.user) {
      return NextResponse.json({ error: 'OAuth exchange response invalid' }, { status: 500 });
    }

    const nextResponse = NextResponse.json({
      accessToken: data.accessToken,
      user: data.user,
      csrfToken: data.csrfToken,
      redirectTo: data.redirectTo,
    });
    setSessionCookies(nextResponse, request, data, extractRefreshToken(response));
    return nextResponse;
  } catch (error) {
    console.error('[Auth Route] OAuth exchange error:', error);
    return NextResponse.json({ error: 'OAuth code exchange failed' }, { status: 500 });
  }
}

async function handleBridgeSession(
  request: NextRequest,
  body: { accessToken: string; csrfToken?: string | null },
): Promise<NextResponse> {
  if (!body.accessToken) {
    return NextResponse.json({ error: 'Access token required' }, { status: 400 });
  }

  try {
    const authData = await verifyAccessToken(body.accessToken);
    if (!authData.user) {
      return NextResponse.json({ error: 'Access token invalid' }, { status: 401 });
    }

    const nextResponse = NextResponse.json({
      accessToken: body.accessToken,
      user: authData.user,
      csrfToken: body.csrfToken ?? null,
    });
    setSessionCookies(nextResponse, request, {
      accessToken: body.accessToken,
      user: authData.user,
      csrfToken: body.csrfToken,
    });
    return nextResponse;
  } catch (error) {
    console.error('[Auth Route] Bridge session error:', error);
    return NextResponse.json({ error: 'Failed to bridge auth session' }, { status: 401 });
  }
}

async function DELETE(request: NextRequest) {
  const response = NextResponse.json({ success: true });

  clearAuthCookie(response, request, 'insforge-refresh');
  clearAuthCookie(response, request, 'insforge_refresh_token');
  clearAuthCookie(response, request, 'insforge-session');
  clearAuthCookie(response, request, 'insforge-user');
  clearAuthCookie(response, request, 'insforge-csrf');
  clearAuthCookie(response, request, 'insforge_csrf_token');

  return response;
}

export { POST, DELETE };
