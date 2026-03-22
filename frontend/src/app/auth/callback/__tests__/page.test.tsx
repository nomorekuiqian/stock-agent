import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import AuthCallbackPage from '../page';

const mockPush = vi.fn();
let mockSearchParams = new URLSearchParams();
const mockCompleteOAuthSignIn = vi.fn();
const mockSetAuthenticatedUser = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => mockSearchParams,
}));

vi.mock('@/lib/auth', () => ({
  completeOAuthSignIn: (...args: unknown[]) => mockCompleteOAuthSignIn(...args),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    setAuthenticatedUser: mockSetAuthenticatedUser,
  }),
}));

describe('/auth/callback page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    sessionStorage.setItem('auth_redirect', '/for-you');
    mockSearchParams = new URLSearchParams();
  });

  it('exchanges oauth code then redirects to stored path', async () => {
    mockSearchParams = new URLSearchParams('insforge_code=code123');
    mockCompleteOAuthSignIn.mockResolvedValue({
      success: true,
      user: { id: 'u1', email: 'oauth@example.com' },
    });

    render(<AuthCallbackPage />);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/for-you');
    });
    expect(mockSetAuthenticatedUser).toHaveBeenCalledWith({
      id: 'u1',
      email: 'oauth@example.com',
    });
    expect(sessionStorage.getItem('auth_redirect')).toBeNull();
    expect(mockCompleteOAuthSignIn).toHaveBeenCalledWith();
  });

  it('redirects to login when oauth exchange fails', async () => {
    mockSearchParams = new URLSearchParams('insforge_code=code123');
    mockCompleteOAuthSignIn.mockResolvedValue({ success: false, error: 'auth_failed' });

    render(<AuthCallbackPage />);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/login?error=auth_failed');
    });
  });

  it('redirects to login with error param from URL', async () => {
    mockSearchParams = new URLSearchParams('error=access_denied');

    render(<AuthCallbackPage />);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/login?error=access_denied');
    });
  });
});
