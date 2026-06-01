import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { AIPaywall } from '../shared';

const mockUseAuth = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: (...args: unknown[]) => mockUseAuth(...args),
}));

beforeEach(() => {
  mockUseAuth.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('AIPaywall - post-freemium CTA', () => {
  it('shows "免费注册" link when unauthenticated', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false });

    render(<AIPaywall symbol="AAPL" label="AI 分析" />);

    expect(screen.getByText('免费注册')).toBeTruthy();
    // Trial copy must be gone
    expect(screen.queryByText('14 天免费试用')).toBeNull();
    expect(screen.queryByText('开启 14 天免费试用')).toBeNull();
    expect(screen.queryByText('你的试用已结束')).toBeNull();
  });

  it('shows "升级 Max" link when authenticated (no Max entitlement)', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true });

    render(<AIPaywall symbol="AAPL" label="AI 分析" />);

    expect(screen.getByText('升级 Max')).toBeTruthy();
    // Trial copy must be gone
    expect(screen.queryByText('开启 14 天免费试用')).toBeNull();
    expect(screen.queryByText('你的试用已结束')).toBeNull();
  });

  it('always renders the Max-only header copy', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true });

    render(<AIPaywall symbol="AAPL" label="AI 分析" />);

    expect(screen.getByText('Max 订阅专属')).toBeTruthy();
  });
});
