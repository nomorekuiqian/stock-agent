import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildCookieOptions, extractRefreshToken } from '../helpers';

// ---------------------------------------------------------------------------
// buildCookieOptions
// ---------------------------------------------------------------------------
describe('buildCookieOptions', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    // Restore NODE_ENV after each test
    vi.stubEnv('NODE_ENV', originalEnv!);
  });

  it('returns base options without maxAge when rememberMe is false', () => {
    const opts = buildCookieOptions(false);
    expect(opts).toEqual({
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
    });
    expect(opts).not.toHaveProperty('maxAge');
  });

  it('includes maxAge when rememberMe is true and maxAgeSecs is provided', () => {
    const opts = buildCookieOptions(true, 604800);
    expect(opts.maxAge).toBe(604800);
  });

  it('does not include maxAge when rememberMe is true but maxAgeSecs is undefined', () => {
    const opts = buildCookieOptions(true);
    expect(opts).not.toHaveProperty('maxAge');
  });

  it('sets secure to true in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const opts = buildCookieOptions(false);
    expect(opts.secure).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// extractRefreshToken
// ---------------------------------------------------------------------------
describe('extractRefreshToken', () => {
  /** Create a Response and patch getSetCookie on its own headers (survives copy). */
  function makeResponse(setCookies: string[], rawSetCookie?: string): Response {
    const res = new Response(null);
    // Patch getSetCookie on the response's actual headers object
    (res.headers as unknown as Record<string, unknown>).getSetCookie = () => setCookies;
    if (rawSetCookie) {
      res.headers.set('set-cookie', rawSetCookie);
    }
    return res;
  }

  it('extracts token from getSetCookie()', () => {
    const res = makeResponse([
      'insforge_refresh_token=refresh-jwt-123; Max-Age=2592000; Path=/api/auth; HttpOnly',
      'other_cookie=value; Path=/',
    ]);
    expect(extractRefreshToken(res)).toBe('refresh-jwt-123');
  });

  it('falls back to get("set-cookie") when getSetCookie is unavailable', () => {
    const res = new Response(null);
    // Remove getSetCookie to force fallback
    (res.headers as unknown as Record<string, unknown>).getSetCookie = undefined;
    // Manually set the raw header
    Object.defineProperty(res.headers, 'get', {
      value: (name: string) => {
        if (name === 'set-cookie') return 'insforge_refresh_token=fallback-token; Path=/';
        return null;
      },
    });
    expect(extractRefreshToken(res)).toBe('fallback-token');
  });

  it('returns null when no refresh token cookie is present', () => {
    const res = makeResponse(['session_id=abc; Path=/']);
    expect(extractRefreshToken(res)).toBeNull();
  });

  it('returns null when headers are completely empty', () => {
    const res = makeResponse([]);
    expect(extractRefreshToken(res)).toBeNull();
  });

  it('extracts token from multiple cookies where refresh token is not first', () => {
    const res = makeResponse([
      'session_id=abc; Path=/',
      'csrf_token=xyz; Path=/',
      'insforge_refresh_token=the-real-token; Max-Age=2592000',
    ]);
    expect(extractRefreshToken(res)).toBe('the-real-token');
  });
});
