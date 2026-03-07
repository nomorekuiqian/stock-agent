import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import ResetPasswordPage from '../page';

const mockPush = vi.fn();
const mockResetPassword = vi.fn();
let mockSearchParams = new URLSearchParams();

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

vi.mock('@/lib/auth', () => ({
  resetPassword: (...args: unknown[]) => mockResetPassword(...args),
}));

describe('/reset-password page', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
  });

  it('shows invalid link state when token is missing', async () => {
    render(<ResetPasswordPage />);

    expect(await screen.findByText('链接无效')).toBeInTheDocument();
    expect(screen.getByText('无效的重置链接。请重新申请密码重置。')).toBeInTheDocument();
  });

  it('blocks submission when password is shorter than 6 characters', async () => {
    mockSearchParams = new URLSearchParams('token=reset-token');

    render(<ResetPasswordPage />);

    fireEvent.change(await screen.findByLabelText('新密码'), { target: { value: '12345' } });
    fireEvent.change(screen.getByLabelText('确认密码'), { target: { value: '12345' } });
    fireEvent.click(screen.getByRole('button', { name: '重置密码' }));

    expect(await screen.findByText('密码长度至少为6位')).toBeInTheDocument();
    expect(mockResetPassword).not.toHaveBeenCalled();
  });

  it('shows success state and schedules redirect after successful reset', async () => {
    mockSearchParams = new URLSearchParams('otp=reset-token');
    mockResetPassword.mockResolvedValue({ success: true });
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    render(<ResetPasswordPage />);

    fireEvent.change(await screen.findByLabelText('新密码'), { target: { value: '12345678' } });
    fireEvent.change(screen.getByLabelText('确认密码'), { target: { value: '12345678' } });
    fireEvent.click(screen.getByRole('button', { name: '重置密码' }));

    await waitFor(() => {
      expect(mockResetPassword).toHaveBeenCalledWith('12345678', 'reset-token');
    });

    expect(await screen.findByText('密码已重置')).toBeInTheDocument();
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 3000);
  });

  it('toggles password visibility on reset form', async () => {
    mockSearchParams = new URLSearchParams('token=reset-token');

    render(<ResetPasswordPage />);

    const newPasswordInput = await screen.findByLabelText('新密码') as HTMLInputElement;
    expect(newPasswordInput.type).toBe('password');

    fireEvent.click(screen.getByRole('button', { name: '显示新密码' }));
    expect(newPasswordInput.type).toBe('text');

    fireEvent.click(screen.getByRole('button', { name: '隐藏新密码' }));
    expect(newPasswordInput.type).toBe('password');
  });
});
