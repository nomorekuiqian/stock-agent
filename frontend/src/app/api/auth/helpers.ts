/**
 * Pure helper functions extracted from route.ts for testability.
 */

export function buildCookieOptions(rememberMe: boolean, maxAgeSecs?: number): Record<string, unknown> {
  const opts: Record<string, unknown> = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  };
  if (rememberMe && maxAgeSecs) {
    opts.maxAge = maxAgeSecs;
  }
  return opts;
}

/**
 * Extract the Insforge refresh token from the Set-Cookie response header.
 * Insforge sets: `insforge_refresh_token=<jwt>; Max-Age=...; Path=/api/auth; HttpOnly; Secure; SameSite=None`
 */
export function extractRefreshToken(res: Response): string | null {
  // getSetCookie() returns an array of individual Set-Cookie header values
  const setCookies = res.headers.getSetCookie?.() ?? [];
  for (const header of setCookies) {
    const match = header.match(/insforge_refresh_token=([^;]+)/);
    if (match?.[1]) return match[1];
  }
  // Fallback: some environments merge Set-Cookie into a single comma-separated string
  const raw = res.headers.get('set-cookie');
  if (raw) {
    const match = raw.match(/insforge_refresh_token=([^;]+)/);
    if (match?.[1]) return match[1];
  }
  return null;
}
