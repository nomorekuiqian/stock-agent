import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PandaPage from '../page';

const mockPandaMe = vi.fn();
const mockSignOut = vi.fn();

type MockAuthState = {
  isLoading: boolean;
  user: { id: string; email: string } | null;
  signOut: typeof mockSignOut;
};

let mockAuthState: MockAuthState = {
  isLoading: false,
  user: { id: 'user-1', email: 'member@example.com' },
  signOut: mockSignOut,
};

vi.mock('next/image', () => ({
  default: ({ alt, src, priority: _priority, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) => {
    void _priority;
    return React.createElement('img', {
      alt,
      src: typeof src === 'string' ? src : '',
      ...props,
    });
  },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockAuthState,
}));

vi.mock('@/lib/api', () => ({
  api: {
    communityPanda: {
      me: () => mockPandaMe(),
    },
  },
}));

vi.mock('@/app/research/page', () => ({
  ResearchWorkspace: () => <div>Research Workspace</div>,
}));

describe('/panda page', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    mockSignOut.mockResolvedValue({ success: true });
    mockAuthState = {
      isLoading: false,
      user: { id: 'user-1', email: 'member@example.com' },
      signOut: mockSignOut,
    };
  });

  it('shows the logged-out Panda gate without calling access API', async () => {
    mockAuthState = {
      ...mockAuthState,
      user: null,
    };

    render(<PandaPage />);

    expect(screen.getByText('欢迎使用 潘大科技圈专属投研助手')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '登录' })).toHaveAttribute('href', '/login?redirect=%2Fpanda');
    expect(screen.getByRole('link', { name: '注册' })).toHaveAttribute('href', '/login?mode=signup&redirect=%2Fpanda');
    expect(mockPandaMe).not.toHaveBeenCalled();
  });

  it('shows a separate verification failure state when access API cannot be reached', async () => {
    mockPandaMe.mockRejectedValue(new TypeError('Failed to fetch'));

    render(<PandaPage />);

    expect(await screen.findByText('暂时无法验证访问权限')).toBeInTheDocument();
    expect(screen.getByText('暂时无法连接权限服务，请稍后重试。')).toBeInTheDocument();
    expect(screen.queryByText('当前账号未开通')).not.toBeInTheDocument();
  });

  it('shows not-opened state only when the access API returns has_access false', async () => {
    mockPandaMe.mockResolvedValue({
      partner_id: 'panda',
      persona_username: 'pandacircle',
      has_access: false,
      email: 'member@example.com',
      grant: null,
    });

    render(<PandaPage />);

    expect(await screen.findByText('当前账号未开通')).toBeInTheDocument();
    expect(screen.queryByText('暂时无法验证访问权限')).not.toBeInTheDocument();
  });

  it('shows a focused Panda navbar after access is granted', async () => {
    mockPandaMe.mockResolvedValue({
      partner_id: 'panda',
      persona_username: 'pandacircle',
      has_access: true,
      email: 'member@example.com',
      grant: { email: 'member@example.com', email_normalized: 'member@example.com', status: 'active' },
    });

    render(<PandaPage />);

    expect(await screen.findByText('Research Workspace')).toBeInTheDocument();
    expect(screen.getByText('专属投研助手')).toBeInTheDocument();
    expect(screen.getByText('member@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /退出登录/ })).toBeInTheDocument();
  });

  it('shows a re-login gate after signing out from the Panda workspace', async () => {
    mockPandaMe.mockResolvedValue({
      partner_id: 'panda',
      persona_username: 'pandacircle',
      has_access: true,
      email: 'member@example.com',
      grant: { email: 'member@example.com', email_normalized: 'member@example.com', status: 'active' },
    });

    render(<PandaPage />);

    await screen.findByRole('button', { name: /退出登录/ });
    await act(async () => {
      screen.getByText('退出登录').click();
    });

    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
    expect(await screen.findByRole('link', { name: '重新登录' })).toHaveAttribute(
      'href',
      '/login?redirect=%2Fpanda',
    );
    expect(screen.queryByText('Research Workspace')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '注册' })).not.toBeInTheDocument();
  });

  it('can retry access verification after a network failure', async () => {
    mockPandaMe
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({
        partner_id: 'panda',
        persona_username: 'pandacircle',
        has_access: false,
        email: 'member@example.com',
        grant: null,
      });

    render(<PandaPage />);

    expect(await screen.findByText('暂时无法验证访问权限')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重试验证' }));

    await waitFor(() => expect(mockPandaMe).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('当前账号未开通')).toBeInTheDocument();
  });
});
