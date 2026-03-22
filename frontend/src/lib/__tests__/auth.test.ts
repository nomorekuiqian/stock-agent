import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  signIn,
  signOut,
  getAccessToken,
  getCurrentAuthSession,
  signInWithGoogle,
  completeOAuthSignIn,
  __resetAuthTestState,
} from '../auth';

const mockSignInWithPassword = vi.fn();
const mockSignOut = vi.fn();
const mockRefreshSession = vi.fn();
const mockGetCurrentUser = vi.fn();
const mockSignInWithOAuth = vi.fn();
const mockSetAuthToken = vi.fn();
const mockSdkGetSession = vi.fn();

vi.mock('@/lib/insforge', () => ({
  insforge: {
    auth: {
      signInWithPassword: (...args: unknown[]) => mockSignInWithPassword(...args),
      signOut: (...args: unknown[]) => mockSignOut(...args),
      refreshSession: (...args: unknown[]) => mockRefreshSession(...args),
      getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
      signInWithOAuth: (...args: unknown[]) => mockSignInWithOAuth(...args),
    },
    getHttpClient: () => ({ setAuthToken: mockSetAuthToken }),
    tokenManager: {
      getSession: (...args: unknown[]) => mockSdkGetSession(...args),
    },
  },
}));

describe('auth helpers', () => {
  const futureToken = [
    'header',
    btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })),
    'signature',
  ].join('.');

  const mockUser = { id: 'u1', email: 'user@example.com', emailVerified: true, createdAt: '', updatedAt: '', profile: null, metadata: null };

  beforeEach(() => {
    vi.clearAllMocks();
    __resetAuthTestState();
    window.history.replaceState({}, '', '/');
    mockSdkGetSession.mockReturnValue(null);
  });

  it('signIn calls SDK and caches session', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: mockUser, accessToken: futureToken },
      error: null,
    });

    const result = await signIn('user@example.com', 'password');

    expect(result).toEqual({ success: true, user: { id: 'u1', email: 'user@example.com' } });
    expect(mockSignInWithPassword).toHaveBeenCalledWith({ email: 'user@example.com', password: 'password' });
    expect(mockSetAuthToken).toHaveBeenCalledWith(futureToken);
  });

  it('signIn returns error on failure', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: null,
      error: { message: 'Invalid credentials' },
    });

    const result = await signIn('user@example.com', 'wrong');

    expect(result).toEqual({ success: false, error: 'Invalid credentials' });
  });

  it('getCurrentAuthSession returns session from refresh', async () => {
    mockRefreshSession.mockResolvedValue({
      data: { accessToken: futureToken, user: mockUser },
      error: null,
    });

    const session = await getCurrentAuthSession();

    expect(session.authenticated).toBe(true);
    expect(session.accessToken).toBe(futureToken);
    expect(session.user?.email).toBe('user@example.com');
    expect(mockSetAuthToken).toHaveBeenCalledWith(futureToken);
  });

  it('getCurrentAuthSession returns unauthenticated when refresh fails', async () => {
    mockRefreshSession.mockResolvedValue({ data: null, error: null });

    const session = await getCurrentAuthSession();

    expect(session.authenticated).toBe(false);
    expect(session.user).toBeNull();
    expect(session.accessToken).toBeNull();
  });

  it('prefers sdk in-memory session before forcing a refresh', async () => {
    mockSdkGetSession.mockReturnValue({
      accessToken: futureToken,
      user: mockUser,
    });

    const session = await getCurrentAuthSession(true);

    expect(session.authenticated).toBe(true);
    expect(session.user?.email).toBe('user@example.com');
    expect(session.accessToken).toBe(futureToken);
    expect(mockRefreshSession).not.toHaveBeenCalled();
  });

  it('waits for sdk oauth callback handling on /auth/callback before refreshing', async () => {
    window.history.replaceState({}, '', '/auth/callback?insforge_code=code123');
    mockGetCurrentUser.mockResolvedValue({ data: { user: mockUser }, error: null });
    // getCallbackRouteSession() calls getSdkSession() exactly once, after getCurrentUser()
    // completes (which triggers the SDK to populate tokenManager internally).
    mockSdkGetSession.mockReturnValue({
      accessToken: futureToken,
      user: mockUser,
    });

    const session = await getCurrentAuthSession(true);

    expect(mockGetCurrentUser).toHaveBeenCalledTimes(1);
    expect(mockRefreshSession).not.toHaveBeenCalled();
    expect(session.authenticated).toBe(true);
    expect(session.user?.email).toBe('user@example.com');
  });

  it('getAccessToken returns cached token without re-fetching', async () => {
    mockRefreshSession.mockResolvedValue({
      data: { accessToken: futureToken, user: mockUser },
      error: null,
    });

    const token1 = await getAccessToken();
    const token2 = await getAccessToken();

    expect(token1).toBe(futureToken);
    expect(token2).toBe(futureToken);
    expect(mockRefreshSession).toHaveBeenCalledTimes(1);
  });

  it('getCurrentAuthSession with force=true bypasses cache', async () => {
    mockRefreshSession.mockResolvedValue({
      data: { accessToken: futureToken, user: mockUser },
      error: null,
    });

    await getAccessToken(); // populates cache
    await getCurrentAuthSession(true); // force refresh

    expect(mockRefreshSession).toHaveBeenCalledTimes(2);
  });

  it('signOut clears session and sets null token', async () => {
    mockSignOut.mockResolvedValue({ error: null });
    // Warm the cache first
    mockRefreshSession.mockResolvedValue({
      data: { accessToken: futureToken, user: mockUser },
      error: null,
    });
    await getAccessToken();

    const result = await signOut();

    expect(result).toEqual({ success: true });
    expect(mockSetAuthToken).toHaveBeenCalledWith(null);
    // Cache should be cleared — next getAccessToken re-fetches
    mockRefreshSession.mockResolvedValue({ data: null, error: null });
    const token = await getAccessToken();
    expect(token).toBeNull();
    expect(mockRefreshSession).toHaveBeenCalledTimes(2);
  });

  it('signInWithGoogle delegates to SDK OAuth', async () => {
    mockSignInWithOAuth.mockResolvedValue({ data: { url: 'https://accounts.google.com/...' }, error: null });

    const result = await signInWithGoogle();

    expect(result).toEqual({ success: true });
    expect(mockSignInWithOAuth).toHaveBeenCalledWith(expect.objectContaining({ provider: 'google' }));
  });

  it('completeOAuthSignIn gets user after OAuth callback', async () => {
    const oauthUser = { id: 'u2', email: 'oauth@example.com', emailVerified: true, createdAt: '', updatedAt: '', profile: null, metadata: null };
    mockGetCurrentUser.mockResolvedValue({ data: { user: oauthUser }, error: null });
    mockRefreshSession.mockResolvedValue({
      data: { accessToken: futureToken, user: oauthUser },
      error: null,
    });

    const result = await completeOAuthSignIn();

    expect(result.success).toBe(true);
    expect(result.user?.email).toBe('oauth@example.com');
  });
});
