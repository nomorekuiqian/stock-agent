import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  cleanupAuthCallbackUrlParams,
  isTokenExpired,
  signIn,
  signInWithGoogle,
  signOut,
  getAccessToken,
  setCachedToken,
} from '../auth';

const mockSetAuthToken = vi.fn();
const mockGetCurrentSession = vi.fn();
const mockSignOut = vi.fn();
const mockSignInWithOAuth = vi.fn();
const originalFetch = globalThis.fetch;
const originalLocation = window.location;

vi.mock('@/lib/insforge', () => ({
  insforge: {
    getHttpClient: () => ({ setAuthToken: mockSetAuthToken }),
    auth: {
      getCurrentSession: (...args: unknown[]) => mockGetCurrentSession(...args),
      signOut: (...args: unknown[]) => mockSignOut(...args),
      signInWithOAuth: (...args: unknown[]) => mockSignInWithOAuth(...args),
    },
  },
}));

function fakeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.fake-signature`;
}

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

  it('returns true for malformed tokens', () => {
    expect(isTokenExpired('not-a-jwt')).toBe(true);
    expect(isTokenExpired('two.parts')).toBe(true);
  });
});

describe('cleanupAuthCallbackUrlParams', () => {
  const appOrigin = window.location.origin;

  afterEach(() => {
    window.history.replaceState({}, '', `${appOrigin}/`);
    vi.restoreAllMocks();
  });

  it('removes auth callback params from the URL', () => {
    window.history.replaceState(
      {},
      '',
      `${appOrigin}/screener?insforge_code=abc123&email=user%40example.com&foo=bar`,
    );
    const replaceState = vi.spyOn(window.history, 'replaceState');

    const changed = cleanupAuthCallbackUrlParams();

    expect(changed).toBe(true);
    expect(replaceState).toHaveBeenCalledWith(
      {},
      document.title,
      `${appOrigin}/screener?foo=bar`,
    );
  });
});

describe('signIn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns success and seeds auth token on successful login', async () => {
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

  it('returns server error when login fails', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ success: false, error: 'Invalid credentials' }),
    });

    const result = await signIn('a@b.com', 'wrong');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid credentials');
  });
});

describe('signInWithGoogle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    sessionStorage.setItem('auth_redirect', '/for-you');
  });

  it('delegates Google OAuth to the official SDK flow', async () => {
    mockSignInWithOAuth.mockResolvedValue({ error: null });

    const result = await signInWithGoogle();

    expect(result).toEqual({ success: true });
    expect(mockSignInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      redirectTo: `${window.location.origin}/for-you`,
    });
  });

  it('returns SDK error when OAuth initiation fails', async () => {
    mockSignInWithOAuth.mockResolvedValue({ error: { message: 'OAuth failed' } });

    const result = await signInWithGoogle();

    expect(result).toEqual({ success: false, error: 'OAuth failed' });
  });
});

describe('getAccessToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setCachedToken(null);
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('returns SDK token when valid', async () => {
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
        user: { id: 'u1', email: 'user@example.com' },
      }),
    });

    const token = await getAccessToken();
    expect(token).toBe(freshToken);
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/auth/session');
    expect(mockSetAuthToken).toHaveBeenCalledWith(freshToken);
  });

  it('returns null when both SDK and cookie recovery fail', async () => {
    mockGetCurrentSession.mockRejectedValue(new Error('SDK error'));
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false });

    const token = await getAccessToken();
    expect(token).toBeNull();
  });

  it('deduplicates concurrent cookie recovery attempts', async () => {
    mockGetCurrentSession.mockResolvedValue({ data: { session: null } });

    const freshToken = fakeJwt({ exp: Date.now() / 1000 + 3600 });
    let resolveCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      resolveCount += 1;
      return {
        ok: true,
        json: async () => ({ authenticated: true, accessToken: freshToken }),
      };
    });

    const [t1, t2] = await Promise.all([getAccessToken(), getAccessToken()]);

    expect(t1).toBe(freshToken);
    expect(t2).toBe(freshToken);
    expect(resolveCount).toBe(1);
  });
});

describe('token cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setCachedToken(null);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns cached token without network calls', async () => {
    const validToken = fakeJwt({ exp: Date.now() / 1000 + 3600 });
    setCachedToken(validToken);

    mockGetCurrentSession.mockRejectedValue(new Error('should not be called'));
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('should not be called'));

    const token = await getAccessToken();
    expect(token).toBe(validToken);
    expect(mockGetCurrentSession).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

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
