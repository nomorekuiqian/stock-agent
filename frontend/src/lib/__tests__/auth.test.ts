import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isTokenExpired, signIn, signOut, getAccessToken } from '../auth';

// ---------------------------------------------------------------------------
// Mock @/lib/insforge
// ---------------------------------------------------------------------------
const mockSetAuthToken = vi.fn();
const mockGetCurrentSession = vi.fn();
const mockSignOut = vi.fn();

vi.mock('@/lib/insforge', () => ({
  insforge: {
    getHttpClient: () => ({ setAuthToken: mockSetAuthToken }),
    auth: {
      getCurrentSession: (...args: unknown[]) => mockGetCurrentSession(...args),
      signOut: (...args: unknown[]) => mockSignOut(...args),
    },
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
    const token = fakeJwt({ exp: Date.now() / 1000 + 30 }); // 30s left < 60s buffer
    expect(isTokenExpired(token)).toBe(true);
  });

  it('returns false when token expires just outside the 60s buffer', () => {
    const token = fakeJwt({ exp: Date.now() / 1000 + 120 }); // 120s left > 60s buffer
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
// signIn
// ---------------------------------------------------------------------------
describe('signIn', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns success and calls setAuthToken on successful login', async () => {
    const mockUser = { id: 'u1', email: 'a@b.com', profile: { name: 'Test' } };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, accessToken: 'tok123', user: mockUser }),
    });

    const result = await signIn('a@b.com', 'pass', true);

    expect(result.success).toBe(true);
    expect(result.user?.id).toBe('u1');
    expect(mockSetAuthToken).toHaveBeenCalledWith('tok123');
  });

  it('returns error on server error response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ success: false, error: 'Invalid credentials' }),
    });

    const result = await signIn('a@b.com', 'wrong');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid credentials');
  });

  it('returns error on network exception', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network failure'));

    const result = await signIn('a@b.com', 'pass');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Network failure');
  });
});

// ---------------------------------------------------------------------------
// getAccessToken
// ---------------------------------------------------------------------------
describe('getAccessToken', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns SDK token when valid and not expired', async () => {
    const validToken = fakeJwt({ exp: Date.now() / 1000 + 3600 });
    mockGetCurrentSession.mockResolvedValue({
      data: { session: { accessToken: validToken } },
    });

    const token = await getAccessToken();
    expect(token).toBe(validToken);
  });

  it('falls back to cookie recovery when SDK token is expired', async () => {
    const expiredToken = fakeJwt({ exp: Date.now() / 1000 - 100 });
    mockGetCurrentSession.mockResolvedValue({
      data: { session: { accessToken: expiredToken } },
    });

    const freshToken = fakeJwt({ exp: Date.now() / 1000 + 3600 });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        authenticated: true,
        accessToken: freshToken,
      }),
    });

    const token = await getAccessToken();
    expect(token).toBe(freshToken);
    expect(mockSetAuthToken).toHaveBeenCalledWith(freshToken);
  });

  it('returns null when both SDK and cookie recovery fail', async () => {
    mockGetCurrentSession.mockRejectedValue(new Error('SDK error'));
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false });

    const token = await getAccessToken();
    expect(token).toBeNull();
  });

  it('deduplicates concurrent refresh attempts', async () => {
    mockGetCurrentSession.mockResolvedValue({ data: { session: null } });

    const freshToken = fakeJwt({ exp: Date.now() / 1000 + 3600 });
    let resolveCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      resolveCount++;
      return {
        ok: true,
        json: async () => ({ authenticated: true, accessToken: freshToken }),
      };
    });

    const [t1, t2] = await Promise.all([getAccessToken(), getAccessToken()]);

    expect(t1).toBe(freshToken);
    expect(t2).toBe(freshToken);
    // fetch should only have been called once due to deduplication
    expect(resolveCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// signOut
// ---------------------------------------------------------------------------
describe('signOut', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns success when SDK signOut succeeds', async () => {
    mockSignOut.mockResolvedValue({ error: null });
    const result = await signOut();
    expect(result.success).toBe(true);
  });

  it('returns error when SDK signOut fails', async () => {
    mockSignOut.mockResolvedValue({ error: { message: 'Session not found' } });
    const result = await signOut();
    expect(result.success).toBe(false);
    expect(result.error).toBe('Session not found');
  });
});
