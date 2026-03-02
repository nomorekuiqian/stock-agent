import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, cleanup } from '@testing-library/react';
import { AuthProvider, useAuth } from '../AuthContext';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const mockSetUser = vi.fn();
const mockReloadAuth = vi.fn();
const mockSignOut = vi.fn();
let mockSdkUser: Record<string, unknown> | null = null;
let mockIsLoaded = true;

vi.mock('@insforge/nextjs', () => ({
  useInsforge: () => ({
    user: mockSdkUser,
    isLoaded: mockIsLoaded,
    setUser: mockSetUser,
    reloadAuth: mockReloadAuth,
    signOut: mockSignOut,
  }),
}));

const mockSetAuthToken = vi.fn();
vi.mock('@/lib/insforge', () => ({
  insforge: {
    getHttpClient: () => ({ setAuthToken: mockSetAuthToken }),
    auth: { getCurrentSession: vi.fn() },
  },
}));

vi.mock('@/lib/auth', () => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  signInWithGoogle: vi.fn(),
  updateProfile: vi.fn(),
  isTokenExpired: vi.fn().mockReturnValue(false),
  setCachedToken: vi.fn(),
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('AuthContext', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSdkUser = null;
    mockIsLoaded = true;
    // Default: cookie recovery returns unauthenticated
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ authenticated: false }),
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
      render(
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
      render(
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

  it('recovers session from cookies when SDK has no user', async () => {
    mockSdkUser = null;

    const fakeHeader = btoa(JSON.stringify({ alg: 'HS256' }));
    const fakePayload = btoa(JSON.stringify({ exp: Date.now() / 1000 + 3600 }));
    const fakeToken = `${fakeHeader}.${fakePayload}.sig`;

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        authenticated: true,
        accessToken: fakeToken,
        user: { id: 'u2', email: 'recovered@test.com', profile: null },
      }),
    });

    await act(async () => {
      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>
      );
    });

    await waitFor(() => {
      expect(mockSetUser).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'u2', email: 'recovered@test.com' })
      );
    });
    expect(mockSetAuthToken).toHaveBeenCalledWith(fakeToken);
  });

  it('sets isAuthenticated=false when recovery fails', async () => {
    mockSdkUser = null;
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false });

    await act(async () => {
      render(
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

  it('resolves loading when SDK finds user even if cookie recovery is pending', async () => {
    // Start with no user — recovery will fire
    mockSdkUser = null;
    mockIsLoaded = true;

    // Simulate a slow cookie recovery that never resolves during this test
    globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}));

    const { rerender } = await act(async () => {
      return render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>
      );
    });

    // While cookie recovery is pending, loading should be true
    expect(screen.getByTestId('loading')).toHaveTextContent('true');

    // SDK independently discovers user (e.g., from storage)
    mockSdkUser = {
      id: 'u3',
      email: 'sdk-found@test.com',
      profile: { name: 'SDK User' },
    };

    await act(async () => {
      rerender(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>
      );
    });

    // isRecovering = recoveryPending && !sdk.user = true && false = false
    // So isLoading should become false even though cookie recovery never finished
    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });
    expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
    expect(screen.getByTestId('user-email')).toHaveTextContent('sdk-found@test.com');
  });

  it('throws when useAuth is called outside AuthProvider', () => {
    // Suppress console.error from React rendering error
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      render(<AuthConsumer />);
    }).toThrow('useAuth must be used within an AuthProvider');

    spy.mockRestore();
  });
});
