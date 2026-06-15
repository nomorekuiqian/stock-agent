import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ActivityComparisonPanel,
  type ActivityData,
} from '../ActivityComparisonPanel';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock('@/contexts/AuthContext', () => ({
  getAccessTokenSync: () => 'test-token',
  getAccessTokenAsync: vi.fn(),
}));

const initialData: ActivityData = {
  days: 60,
  daily: [
    { day: '2026-06-08', active_users: 3, event_count: 8, api_calls: 2 },
    { day: '2026-06-09', active_users: 4, event_count: 10, api_calls: 3 },
  ],
  summary: {
    today: 4,
    yesterday: 3,
    avg_7d: 3.5,
    avg_30d: 3.5,
    max_30d: 4,
    events_30d: 18,
    api_calls_30d: 5,
  },
  email_metrics: {
    days: 60,
    start_date: '2026-06-08',
    end_date: '2026-06-09',
    daily: [
      {
        day: '2026-06-08',
        delivered: 10,
        opened: 5,
        clicked: 1,
        bounced: 0,
        complained: 0,
        failed: 0,
        open_rate: 50,
        click_rate: 10,
      },
      {
        day: '2026-06-09',
        delivered: 20,
        opened: 8,
        clicked: 2,
        bounced: 0,
        complained: 0,
        failed: 0,
        open_rate: 40,
        click_rate: 10,
      },
    ],
    by_channel: [
      {
        channel: 'daily_report',
        delivered: 30,
        opened: 13,
        clicked: 3,
        bounced: 0,
        complained: 0,
        failed: 0,
        open_rate: 43.3,
        click_rate: 10,
      },
    ],
    summary: {
      delivered: 30,
      opened: 13,
      clicked: 3,
      bounced: 0,
      complained: 0,
      failed: 0,
      open_rate: 43.3,
      click_rate: 10,
    },
  },
};

describe('ActivityComparisonPanel email date filtering', () => {
  beforeEach(() => {
    vi.stubEnv('TZ', 'America/Los_Angeles');
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('formats date-only labels without shifting to the previous local day', () => {
    render(<ActivityComparisonPanel initialData={initialData} />);

    expect(screen.getByText('6月8日-6月9日')).toBeInTheDocument();
  });

  it('sends normalized email date range params when applying the filter', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ...initialData,
        email_metrics: {
          ...initialData.email_metrics,
          start_date: '2026-06-07',
          end_date: '2026-06-09',
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(<ActivityComparisonPanel initialData={initialData} />);

    const [startInput, endInput] = Array.from(container.querySelectorAll('input[type="date"]'));
    fireEvent.change(startInput, {
      target: { value: '2026-06-09' },
    });
    fireEvent.change(endInput, {
      target: { value: '2026-06-07' },
    });
    fireEvent.click(screen.getByRole('button', { name: '应用' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/admin/activity?');
    expect(String(url)).toContain('email_start=2026-06-07');
    expect(String(url)).toContain('email_end=2026-06-09');
    expect(options.headers.Authorization).toBe('Bearer test-token');
  });
});
