import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import VerifyEmailPage from '../page';

const mockPush = vi.fn();
const mockVerifyEmail = vi.fn();
const mockResendVerificationEmail = vi.fn();
const mockUpdateProfile = vi.fn();
let mockSearchParams = new URLSearchParams('email=user@example.com&redirect=%2Ffor-you');
let mockVerifyMethod = 'code';

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

vi.mock('@/lib/insforge', () => ({
  insforge: {
    auth: {
      getPublicAuthConfig: () => Promise.resolve({
        data: { verifyEmailMethod: mockVerifyMethod },
        error: null,
      }),
    },
  },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    verifyEmail: mockVerifyEmail,
    resendVerificationEmail: mockResendVerificationEmail,
    updateProfile: mockUpdateProfile,
  }),
}));

describe('/verify-email page', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    sessionStorage.clear();
    mockVerifyMethod = 'code';
    mockSearchParams = new URLSearchParams('email=user@example.com&redirect=%2Ffor-you');
  });

  it('renders code verification flow and resends email', async () => {
    mockResendVerificationEmail.mockResolvedValue({ success: true });

    render(<VerifyEmailPage />);

    expect(screen.getByRole('heading', { name: '查收验证邮件' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重新发送验证邮件' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '重新发送验证邮件' }));

    await waitFor(() => {
      expect(mockResendVerificationEmail).toHaveBeenCalledWith('user@example.com');
    });
    expect(await screen.findByText('验证邮件已重新发送')).toBeInTheDocument();
  });

  it('shows resend failure state when resend request fails', async () => {
    mockResendVerificationEmail.mockResolvedValue({
      success: false,
      error: '邮件发送失败',
    });

    render(<VerifyEmailPage />);

    fireEvent.click(screen.getByRole('button', { name: '重新发送验证邮件' }));

    expect(await screen.findByText('邮件发送失败')).toBeInTheDocument();
  });

  it('verifies code, applies pending profile, and schedules redirect', async () => {
    sessionStorage.setItem('pending_verification_email', 'user@example.com');
    sessionStorage.setItem('pending_verification_name', 'Tester');
    mockVerifyEmail.mockResolvedValue({ success: true });
    mockUpdateProfile.mockResolvedValue({ success: true });
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    render(<VerifyEmailPage />);

    for (const [index, input] of screen.getAllByRole('textbox').entries()) {
      fireEvent.change(input, { target: { value: String(index + 1) } });
    }

    fireEvent.click(screen.getByRole('button', { name: '验证邮箱' }));

    await waitFor(() => {
      expect(mockVerifyEmail).toHaveBeenCalledWith('123456', 'user@example.com');
    });
    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledWith({ name: 'Tester' });
    });
    expect(await screen.findByText('邮箱已验证')).toBeInTheDocument();
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 2000);
  });

  it('clears pending verification state even when profile update fails after verification', async () => {
    sessionStorage.setItem('pending_verification_email', 'user@example.com');
    sessionStorage.setItem('pending_verification_name', 'Tester');
    mockVerifyEmail.mockResolvedValue({ success: true });
    mockUpdateProfile.mockResolvedValue({ success: false, error: 'profile update failed' });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(<VerifyEmailPage />);

    for (const [index, input] of screen.getAllByRole('textbox').entries()) {
      fireEvent.change(input, { target: { value: String(index + 1) } });
    }

    fireEvent.click(screen.getByRole('button', { name: '验证邮箱' }));

    await waitFor(() => {
      expect(mockVerifyEmail).toHaveBeenCalledWith('123456', 'user@example.com');
    });
    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledWith({ name: 'Tester' });
    });
    expect(sessionStorage.getItem('pending_verification_email')).toBeNull();
    expect(sessionStorage.getItem('pending_verification_name')).toBeNull();
    expect(await screen.findByText('邮箱已验证')).toBeInTheDocument();
    expect(warnSpy).toHaveBeenCalledWith(
      '[VerifyEmailPage] Applying pending profile failed:',
      'profile update failed'
    );
  });

  it('auto-advances between code inputs and supports pasting multiple digits', async () => {
    render(<VerifyEmailPage />);

    const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];

    inputs[0].focus();
    fireEvent.change(inputs[0], { target: { value: '1' } });
    expect(document.activeElement).toBe(inputs[1]);

    fireEvent.paste(inputs[1], {
      clipboardData: {
        getData: () => '23456',
      },
    });

    expect(inputs.map((input) => input.value)).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(document.activeElement).toBe(inputs[5]);
  });

  it('shows code input and resend button when token verification fails', async () => {
    mockSearchParams = new URLSearchParams('token=expired-token&email=user@example.com&redirect=%2Ffor-you');
    mockVerifyEmail.mockResolvedValue({ success: false, error: 'Token expired' });

    render(<VerifyEmailPage />);

    await waitFor(() => {
      expect(mockVerifyEmail).toHaveBeenCalledWith('expired-token', undefined);
    });

    expect(await screen.findByText('Token expired')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '验证邮箱' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重新发送验证邮件' })).toBeInTheDocument();
  });

  it('auto-verifies token links', async () => {
    mockVerifyMethod = 'link';
    mockSearchParams = new URLSearchParams('token=verify-token&redirect=%2Ftoday');
    mockVerifyEmail.mockResolvedValue({ success: true });
    mockUpdateProfile.mockResolvedValue({ success: true });
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    render(<VerifyEmailPage />);

    await waitFor(() => {
      expect(mockVerifyEmail).toHaveBeenCalledWith('verify-token', undefined);
    });
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 2000);
  });
});
