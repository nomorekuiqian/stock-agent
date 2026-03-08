import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, cleanup } from '@testing-library/react';
import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '../AuthContext';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const mockSignUp = vi.fn();
const mockSignOut = vi.fn();
const mockSetProfile = vi.fn();
const mockResendVerificationEmail = vi.fn();
const mockVerifyEmail = vi.fn();
const mockSignInWithOAuth = vi.fn();
const originalFetch = globalThis.fetch;

const mockGetCurrentUser = vi.fn();

// Mutable holder so individual tests can override _capturedOAuthCode
const oauthCodeHolder = { value: null as string | null };

vi.mock('@/lib/insforge', () => ({
  get _capturedOAuthCode() { return oauthCodeHolder.value; },
  insforge: {
    auth: {
      getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
      signUp: (...args: unknown[]) => mockSignUp(...args),
      signOut: (...args: unknown[]) => mockSignOut(...args),
      setProfile: (...args: unknown[]) => mockSetProfile(...args),
      resendVerificationEmail: (...args: unknown[]) => mockResendVerificationEmail(...args),
      verifyEmail: (...args: unknown[]) => mockVerifyEmail(...args),
      signInWithOAuth: (...args: unknown[]) => mockSignInWithOAuth(...args),
    },
  },
}));

vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth');
  return {
    ...actual,
    cleanupAuthCallbackUrlParams: vi.fn(),
  };
});

vi.mock('@/lib/api', () => ({
  api: {
    subscriptions: {
      syncUser: vi.fn().mockResolvedValue({ success: true, synced_channels: [] }),
      getStatus: vi.fn().mockResolvedValue({ subscribed: true }),
      subscribe: vi.fn(),
    },
  },
}));

