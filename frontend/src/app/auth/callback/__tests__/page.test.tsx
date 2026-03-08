import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import AuthCallbackPage from '../page';

const mockPush = vi.fn();
let mockSearchParams = new URLSearchParams();
let mockIsAuthenticated = false;
let mockIsLoading = true;

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => mockSearchParams,
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: mockIsAuthenticated,
    isLoading: mockIsLoading,
  }),
}));

describe('/auth/callback page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    sessionStorage.setItem('auth_redirect', '/for-you');
    mockSearchParams = new URLSearchParams();
    mockIsAuthenticated = false;
    mockIsLoading = true;
  });

  it('redirects to stored path when authenticated', async () => {
    mockIsAuthenticated = true;
    mockIsLoading = false;

    render(<AuthCallbackPage />);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/for-you');
    });
    expect(sessionStorage.getItem('auth_redirect')).toBeNull();
  });

  it('redirects to login when not authenticated after loading', async () => {
    mockIsAuthenticated = false;
    mockIsLoading = false;

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
