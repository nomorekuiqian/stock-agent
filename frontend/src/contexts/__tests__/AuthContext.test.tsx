import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, cleanup } from '@testing-library/react';
import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '../AuthContext';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const mockReloadAuth = vi.fn();
const mockSignOut = vi.fn();
const mockSignIn = vi.fn();
const mockSignUp = vi.fn();
const mockUpdateUser = vi.fn();
const mockLoginWithOAuth = vi.fn();
const mockResendVerificationEmail = vi.fn();
const mockVerifyEmail = vi.fn();
const mockSetUser = vi.fn();
let mockSdkUser: Record<string, unknown> | null = null;
let mockIsLoaded = true;
const originalFetch = globalThis.fetch;

vi.mock('@insforge/nextjs', () => ({
  useInsforge: () => ({
    user: mockSdkUser,
    isLoaded: mockIsLoaded,
    signIn: mockSignIn,
    signUp: mockSignUp,
    reloadAuth: mockReloadAuth,
    signOut: mockSignOut,
    updateUser: mockUpdateUser,
    loginWithOAuth: mockLoginWithOAuth,
    resendVerificationEmail: mockResendVerificationEmail,
    verifyEmail: mockVerifyEmail,
    setUser: mockSetUser,
  }),
}));

vi.mock('@/lib/insforge', () => ({
  insforge: {
    auth: { getCurrentSession: vi.fn() },
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
    mockSdkUser = null;
    mockIsLoaded = true;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({}),
    });
    // Suppress localStorage errors in jsdom
    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {});
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
        </AuthProvider>
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });
    expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
    expect(screen.getByTestId('user-email')).toHaveTextContent('test@test.com');
  });

  it('shows not authenticated when SDK has no user', async () => {
    mockSdkUser = null;
    mockIsLoaded = true;

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

  it('shows loading when SDK is not yet loaded', async () => {
    mockSdkUser = null;
    mockIsLoaded = false;

    await act(async () => {
      renderWithProviders(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>
      );
    });

    expect(screen.getByTestId('loading')).toHaveTextContent('true');
  });

  it('throws when useAuth is called outside AuthProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      render(<AuthConsumer />);
    }).toThrow('useAuth must be used within an AuthProvider');

    spy.mockRestore();
  });

  it('returns verification-required state from signUp without treating it as error', async () => {
    mockSignUp.mockResolvedValue({ requireEmailVerification: true });

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
      user: {
        id: 'u1',
        email: 'user@example.com',
        emailVerified: false,
      },
      accessToken: null,
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

  it('syncs token storage and sdk user after successful signIn', async () => {
    mockSdkUser = {
      id: 'existing-user',
      email: 'existing@example.com',
      profile: null,
    };
    globalThis.fetch = vi.fn().mockResolvedValue({
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
        </AuthProvider>
      );
    });

    await waitFor(() => {
      expect(signInResult).toEqual({ success: true });
    });
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/auth', expect.objectContaining({
      method: 'POST',
      credentials: 'include',
    }));
    expect(mockSetUser).toHaveBeenCalledWith({
      id: 'u1',
      email: 'user@example.com',
      profile: { name: 'Tester' },
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
});
