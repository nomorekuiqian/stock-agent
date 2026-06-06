import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import CheckoutSuccessPage from '../page';

const mockReplace = vi.fn();
const mockSearchParams = new URLSearchParams();
const mockUseAuth = vi.fn();
const mockGetAccessTokenAsync = vi.fn();
const mockSetQueryData = vi.fn();
const mockInvalidateQueries = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => mockSearchParams,
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: (...args: unknown[]) => mockUseAuth(...args),
  getAccessTokenAsync: (...args: unknown[]) => mockGetAccessTokenAsync(...args),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    setQueryData: mockSetQueryData,
    invalidateQueries: mockInvalidateQueries,
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockSearchParams.delete('next');
  mockSearchParams.delete('tier');
  mockSearchParams.set('next', '/research?agent=kol&persona=qinbafrank');
  mockSearchParams.set('tier', 'max');
  mockUseAuth.mockReturnValue({
    user: { id: 'user-1', email: 'test@example.com' },
    isLoading: false,
  });
  mockGetAccessTokenAsync.mockResolvedValue('token-1');
  mockInvalidateQueries.mockResolvedValue(undefined);
});

describe('CheckoutSuccessPage', () => {
  it('waits for max entitlement before redirecting to the return path', async () => {
    globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/payment/subscription-status?fresh=true')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            plan: 'max',
            status: 'active',
            current_period_end: null,
            access_expires_at: null,
          }),
        } as Response);
      }
      if (url.includes('/payment/me/entitlements?fresh=true')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            entitlements: ['ai_research_engine'],
            trial_eligible: false,
          }),
        } as Response);
      }
      return Promise.resolve({ ok: false, status: 404 } as Response);
    });

    render(<CheckoutSuccessPage />);

    await waitFor(() => {
      expect(screen.getByText('订阅已激活，正在跳转...')).toBeDefined();
    });

    expect(mockSetQueryData).toHaveBeenCalledWith(
      ['entitlements', 'me'],
      { entitlements: ['ai_research_engine'], trial_eligible: false },
    );
    expect(mockSetQueryData).toHaveBeenCalledWith(
      ['subscription-status', 'user-1'],
      {
        plan: 'max',
        status: 'active',
        current_period_end: null,
        access_expires_at: null,
      },
    );

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/research?agent=kol&persona=qinbafrank');
    });
  });
});
