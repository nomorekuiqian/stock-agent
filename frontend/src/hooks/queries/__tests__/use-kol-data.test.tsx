import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { useKolCockpitHighConviction } from '../use-kol-data';
import { api } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  api: {
    kolResearch: {
      cockpitHighConviction: vi.fn(),
    },
  },
}));

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
