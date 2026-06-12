import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AuthProvider, getAccessTokenAsync, getAccessTokenSync, refreshSession, useAuth } from '../AuthContext';

const mockSignInAction = vi.fn();
const mockSignOutAction = vi.fn();
const mockSignUpAction = vi.fn();
const mockStartOAuthAction = vi.fn();
const mockUpdateProfileAction = vi.fn();
const mockResendVerificationEmailAction = vi.fn();
const mockVerifyEmailAction = vi.fn();

vi.mock('@/app/actions/auth', () => ({
  signInAction: (...args: unknown[]) => mockSignInAction(...args),
  signOutAction: (...args: unknown[]) => mockSignOutAction(...args),
  signUpAction: (...args: unknown[]) => mockSignUpAction(...args),
  startOAuthAction: (...args: unknown[]) => mockStartOAuthAction(...args),
  updateProfileAction: (...args: unknown[]) => mockUpdateProfileAction(...args),
  resendVerificationEmailAction: (...args: unknown[]) => mockResendVerificationEmailAction(...args),
  verifyEmailAction: (...args: unknown[]) => mockVerifyEmailAction(...args),
}));

vi.mock('@/lib/api', () => ({
  api: {
    subscriptions: {
      syncUser: vi.fn().mockResolvedValue({ success: true, synced_channels: [] }),
      getStatus: vi.fn().mockResolvedValue({ subscribed: true }),
      subscribe: vi.fn(),
    },
  },
}));

const originalFetch = globalThis.fetch;

function mockSessionResponse(user: unknown, accessToken: string | null = 'tok123') {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ user, accessToken }),
  });
}

function makeJwt(expSeconds: number): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none' })}.${encode({ exp: expSeconds })}.sig`;
}

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
    </QueryClientProvider>,
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    // Default: unauthenticated session
    mockSessionResponse(null, null);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('hydrates initial session from /api/auth/session', async () => {
    mockSessionResponse(
      { id: 'u1', email: 'test@test.com', name: 'Test User' },
      'tok123',
    );

    renderWithProviders(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });
    expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
    expect(screen.getByTestId('user-email')).toHaveTextContent('test@test.com');
  });

  it('calls signInAction and updates user state', async () => {
    mockSignInAction.mockResolvedValue({
      success: true,
      user: { id: 'u1', email: 'user@example.com' },
    });

    let signInResult: Awaited<ReturnType<ReturnType<typeof useAuth>['signIn']>> | null = null;

    function SignInConsumer() {
      const auth = useAuth();
      useEffect(() => {
        void auth.signIn('user@example.com', 'Password123!').then((result) => {
          signInResult = result;
        });
      }, [auth]);
      return null;
    }

    await act(async () => {
      renderWithProviders(
        <AuthProvider>
          <AuthConsumer />
          <SignInConsumer />
        </AuthProvider>,
      );
    });

    await waitFor(() => {
      expect(signInResult).toEqual({ success: true, error: undefined });
    });
    expect(screen.getByTestId('user-email')).toHaveTextContent('user@example.com');
  });

  it('returns verification-required state from signUp', async () => {
    mockSignUpAction.mockResolvedValue({
      success: true,
      requiresEmailVerification: true,
      email: 'user@example.com',
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
        </AuthProvider>,
      );
    });

    await waitFor(() => {
      expect(signUpResult).toEqual({
        success: true,
        error: undefined,
        requiresEmailVerification: true,
        email: 'user@example.com',
      });
    });
  });

  it('updates user state after verifyEmail succeeds', async () => {
    mockVerifyEmailAction.mockResolvedValue({
      success: true,
      user: { id: 'u2', email: 'verified@example.com' },
    });
    // After verify, fetchSession is called — mock the response
    const fetchMock = vi.fn()
      // First call: initial hydration (unauthenticated)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ user: null, accessToken: null }),
      })
      // Second call: after verifyEmail — authenticated
      .mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          user: { id: 'u2', email: 'verified@example.com' },
          accessToken: 'tok-verified',
        }),
      });
    globalThis.fetch = fetchMock;

    let verifyResult: Awaited<ReturnType<ReturnType<typeof useAuth>['verifyEmail']>> | null = null;

    function VerifyConsumer() {
      const auth = useAuth();
      useEffect(() => {
        void auth.verifyEmail('123456', 'verified@example.com').then((result) => {
          verifyResult = result;
        });
      }, [auth]);
      return null;
    }

    await act(async () => {
      renderWithProviders(
        <AuthProvider>
          <AuthConsumer />
          <VerifyConsumer />
        </AuthProvider>,
      );
    });

    await waitFor(() => {
      expect(verifyResult).toEqual({ success: true, error: undefined });
    });
    expect(screen.getByTestId('user-email')).toHaveTextContent('verified@example.com');
  });

  it('delegates Google OAuth to startOAuthAction', async () => {
    mockStartOAuthAction.mockResolvedValue({ success: true, url: 'https://accounts.google.com/oauth' });

    // Mock window.location
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...originalLocation, href: '', origin: 'http://localhost:3000' },
    });

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
        </AuthProvider>,
      );
    });

    await waitFor(() => {
      expect(oauthResult).toEqual({ success: true });
    });
    expect(mockStartOAuthAction).toHaveBeenCalled();

    Object.defineProperty(window, 'location', {
      writable: true,
      value: originalLocation,
    });
  });

  it('refreshes cached access token before returning an expired JWT', async () => {
    const expiredToken = makeJwt(Math.floor(Date.now() / 1000) - 60);
    const freshToken = makeJwt(Math.floor(Date.now() / 1000) + 15 * 60);

    mockSessionResponse({ id: 'u1', email: 'test@test.com' }, expiredToken);
    await refreshSession();

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        user: { id: 'u1', email: 'test@test.com' },
        accessToken: freshToken,
      }),
    });
    globalThis.fetch = fetchMock;

    await expect(getAccessTokenAsync()).resolves.toBe(freshToken);
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/session');
  });

  it('makes sync token reads fall back to async refresh when cached JWT is expired', async () => {
    const expiredToken = makeJwt(Math.floor(Date.now() / 1000) - 60);

    mockSessionResponse({ id: 'u1', email: 'test@test.com' }, expiredToken);
    await refreshSession();

    expect(getAccessTokenSync()).toBeNull();
  });
});
