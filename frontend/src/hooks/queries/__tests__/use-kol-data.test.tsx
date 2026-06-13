import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { useKolCockpitFeed, useKolCockpitHighConviction } from '../use-kol-data';
import { api } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  api: {
    kolResearch: {
      cockpitFeed: vi.fn(),
      cockpitHighConviction: vi.fn(),
    },
  },
}));

const mockFeed = vi.mocked(api.kolResearch.cockpitFeed);
const mockHighConviction = vi.mocked(api.kolResearch.cockpitHighConviction);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  return { Wrapper };
}

describe('useKolCockpitHighConviction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches the high-conviction grid for the selected persona', async () => {
    const payload = {
      groups: [
        {
          sector_key: 'photonics-and-cpo',
          sector_label: '光子学与 CPO',
          sector_eyebrow: 'PHOTONICS',
          sector_short: 'AI 资本开支下游物理咽喉',
          tickers: [
            {
              ticker: 'SIVE',
              mentions: 12,
              coverage: 'high',
              region: 'SE',
              thesis: 'CW DFB 激光器客户导入',
              priceable: true,
              price: 89.4,
              daily_change: 13.45,
            },
          ],
        },
      ],
    };
    mockHighConviction.mockResolvedValue(payload);
    const { Wrapper } = createWrapper();

    const { result } = renderHook(
      () => useKolCockpitHighConviction('aleabitoreddit'),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockHighConviction).toHaveBeenCalledWith('aleabitoreddit');
    expect(result.current.data).toEqual(payload);
  });

  it('does not fetch when username is empty', () => {
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useKolCockpitHighConviction(''), {
      wrapper: Wrapper,
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockHighConviction).not.toHaveBeenCalled();
  });
});

describe('useKolCockpitFeed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes ticker and keyword filters through to the API layer', async () => {
    const payload = {
      tweets: [],
      total: 0,
      raw_total: 0,
      has_more: false,
      offset: 0,
      limit: 1500,
    };
    const opts = {
      limit: 1500,
      tickers: ['HOOD', 'COIN'],
      keywords: ['RWA', '代币化'],
    };
    mockFeed.mockResolvedValue(payload);
    const { Wrapper } = createWrapper();

    const { result } = renderHook(
      () => useKolCockpitFeed('qinbafrank', opts),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFeed).toHaveBeenCalledWith('qinbafrank', opts);
    expect(result.current.data).toEqual(payload);
  });

  it('does not fetch when username is empty', () => {
    const { Wrapper } = createWrapper();

    const { result } = renderHook(
      () => useKolCockpitFeed('', { tickers: ['HOOD'], keywords: ['RWA'] }),
      { wrapper: Wrapper },
    );

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockFeed).not.toHaveBeenCalled();
  });
});