// ---------------------------------------------------------------------------
// Test helper to consume context
// ---------------------------------------------------------------------------
function AuthConsumer() {
  const auth = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(auth.isLoading)}</span>
      <span data-testid="authenticated">{String(auth.isAuthenticated)}</span>
      <span data-testid="user-email">{auth.user?.email ?? 'none'}</span>
    </div>
  );
}

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    oauthCodeHolder.value = null;
    // SDK getCurrentUser returns no user by default (unauthenticated)
    mockGetCurrentUser.mockResolvedValue({ data: { user: null }, error: null });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({}),
    });
    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {});
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('renders children', async () => {
    await act(async () => {
      renderWithProviders(
        <AuthProvider>
          <span data-testid="child">Hello</span>
        </AuthProvider>
      );
    });
    expect(screen.getByTestId('child')).toHaveTextContent('Hello');
  });

  it('restores user from localStorage when token is valid', async () => {
    // SDK getCurrentUser finds the stored session and returns the user
    const fakeToken = 'header.payload.signature';
    mockGetCurrentUser.mockResolvedValue({
      data: { user: { id: 'u1', email: 'test@test.com', profile: { name: 'Test User' } } },
      error: null,
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key: string) => {
      if (key === 'insforge-auth-token') return fakeToken;
      return null;
    });

    await act(async () => {
      renderWithProviders(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });
    expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
    expect(screen.getByTestId('user-email')).toHaveTextContent('test@test.com');
  });

  it('refreshes via Server Proxy when localStorage token is expired', async () => {
    // Expired token in localStorage
    const payload = { sub: 'u1', exp: Math.floor(Date.now() / 1000) - 3600 };
    const expiredToken = `header.${btoa(JSON.stringify(payload))}.signature`;
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key: string) => {
      if (key === 'insforge-auth-token') return expiredToken;
      return null;
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        accessToken: 'new-token',
        user: {
          id: 'u1',
          email: 'refreshed@test.com',
          profile: { name: 'Refreshed' },
        },
      }),
    });

    await act(async () => {
      renderWithProviders(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });
    expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
    expect(screen.getByTestId('user-email')).toHaveTextContent('refreshed@test.com');
  });

  it('shows not authenticated when refresh fails', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({}),
    });

    await act(async () => {
      renderWithProviders(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });
    expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
  });

  it('throws when useAuth is called outside AuthProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      render(<AuthConsumer />);
    }).toThrow('useAuth must be used within an AuthProvider');

    spy.mockRestore();
  });

  it('returns verification-required state from signUp without treating it as error', async () => {
    mockSignUp.mockResolvedValue({ data: { requireEmailVerification: true }, error: null });

    let signUpResult: Awaited<ReturnType<ReturnType<typeof useAuth>['signUp']>> | null = null;

    function SignUpConsumer() {
      const auth = useAuth();

      useEffect(() => {
        void auth.signUp('user@example.com', 'Password123!', 'Tester', '/for-you').then((result) => {
          signUpResult = result;
        });
      }, [auth]);

      return null;
    }

    await act(async () => {
      renderWithProviders(
        <AuthProvider>
          <SignUpConsumer />
        </AuthProvider>
      );
    });

    await waitFor(() => {
      expect(signUpResult).toEqual({
        success: true,
        requiresEmailVerification: true,
        email: 'user@example.com',
      });
    });
  });

  it('treats signUp response with created user but no access token as verification-required', async () => {
    mockSignUp.mockResolvedValue({
      data: {
        user: {
          id: 'u1',
          email: 'user@example.com',
          emailVerified: false,
        },
        accessToken: null,
      },
      error: null,
    });

    let signUpResult: Awaited<ReturnType<ReturnType<typeof useAuth>['signUp']>> | null = null;

    function SignUpConsumer() {
      const auth = useAuth();

      useEffect(() => {
        void auth.signUp('user@example.com', 'Password123!', 'Tester', '/for-you').then((result) => {
          signUpResult = result;
        });
      }, [auth]);

      return null;
    }

    await act(async () => {
      renderWithProviders(
        <AuthProvider>
          <SignUpConsumer />
        </AuthProvider>
      );
    });

    await waitFor(() => {
      expect(signUpResult).toEqual({
        success: true,
        requiresEmailVerification: true,
        email: 'user@example.com',
      });
    });
  });

  it('extracts nested sdk error messages', async () => {
    mockSignUp.mockResolvedValue({
      data: null,
      error: { message: 'User already exists' },
    });

    let signUpResult: Awaited<ReturnType<ReturnType<typeof useAuth>['signUp']>> | null = null;

    function SignUpConsumer() {
      const auth = useAuth();

      useEffect(() => {
        void auth.signUp('user@example.com', 'Password123!', 'Tester', '/for-you').then((result) => {
          signUpResult = result;
        });
      }, [auth]);

      return null;
    }

    await act(async () => {
      renderWithProviders(
        <AuthProvider>
          <SignUpConsumer />
        </AuthProvider>
      );
    });

    await waitFor(() => {
      expect(signUpResult).toEqual({
        success: false,
        error: 'User already exists',
      });
    });
  });

  it('syncs token storage after successful signIn', async () => {
    // First call is init refresh (fail), second is signIn (succeed)
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          accessToken: 'header.payload.signature',
          user: {
            id: 'u1',
            email: 'user@example.com',
            profile: { name: 'Tester' },
          },
        }),
      });

    let signInResult: Awaited<ReturnType<ReturnType<typeof useAuth>['signIn']>> | null = null;
    let signInTriggered = false;

    function SignInConsumer() {
      const auth = useAuth();

      useEffect(() => {
        // Only trigger signIn after loading completes and only once
        if (!auth.isLoading && !signInTriggered) {
          signInTriggered = true;
          void auth.signIn('user@example.com', 'Password123!').then((result) => {
            signInResult = result;
          });
        }
      }, [auth]);

      return null;
    }

    await act(async () => {
      renderWithProviders(
        <AuthProvider>
          <SignInConsumer />
        </AuthProvider>
      );
    });

    await waitFor(() => {
      expect(signInResult).toEqual({ success: true });
    });
    expect(Storage.prototype.setItem).toHaveBeenCalledWith('insforge-auth-token', 'header.payload.signature');
    expect(Storage.prototype.setItem).toHaveBeenCalledWith(
      'insforge-auth-user',
      JSON.stringify({
        id: 'u1',
        email: 'user@example.com',
        profile: { name: 'Tester' },
      })
    );
  });

  it('treats resend verification email with empty sdk result as failure', async () => {
    mockResendVerificationEmail.mockResolvedValue({ data: null, error: null });

    let resendResult: Awaited<ReturnType<ReturnType<typeof useAuth>['resendVerificationEmail']>> | null = null;

    function ResendConsumer() {
      const auth = useAuth();

      useEffect(() => {
        void auth.resendVerificationEmail('user@example.com').then((result) => {
          resendResult = result;
        });
      }, [auth]);

      return null;
    }

    await act(async () => {
      renderWithProviders(
        <AuthProvider>
          <ResendConsumer />
        </AuthProvider>
      );
    });

    await waitFor(() => {
      expect(resendResult).toEqual({
        success: false,
        error: '重新发送失败，请稍后重试',
      });
    });
  });

  it('clears storage and calls DELETE /api/auth on signOut', async () => {
    // SDK getCurrentUser returns an authenticated user on init
    const fakeToken = 'header.payload.signature';
    mockGetCurrentUser.mockResolvedValue({
      data: { user: { id: 'u1', email: 'user@test.com', profile: null } },
      error: null,
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key: string) => {
      if (key === 'insforge-auth-token') return fakeToken;
      return null;
    });

    let signOutResult: Awaited<ReturnType<ReturnType<typeof useAuth>['signOut']>> | null = null;

    function SignOutConsumer() {
      const auth = useAuth();

      useEffect(() => {
        if (auth.isAuthenticated && !auth.isLoading) {
          void auth.signOut().then((result) => {
            signOutResult = result;
          });
        }
      }, [auth]);

      return (
        <div>
          <span data-testid="authenticated">{String(auth.isAuthenticated)}</span>
        </div>
      );
    }

    // Reset fetch to track signOut calls
    const fetchCalls: { url: string; method: string }[] = [];
    globalThis.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      fetchCalls.push({ url, method: options?.method || 'GET' });
      return Promise.resolve({ ok: true, json: async () => ({ success: true }) });
    });
    mockSignOut.mockResolvedValue(undefined);

    await act(async () => {
      renderWithProviders(
        <AuthProvider>
          <SignOutConsumer />
        </AuthProvider>
      );
    });

    await waitFor(() => {
      expect(signOutResult).toEqual({ success: true });
    });

    expect(Storage.prototype.removeItem).toHaveBeenCalledWith('insforge-auth-token');
    expect(Storage.prototype.removeItem).toHaveBeenCalledWith('insforge-auth-user');
    expect(fetchCalls.some((c) => c.url === '/api/auth' && c.method === 'DELETE')).toBe(true);
  });

  it('exchanges OAuth code through Server Proxy on callback page', async () => {
    // Simulate returning from Google OAuth: _capturedOAuthCode has value
    // and our PKCE verifier is in sessionStorage
    oauthCodeHolder.value = 'google-auth-code-123';
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key: string) => {
      if (key === 'app_pkce_verifier') return 'test-code-verifier';
      return null;
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        accessToken: 'oauth-access-token',
        user: {
          id: 'u-google',
          email: 'google@example.com',
          profile: { name: 'Google User' },
        },
      }),
    });

    await act(async () => {
      renderWithProviders(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });
    expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
    expect(screen.getByTestId('user-email')).toHaveTextContent('google@example.com');

    // Should have called Server Proxy oauth-exchange, NOT getCurrentUser
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/auth', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        action: 'oauth-exchange',
        code: 'google-auth-code-123',
        codeVerifier: 'test-code-verifier',
      }),
    }));
    expect(mockGetCurrentUser).not.toHaveBeenCalled();

    // Should have cleaned up the verifier
    expect(Storage.prototype.removeItem).toHaveBeenCalledWith('app_pkce_verifier');
  });

  it('stays unauthenticated when OAuth exchange fails', async () => {
    oauthCodeHolder.value = 'bad-code';
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key: string) => {
      if (key === 'app_pkce_verifier') return 'test-verifier';
      return null;
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Invalid code' }),
    });

    await act(async () => {
      renderWithProviders(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });
    expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
  });

  it('falls through to getCurrentUser when OAuth code exists but no PKCE verifier', async () => {
    // Edge case: _capturedOAuthCode present but verifier missing (e.g. cleared sessionStorage)
    oauthCodeHolder.value = 'some-code';
    // getItem returns null for everything (no verifier)

    await act(async () => {
      renderWithProviders(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });
    // Should have fallen through to getCurrentUser path
    expect(mockGetCurrentUser).toHaveBeenCalled();
  });

  it('sets user after successful email verification', async () => {
    // Init: unauthenticated
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) }) // init refresh fails
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          accessToken: 'verified-token',
          user: {
            id: 'u-verified',
            email: 'verified@example.com',
            profile: { name: 'Verified User' },
          },
        }),
      });

    let verifyResult: Awaited<ReturnType<ReturnType<typeof useAuth>['verifyEmail']>> | null = null;
    let verifyTriggered = false;

    function VerifyConsumer() {
      const auth = useAuth();

      useEffect(() => {
        if (!auth.isLoading && !verifyTriggered) {
          verifyTriggered = true;
          void auth.verifyEmail('123456', 'verified@example.com').then((result) => {
            verifyResult = result;
          });
        }
      }, [auth]);

      return (
        <div>
          <span data-testid="authenticated">{String(auth.isAuthenticated)}</span>
          <span data-testid="user-email">{auth.user?.email ?? 'none'}</span>
        </div>
      );
    }

    await act(async () => {
      renderWithProviders(
        <AuthProvider>
          <VerifyConsumer />
        </AuthProvider>
      );
    });

    await waitFor(() => {
      expect(verifyResult).toEqual({ success: true });
    });
    expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
    expect(screen.getByTestId('user-email')).toHaveTextContent('verified@example.com');
    expect(Storage.prototype.setItem).toHaveBeenCalledWith('insforge-auth-token', 'verified-token');
  });

  it('sends Google OAuth with skipBrowserRedirect and moves PKCE verifier', async () => {
    // Restore real sessionStorage for this test (beforeEach mocks getItem to return null)
    vi.spyOn(Storage.prototype, 'getItem').mockRestore();
    vi.spyOn(Storage.prototype, 'setItem').mockRestore();
    vi.spyOn(Storage.prototype, 'removeItem').mockRestore();

    mockSignInWithOAuth.mockImplementation(async () => {
      // Simulate SDK storing PKCE verifier (as signInWithOAuth does internally)
      sessionStorage.setItem('insforge_pkce_verifier', 'test-verifier');
      return { data: { url: 'https://accounts.google.com/...' }, error: null };
    });
    sessionStorage.setItem('auth_redirect', '/for-you');

    let oauthResult: Awaited<ReturnType<ReturnType<typeof useAuth>['signInWithGoogle']>> | null = null;

    function OAuthConsumer() {
      const auth = useAuth();

      useEffect(() => {
        void auth.signInWithGoogle().then((result) => {
          oauthResult = result;
        });
      }, [auth]);

      return null;
    }

    await act(async () => {
      renderWithProviders(
        <AuthProvider>
          <OAuthConsumer />
        </AuthProvider>
      );
    });

    await waitFor(() => {
      expect(oauthResult).toEqual({ success: true });
    });
    expect(mockSignInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      redirectTo: 'http://localhost:3000/auth/callback',
      skipBrowserRedirect: true,
    });
    // PKCE verifier should be moved to our key and removed from SDK's key
    expect(sessionStorage.getItem('app_pkce_verifier')).toBe('test-verifier');
    expect(sessionStorage.getItem('insforge_pkce_verifier')).toBeNull();
  });
});
