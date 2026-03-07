import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isTokenExpired, getAccessToken } from '../auth';

// ---------------------------------------------------------------------------
// Mock @/lib/insforge
// ---------------------------------------------------------------------------
const mockGetCurrentSession = vi.fn();

vi.mock('@/lib/insforge', () => ({
  insforge: {
    auth: {
      getCurrentSession: (...args: unknown[]) => mockGetCurrentSession(...args),
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
  });

  it('returns SDK token when valid and not expired', async () => {
    const validToken = fakeJwt({ exp: Date.now() / 1000 + 3600 });
    mockGetCurrentSession.mockResolvedValue({
      data: { session: { accessToken: validToken } },
    });

    const token = await getAccessToken();
    expect(token).toBe(validToken);
  });

  it('returns null when SDK token is expired', async () => {
    const expiredToken = fakeJwt({ exp: Date.now() / 1000 - 100 });
    mockGetCurrentSession.mockResolvedValue({
      data: { session: { accessToken: expiredToken } },
    });

    const token = await getAccessToken();
    expect(token).toBeNull();
  });

  it('returns null when SDK has no session', async () => {
    mockGetCurrentSession.mockResolvedValue({
      data: { session: null },
    });

    const token = await getAccessToken();
    expect(token).toBeNull();
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
});
