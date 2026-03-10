import { NextRequest } from 'next/server';

function resolveSharedAuthCookieDomain(request: NextRequest): string | undefined {
  if (process.env.NODE_ENV !== 'production') {
    return undefined;
  }

  const hostname = request.nextUrl.hostname;
  if (hostname === 'themarketbrew.com' || hostname.endsWith('.themarketbrew.com')) {
    return '.themarketbrew.com';
  }

  return undefined;
}

export function buildCookieOptions(
  request: NextRequest,
  rememberMe: boolean,
  maxAgeSecs?: number,
): Record<string, unknown> {
  const domain = resolveSharedAuthCookieDomain(request);
  const options: Record<string, unknown> = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    ...(domain ? { domain } : {}),
  };

  if (rememberMe && maxAgeSecs) {
    options.maxAge = maxAgeSecs;
  }

  return options;
}

export function buildExpiredCookieOptions(request: NextRequest): Record<string, unknown> {
  return {
    ...buildCookieOptions(request, true),
    maxAge: 0,
  };
}

export function extractRefreshToken(res: Response): string | null {
  const setCookies = res.headers.getSetCookie?.() ?? [];
  for (const header of setCookies) {
    const match = header.match(/insforge_refresh_token=([^;]+)/);
    if (match?.[1]) {
      return match[1];
    }
  }

  const raw = res.headers.get('set-cookie');
  if (raw) {
    const match = raw.match(/insforge_refresh_token=([^;]+)/);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}
