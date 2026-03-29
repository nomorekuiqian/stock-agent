import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ForgotPasswordPage from '../page';

const mockPush = vi.fn();
const mockSendPasswordResetEmail = vi.fn();
const mockExchangeResetPasswordCode = vi.fn();
const mockResetPassword = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={typeof href === 'string' ? href : '#'} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/app/actions/auth', () => ({
  sendPasswordResetEmailAction: (...args: unknown[]) => mockSendPasswordResetEmail(...args),
  exchangeResetPasswordCodeAction: (...args: unknown[]) => mockExchangeResetPasswordCode(...args),
  resetPasswordAction: (...args: unknown[]) => mockResetPassword(...args),
}));

describe('/forgot-password page', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('moves from email step to code step after email is sent', async () => {
    mockSendPasswordResetEmail.mockResolvedValue({ success: true });

    render(<ForgotPasswordPage />);

    fireEvent.change(screen.getByLabelText('邮箱地址'), { target: { value: 'user@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: '发送验证码' }));

    expect(await screen.findByRole('heading', { name: '输入验证码' })).toBeInTheDocument();
  });

  it('shows validation error when verification code is incomplete', async () => {
    mockSendPasswordResetEmail.mockResolvedValue({ success: true });

    render(<ForgotPasswordPage />);

    fireEvent.change(screen.getByLabelText('邮箱地址'), { target: { value: 'user@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: '发送验证码' }));
    await screen.findByRole('heading', { name: '输入验证码' });

    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: '1' } });
    expect(screen.getByRole('button', { name: '验证' })).toBeDisabled();

    expect(mockExchangeResetPasswordCode).not.toHaveBeenCalled();
  });

  it('blocks password reset when password is shorter than 6 characters', async () => {
    mockSendPasswordResetEmail.mockResolvedValue({ success: true });
    mockExchangeResetPasswordCode.mockResolvedValue({ success: true, token: 'reset-token' });

    render(<ForgotPasswordPage />);

    fireEvent.change(screen.getByLabelText('邮箱地址'), { target: { value: 'user@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: '发送验证码' }));
    await screen.findByRole('heading', { name: '输入验证码' });

    for (const [index, input] of screen.getAllByRole('textbox').entries()) {
      fireEvent.change(input, { target: { value: String(index + 1) } });
    }
    fireEvent.click(screen.getByRole('button', { name: '验证' }));

    await screen.findByRole('heading', { name: '设置新密码' });

    fireEvent.change(screen.getByLabelText('新密码'), { target: { value: '12345' } });
    fireEvent.change(screen.getByLabelText('确认密码'), { target: { value: '12345' } });
    fireEvent.click(screen.getByRole('button', { name: '重置密码' }));

    expect(await screen.findByText('密码长度至少为6位')).toBeInTheDocument();
    expect(mockResetPassword).not.toHaveBeenCalled();
  });

  it('toggles password visibility in reset step', async () => {
    mockSendPasswordResetEmail.mockResolvedValue({ success: true });
    mockExchangeResetPasswordCode.mockResolvedValue({ success: true, token: 'reset-token' });

    render(<ForgotPasswordPage />);

    fireEvent.change(screen.getByLabelText('邮箱地址'), { target: { value: 'user@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: '发送验证码' }));
    await screen.findByRole('heading', { name: '输入验证码' });

    for (const [index, input] of screen.getAllByRole('textbox').entries()) {
      fireEvent.change(input, { target: { value: String(index + 1) } });
    }
    fireEvent.click(screen.getByRole('button', { name: '验证' }));

    const newPasswordInput = await screen.findByLabelText('新密码') as HTMLInputElement;
    expect(newPasswordInput.type).toBe('password');

    fireEvent.click(screen.getByRole('button', { name: '显示新密码' }));
    expect(newPasswordInput.type).toBe('text');

    fireEvent.click(screen.getByRole('button', { name: '隐藏新密码' }));
    expect(newPasswordInput.type).toBe('password');
  });
});
