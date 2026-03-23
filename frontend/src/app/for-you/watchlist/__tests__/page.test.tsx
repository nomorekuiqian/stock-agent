import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import WatchlistPage from '../page';

const mockPush = vi.fn();
const mockUseAuth = vi.fn();
const mockUseWatchlist = vi.fn();
const mockUseSaveWatchlist = vi.fn();
const mockUseStockQuotes = vi.fn();
const mockUseStockSearch = vi.fn();
const mockListSectors = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: (...args: unknown[]) => mockUseAuth(...args),
}));

vi.mock('@/components/PaywallGuard', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/StockCard', () => ({
  default: ({
    symbol,
    onRemove,
  }: {
    symbol: string;
    onRemove?: () => void;
  }) => (
    <div>
      <span>{symbol}</span>
      <button type="button" onClick={onRemove}>
        remove-{symbol}
      </button>
    </div>
  ),
}));

vi.mock('@/components/StockSearchDropdown', () => ({
  default: () => null,
}));

vi.mock('@/hooks/queries/use-watchlist', () => ({
  useWatchlist: (...args: unknown[]) => mockUseWatchlist(...args),
  useSaveWatchlist: (...args: unknown[]) => mockUseSaveWatchlist(...args),
}));

vi.mock('@/hooks/queries/use-stock-data', () => ({
  useStockQuotes: (...args: unknown[]) => mockUseStockQuotes(...args),
}));

vi.mock('@/hooks/useStockSearch', () => ({
  useStockSearch: (...args: unknown[]) => mockUseStockSearch(...args),
}));

vi.mock('@/lib/api', () => ({
  api: {
    sectors: {
      list: (...args: unknown[]) => mockListSectors(...args),
    },
  },
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <WatchlistPage />
    </QueryClientProvider>
  );
}

describe('for-you watchlist page', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockPush.mockReset();
    mockListSectors.mockResolvedValue([]);
    mockUseAuth.mockReturnValue({
      user: { id: 'user-1', email: 'tester@example.com' },
      isLoading: false,
      isAuthenticated: true,
    });
    mockUseWatchlist.mockReturnValue({
      data: {
        user_id: 'user-1',
        symbols: ['AAPL'],
        updated_at: '2026-03-06T09:00:00Z',
      },
      isLoading: false,
      isError: false,
      isSuccess: true,
    });
    mockUseStockQuotes.mockReturnValue({
      data: { quotes: [] },
      isLoading: false,
    });
    mockUseStockSearch.mockReturnValue({
      query: '',
      results: [],
      isSearching: false,
      open: false,
      containerRef: { current: null },
      onQueryChange: vi.fn(),
      inputHandlers: {
        onCompositionStart: vi.fn(),
        onCompositionEnd: vi.fn(),
        onFocus: vi.fn(),
      },
      resetAfterSelect: vi.fn(),
      closeDropdown: vi.fn(),
      clearSearch: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('rolls back local symbols and shows an error when save fails', async () => {
    const mutate = vi.fn((_vars, options?: { onError?: (error: Error) => void }) => {
      options?.onError?.(new Error('保存失败'));
    });
    mockUseSaveWatchlist.mockReturnValue({
      mutate,
      isPending: false,
    });

    renderPage();

    expect(screen.getByRole('button', { name: 'remove-AAPL' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'remove-AAPL' }));
    expect(screen.queryByRole('button', { name: 'remove-AAPL' })).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });

    expect(screen.getByRole('button', { name: 'remove-AAPL' })).toBeInTheDocument();
    expect(screen.getByText('保存失败')).toBeInTheDocument();
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        symbols: [],
        baseUpdatedAt: '2026-03-06T09:00:00Z',
      }),
      expect.objectContaining({
        onError: expect.any(Function),
        onSuccess: expect.any(Function),
      }),
    );
  });

  it('shows conflict-specific message when stale data is rejected', async () => {
    const mutate = vi.fn((_vars, options?: { onError?: (error: Error) => void }) => {
      options?.onError?.(
        Object.assign(
          new Error('Watchlist was updated elsewhere. Please refresh and try again.'),
          { status: 409 },
        ),
      );
    });
    mockUseSaveWatchlist.mockReturnValue({
      mutate,
      isPending: false,
    });

    renderPage();

    expect(screen.getByRole('button', { name: 'remove-AAPL' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'remove-AAPL' }));

    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });

    expect(screen.getByText('持仓已在其他页面被更新，已恢复到最新保存版本，请刷新后重试。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'remove-AAPL' })).toBeInTheDocument();
  });
});
