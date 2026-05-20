import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ActionBar } from '../ActionBar';

// Mocks
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

const mockData = vi.fn();
vi.mock('@/hooks/queries/use-action-bar', () => ({
  useActionBar: () => mockData(),
}));

vi.mock('@/hooks/queries/use-portfolio', () => ({
  useTouchPortfolio: () => ({ mutateAsync: vi.fn() }),
}));

function renderBar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ActionBar />
    </QueryClientProvider>,
  );
}

describe('ActionBar visibility', () => {
  beforeEach(() => mockData.mockReset());

  it('renders nothing when visibility=hidden', () => {
    mockData.mockReturnValue({
      data: {
        severity: 'green',
        headline: '',
        chips: [],
        source: 'agent',
        visibility: 'hidden',
        generated_at: '2026-04-25T00:00:00Z',
      },
      isLoading: false,
      isError: false,
    });
    const { container } = renderBar();
    expect(container.firstChild).toBeNull();
  });

  it('renders headline only when chips empty', () => {
    mockData.mockReturnValue({
      data: {
        severity: 'green',
        headline: '组合今日涨 1.4%',
        chips: [],
        source: 'agent',
        visibility: 'visible',
        generated_at: '2026-04-25T00:00:00Z',
      },
      isLoading: false,
      isError: false,
    });
    renderBar();
    expect(screen.getByText('组合今日涨 1.4%')).toBeInTheDocument();
  });

  it('renders chips when present', () => {
    mockData.mockReturnValue({
      data: {
        severity: 'green',
        headline: '',
        chips: [
          { label: '补 NVDA 论点', target: 'thesis:NVDA', link: '#stock-NVDA', kind: 'thesis' },
        ],
        source: 'agent',
        visibility: 'visible',
        generated_at: '2026-04-25T00:00:00Z',
      },
      isLoading: false,
      isError: false,
    });
    renderBar();
    // Chip is rendered once for mobile and once for sm+ breakpoints; both hit the DOM in jsdom.
    expect(screen.getAllByText('补 NVDA 论点').length).toBeGreaterThan(0);
  });
});
