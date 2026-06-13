import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import LoginPage from '../page';

const mockPush = vi.fn();
const mockSignIn = vi.fn();
const mockSignUp = vi.fn();
const mockSignInWithGoogle = vi.fn();

let mockSearchParams = new URLSearchParams();
let mockAuthState = {
  signIn: mockSignIn,
  signUp: mockSignUp,
  signInWithGoogle: mockSignInWithGoogle,
  isAuthenticated: false,
  isLoading: false,
};

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => mockSearchParams,
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={typeof href === 'string' ? href : '#'} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockAuthState,
}));

describe('/login page', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    sessionStorage.clear();
    mockSearchParams = new URLSearchParams();
    mockAuthState = {
      signIn: mockSignIn,
      signUp: mockSignUp,
      signInWithGoogle: mockSignInWithGoogle,
      isAuthenticated: false,
      isLoading: false,
    };
  });

  it('shows translated auth error from query string', async () => {
    mockSearchParams = new URLSearchParams('error=auth_failed');

    render(<LoginPage />);

    expect(await screen.findByText('登录完成失败，请重试')).toBeInTheDocument();
  });

  it('stores sanitized redirect path in sessionStorage', async () => {
    mockSearchParams = new URLSearchParams('redirect=https://evil.com/phish');

    render(<LoginPage />);

    await waitFor(() => {
      expect(sessionStorage.getItem('auth_redirect')).toBe('/today');
    });
  });

  it('opens the sign-up form when mode=signup is provided', () => {
    mockSearchParams = new URLSearchParams('mode=signup&redirect=%2Frequest-access');

    render(<LoginPage />);

    expect(screen.getByRole('heading', { name: '创建账户' })).toBeInTheDocument();
    expect(screen.getByLabelText('姓名')).toBeInTheDocument();
  });

  it('redirects authenticated users to stored redirect and clears sessionStorage', async () => {
    mockSearchParams = new URLSearchParams('redirect=%2Ffor-you');
    mockAuthState = {
      ...mockAuthState,
      isAuthenticated: true,
      isLoading: false,
    };

    render(<LoginPage />);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/for-you');
    });
    expect(sessionStorage.getItem('auth_redirect')).toBeNull();
  });

  it('translates sign-in errors returned by AuthContext', async () => {
    mockSignIn.mockResolvedValue({ success: false, error: 'invalid credentials' });

    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'bad@example.com' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'wrong-password' } });
    fireEvent.click(screen.getAllByRole('button', { name: '登录' })[0]);

    expect(await screen.findByText('邮箱或密码错误')).toBeInTheDocument();
  });

  it('translates request failed auth errors returned by AuthContext', async () => {
    mockSignIn.mockResolvedValue({ success: false, error: 'Request failed: Unauthorized' });

    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'bad@example.com' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'wrong-password' } });
    fireEvent.click(screen.getAllByRole('button', { name: '登录' })[0]);

    expect(await screen.findByText('邮箱或密码错误')).toBeInTheDocument();
  });

  it('toggles password visibility in email auth form', () => {
    render(<LoginPage />);

    const passwordInput = screen.getByLabelText('密码') as HTMLInputElement;
    expect(passwordInput.type).toBe('password');

    fireEvent.click(screen.getByRole('button', { name: '显示密码' }));
    expect(passwordInput.type).toBe('text');

    fireEvent.click(screen.getByRole('button', { name: '隐藏密码' }));
    expect(passwordInput.type).toBe('password');
  });

  it('redirects sign-up users into verify-email flow when email verification is required', async () => {
    mockSignUp.mockResolvedValue({
      success: true,
      requiresEmailVerification: true,
      email: 'user@example.com',
    });

    render(<LoginPage />);

    fireEvent.click(screen.getByRole('button', { name: '注册' }));
    fireEvent.change(screen.getByLabelText('姓名'), { target: { value: 'Tester' } });
    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'Password123!' } });
    fireEvent.click(screen.getByRole('button', { name: '创建账户' }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/verify-email?redirect=%2Ftoday&email=user%40example.com');
    });
    expect(sessionStorage.getItem('pending_verification_email')).toBe('user@example.com');
    expect(sessionStorage.getItem('pending_verification_name')).toBe('Tester');
  });
});
