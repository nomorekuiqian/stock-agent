import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AuthProvider, useAuth } from '../AuthContext';

const mockGetCurrentAuthSession = vi.fn();
const mockSignIn = vi.fn();
const mockSignOut = vi.fn();
const mockSignUp = vi.fn();
const mockSignInWithGoogle = vi.fn();
const mockUpdateProfile = vi.fn();
const mockResendVerificationEmail = vi.fn();
const mockVerifyEmail = vi.fn();

vi.mock('@/lib/auth', () => ({
  getCurrentAuthSession: (...args: unknown[]) => mockGetCurrentAuthSession(...args),
  signIn: (...args: unknown[]) => mockSignIn(...args),
  signOut: (...args: unknown[]) => mockSignOut(...args),
  signUp: (...args: unknown[]) => mockSignUp(...args),
  signInWithGoogle: (...args: unknown[]) => mockSignInWithGoogle(...args),
  updateProfile: (...args: unknown[]) => mockUpdateProfile(...args),
  resendVerificationEmail: (...args: unknown[]) => mockResendVerificationEmail(...args),
  verifyEmail: (...args: unknown[]) => mockVerifyEmail(...args),
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
    mockGetCurrentAuthSession.mockResolvedValue({
      authenticated: false,
      user: null,
      accessToken: null,
      expiresAt: null,
    });
  });

  it('hydrates initial session from auth route helper', async () => {
    mockGetCurrentAuthSession.mockResolvedValue({
      authenticated: true,
      user: {
        id: 'u1',
        email: 'test@test.com',
        name: 'Test User',
      },
      accessToken: 'tok123',
      expiresAt: null,
    });

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

  it('calls signIn helper and updates user state', async () => {
    mockSignIn.mockResolvedValue({
      success: true,
      user: {
        id: 'u1',
        email: 'user@example.com',
      },
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
    mockSignUp.mockResolvedValue({
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
    mockVerifyEmail.mockResolvedValue({
      success: true,
      user: {
        id: 'u2',
        email: 'verified@example.com',
      },
    });

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

  it('delegates Google OAuth to auth helper', async () => {
    mockSignInWithGoogle.mockResolvedValue({ success: true });

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
    expect(mockSignInWithGoogle).toHaveBeenCalled();
  });
});
