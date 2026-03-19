import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AuthProvider, useAuth } from '../AuthContext';

const mockSetUser = vi.fn();
const mockReloadAuth = vi.fn();
const mockSdkSignOut = vi.fn();
const mockSdkSignUp = vi.fn();
const mockUpdateUser = vi.fn();
const mockResendVerificationEmail = vi.fn();
const mockVerifyEmail = vi.fn();
let mockSdkUser: Record<string, unknown> | null = null;
let mockIsLoaded = true;

const mockAuthSignIn = vi.fn();
const mockAuthSignInWithGoogle = vi.fn();
const mockGetAccessToken = vi.fn();
const mockAuthUpdateProfile = vi.fn();
const mockSetAuthToken = vi.fn();
const mockInsforgeGetCurrentSession = vi.fn();
const originalFetch = globalThis.fetch;

vi.mock('@insforge/nextjs', () => ({
  useInsforge: () => ({
    user: mockSdkUser,
    isLoaded: mockIsLoaded,
    setUser: mockSetUser,
    reloadAuth: mockReloadAuth,
    signOut: mockSdkSignOut,
    signUp: mockSdkSignUp,
    updateUser: mockUpdateUser,
    resendVerificationEmail: mockResendVerificationEmail,
    verifyEmail: mockVerifyEmail,
  }),
}));

vi.mock('@/lib/auth', () => ({
  signIn: (...args: unknown[]) => mockAuthSignIn(...args),
  signInWithGoogle: (...args: unknown[]) => mockAuthSignInWithGoogle(...args),
  getAccessToken: (...args: unknown[]) => mockGetAccessToken(...args),
  updateProfile: (...args: unknown[]) => mockAuthUpdateProfile(...args),
  isTokenExpired: vi.fn().mockReturnValue(false),
}));

vi.mock('@/lib/insforge', () => ({
  insforge: {
    getHttpClient: () => ({ setAuthToken: mockSetAuthToken }),
    auth: {
      getCurrentSession: (...args: unknown[]) => mockInsforgeGetCurrentSession(...args),
    },
  },
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
    vi.clearAllMocks();
    mockSdkUser = null;
    mockIsLoaded = true;
    mockReloadAuth.mockResolvedValue({ success: true });
    mockGetAccessToken.mockResolvedValue(null);
    mockInsforgeGetCurrentSession.mockResolvedValue({ data: { session: null } });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ authenticated: false }),
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
        </AuthProvider>,
      );
    });
    expect(screen.getByTestId('child')).toHaveTextContent('Hello');
  });

  it('exposes authenticated user from SDK', async () => {
    mockSdkUser = {
      id: 'u1',
      email: 'test@test.com',
      profile: { name: 'Test User' },
    };

    await act(async () => {
      renderWithProviders(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>,
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });
    expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
    expect(screen.getByTestId('user-email')).toHaveTextContent('test@test.com');
  });

  it('recovers session from cookies when SDK has no user', async () => {
    mockGetAccessToken.mockResolvedValue('fresh-token');
    mockInsforgeGetCurrentSession.mockResolvedValue({
      data: {
        session: {
          user: { id: 'u2', email: 'recovered@test.com', profile: null },
        },
      },
    });

    await act(async () => {
      renderWithProviders(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>,
      );
    });

    await waitFor(() => {
      expect(mockGetAccessToken).toHaveBeenCalled();
    });
    expect(mockReloadAuth).toHaveBeenCalled();
    expect(mockSetUser).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'u2', email: 'recovered@test.com' }),
    );
  });

  it('sets unauthenticated state when recovery fails', async () => {
    mockGetAccessToken.mockResolvedValue(null);

    await act(async () => {
      renderWithProviders(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>,
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });
    expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
  });

  it('returns verification-required state from signUp', async () => {
    mockSdkSignUp.mockResolvedValue({ data: { requireEmailVerification: true }, error: null });

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
        requiresEmailVerification: true,
        email: 'user@example.com',
      });
    });
  });

  it('reloads auth and bridges sdk user after successful signIn', async () => {
    mockAuthSignIn.mockResolvedValue({
      success: true,
      user: {
        id: 'u1',
        email: 'user@example.com',
        name: 'Tester',
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
          <SignInConsumer />
        </AuthProvider>,
      );
    });

    await waitFor(() => {
      expect(signInResult).toEqual({ success: true, error: undefined });
    });
    expect(mockReloadAuth).toHaveBeenCalled();
    expect(mockSetUser).toHaveBeenCalledWith({
      id: 'u1',
      email: 'user@example.com',
      profile: {
        name: 'Tester',
        avatar_url: undefined,
      },
    });
  });

  it('treats empty resend verification result as failure', async () => {
    mockResendVerificationEmail.mockResolvedValue(null);

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
        </AuthProvider>,
      );
    });

    await waitFor(() => {
      expect(resendResult).toEqual({
        success: false,
        error: '重新发送失败，请稍后重试',
      });
    });
  });

  it('reloads auth after successful email verification', async () => {
    mockVerifyEmail.mockResolvedValue({ data: { success: true }, error: null });

    let verifyResult: Awaited<ReturnType<ReturnType<typeof useAuth>['verifyEmail']>> | null = null;

    function VerifyConsumer() {
      const auth = useAuth();
      useEffect(() => {
        void auth.verifyEmail('123456', 'user@example.com').then((result) => {
          verifyResult = result;
        });
      }, [auth]);
      return null;
    }

    await act(async () => {
      renderWithProviders(
        <AuthProvider>
          <VerifyConsumer />
        </AuthProvider>,
      );
    });

    await waitFor(() => {
      expect(verifyResult).toEqual({ success: true });
    });
    expect(mockReloadAuth).toHaveBeenCalled();
  });

  it('delegates Google OAuth to auth helper', async () => {
    mockAuthSignInWithGoogle.mockResolvedValue({ success: true });

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
    expect(mockAuthSignInWithGoogle).toHaveBeenCalled();
  });
});
