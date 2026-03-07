import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isTokenExpired, getAccessToken, resetStaleAuthState } from '../auth';

// ---------------------------------------------------------------------------
// Mock @/lib/insforge
// ---------------------------------------------------------------------------
const mockGetCurrentSession = vi.fn();
const mockSetAuthToken = vi.fn();
const mockSdkSignOut = vi.fn();
const originalFetch = globalThis.fetch;
const originalLocation = window.location;

vi.mock('@/lib/insforge', () => ({
  insforge: {
    auth: {
      getCurrentSession: (...args: unknown[]) => mockGetCurrentSession(...args),
      signOut: (...args: unknown[]) => mockSdkSignOut(...args),
    },
    getHttpClient: () => ({
      setAuthToken: (...args: unknown[]) => mockSetAuthToken(...args),
    }),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a fake JWT with the given payload. */
function fakeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.fake-signature`;
}

// ---------------------------------------------------------------------------
// isTokenExpired
// ---------------------------------------------------------------------------
describe('isTokenExpired', () => {
  it('returns false for a token expiring far in the future', () => {
    const token = fakeJwt({ exp: Date.now() / 1000 + 3600 });
    expect(isTokenExpired(token)).toBe(false);
  });

  it('returns true for a token that already expired', () => {
    const token = fakeJwt({ exp: Date.now() / 1000 - 100 });
    expect(isTokenExpired(token)).toBe(true);
  });

  it('returns true when token expires within the 60s buffer', () => {
    const token = fakeJwt({ exp: Date.now() / 1000 + 30 });
    expect(isTokenExpired(token)).toBe(true);
  });

  it('returns false when token expires just outside the 60s buffer', () => {
    const token = fakeJwt({ exp: Date.now() / 1000 + 120 });
    expect(isTokenExpired(token)).toBe(false);
  });

  it('returns false when payload has no exp field', () => {
    const token = fakeJwt({ sub: 'user-123' });
    expect(isTokenExpired(token)).toBe(false);
  });

  it('returns true for a malformed token (not 3 parts)', () => {
    expect(isTokenExpired('not-a-jwt')).toBe(true);
    expect(isTokenExpired('two.parts')).toBe(true);
  });

  it('returns true for invalid base64 in payload', () => {
    expect(isTokenExpired('header.!!!invalid!!!.sig')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getAccessToken (pure SDK mode)
// ---------------------------------------------------------------------------
describe('getAccessToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({}),
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('returns SDK token when valid and not expired', async () => {
    const validToken = fakeJwt({ exp: Date.now() / 1000 + 3600 });
    mockGetCurrentSession.mockResolvedValue({
      data: { session: { accessToken: validToken } },
    });

    const token = await getAccessToken();
    expect(token).toBe(validToken);
  });

  it('tries refresh when SDK token is expired', async () => {
    const expiredToken = fakeJwt({ exp: Date.now() / 1000 - 100 });
    const refreshedToken = fakeJwt({ exp: Date.now() / 1000 + 3600 });
    mockGetCurrentSession.mockResolvedValue({
      data: { session: { accessToken: expiredToken } },
    });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        accessToken: refreshedToken,
        user: { id: 'u1', email: 'user@example.com' },
      }),
    });

    const token = await getAccessToken();
    expect(token).toBe(refreshedToken);
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/auth', expect.objectContaining({
      method: 'POST',
      credentials: 'include',
    }));
    expect(mockSetAuthToken).toHaveBeenCalledWith(refreshedToken);
  });

  it('tries refresh when SDK has no session', async () => {
    const refreshedToken = fakeJwt({ exp: Date.now() / 1000 + 3600 });
    mockGetCurrentSession.mockResolvedValue({
      data: { session: null },
    });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        accessToken: refreshedToken,
        user: { id: 'u1', email: 'user@example.com' },
      }),
    });

    const token = await getAccessToken();
    expect(token).toBe(refreshedToken);
  });

  it('returns null when SDK throws', async () => {
    mockGetCurrentSession.mockRejectedValue(new Error('SDK error'));

    const token = await getAccessToken();
    expect(token).toBeNull();
  });

  it('returns null when SDK session request hangs beyond timeout', async () => {
    vi.useFakeTimers();
    try {
      mockGetCurrentSession.mockImplementation(() => new Promise(() => {}));

      const tokenPromise = getAccessToken();
      await vi.advanceTimersByTimeAsync(5000);

      await expect(tokenPromise).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('resetStaleAuthState signs out sdk, clears cookies and redirects to login', async () => {
    mockSdkSignOut.mockResolvedValue(undefined);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
    const replace = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        pathname: '/for-you',
        search: '',
        hash: '',
        replace,
      },
    });

    await resetStaleAuthState('session_expired');

    expect(mockSdkSignOut).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/auth', expect.objectContaining({
      method: 'DELETE',
      credentials: 'include',
    }));
    expect(mockSetAuthToken).toHaveBeenCalledWith('');
    expect(replace).toHaveBeenCalledWith('/login?error=session_expired&redirect=%2Ffor-you');
  });
});
