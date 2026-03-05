import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isTokenExpired, signIn, signOut, getAccessToken } from '../auth';

// ---------------------------------------------------------------------------
// Mock @/lib/insforge
// ---------------------------------------------------------------------------
const mockSignInWithPassword = vi.fn();
const mockGetCurrentSession = vi.fn();
const mockSignOut = vi.fn();

vi.mock('@/lib/insforge', () => ({
  insforge: {
    auth: {
      signInWithPassword: (...args: unknown[]) => mockSignInWithPassword(...args),
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
// signIn (pure SDK mode)
// ---------------------------------------------------------------------------
describe('signIn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns success with user data on successful SDK login', async () => {
    const mockUser = { id: 'u1', email: 'a@b.com', profile: { name: 'Test' } };
    mockSignInWithPassword.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    });

    const result = await signIn('a@b.com', 'pass');

    expect(result.success).toBe(true);
    expect(result.user?.id).toBe('u1');
    expect(result.user?.email).toBe('a@b.com');
    expect(mockSignInWithPassword).toHaveBeenCalledWith({ email: 'a@b.com', password: 'pass' });
  });

  it('returns error when SDK returns an error', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: null,
      error: { message: 'Invalid credentials' },
    });

    const result = await signIn('a@b.com', 'wrong');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid credentials');
  });

  it('returns error on exception', async () => {
    mockSignInWithPassword.mockRejectedValue(new Error('Network failure'));

    const result = await signIn('a@b.com', 'pass');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Network failure');
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
