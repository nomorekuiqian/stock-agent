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
  days: 30,
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
  growth_metrics: {
    days: 30,
    current: {
      start_date: '2026-06-08',
      end_date: '2026-06-09',
    },
    previous: {
      start_date: '2026-06-06',
      end_date: '2026-06-07',
    },
    metrics: [
      {
        key: 'first_insight_generation_rate',
        category: 'Activation',
        priority: 'P0',
        label: 'First AI output rate',
        format: 'percent',
        description: 'Users with a first assistant answer or legacy first_insight_generated event divided by registered users through period end.',
        current: { numerator: 7, denominator: 10, value: 70 },
        previous: { numerator: 5, denominator: 10, value: 50 },
      },
      {
        key: 'useful_answer_rate',
        category: 'Quality / Trust',
        priority: 'P0',
        label: 'Useful answer rate',
        format: 'percent',
        description: 'Positive assistant-answer feedback divided by rated assistant answers.',
        current: { numerator: 8, denominator: 10, value: 80 },
        previous: { numerator: 6, denominator: 10, value: 60 },
      },
      {
        key: 'thumbs_down_rate',
        category: 'Quality / Trust',
        priority: 'P0',
        label: 'Thumbs-down rate',
        format: 'percent',
        description: 'Negative assistant-answer feedback divided by rated assistant answers.',
        current: { numerator: 2, denominator: 10, value: 20 },
        previous: { numerator: 4, denominator: 10, value: 40 },
      },
      {
        key: 'error_rate',
        category: 'Quality / Trust',
        priority: 'P0',
        label: 'Error rate',
        format: 'percent',
        description: 'Chat turns with an agent runtime error divided by recorded chat turns.',
        current: { numerator: 1, denominator: 20, value: 5 },
        previous: { numerator: 2, denominator: 20, value: 10 },
      },
      {
        key: 'timeout_rate',
        category: 'Quality / Trust',
        priority: 'P0',
        label: 'Timeout rate',
        format: 'percent',
        description: 'Chat turns with a timeout error divided by recorded chat turns.',
        current: { numerator: 1, denominator: 20, value: 5 },
        previous: { numerator: 1, denominator: 20, value: 5 },
      },
      {
        key: 'p50_latency_ms',
        category: 'Quality / Trust',
        priority: 'P1',
        label: 'P50 latency',
        format: 'duration_ms',
        description: '50th percentile response latency for assistant answers that record latency_ms.',
        current: { numerator: 900, denominator: 12, value: 900 },
        previous: { numerator: 700, denominator: 10, value: 700 },
      },
      {
        key: 'p75_latency_ms',
        category: 'Quality / Trust',
        priority: 'P1',
        label: 'P75 latency',
        format: 'duration_ms',
        description: '75th percentile response latency for assistant answers that record latency_ms.',
        current: { numerator: 1500, denominator: 12, value: 1500 },
        previous: { numerator: 1200, denominator: 10, value: 1200 },
      },
      {
        key: 'p95_latency_ms',
        category: 'Quality / Trust',
        priority: 'P1',
        label: 'P95 latency',
        format: 'duration_ms',
        description: '95th percentile response latency for assistant answers that record latency_ms.',
        current: { numerator: 2400, denominator: 12, value: 2400 },
        previous: { numerator: 1800, denominator: 10, value: 1800 },
      },
      {
        key: 'p99_latency_ms',
        category: 'Quality / Trust',
        priority: 'P1',
        label: 'P99 latency',
        format: 'duration_ms',
        description: '99th percentile response latency for assistant answers that record latency_ms.',
        current: { numerator: 3200, denominator: 12, value: 3200 },
        previous: { numerator: 2600, denominator: 10, value: 2600 },
      },
    ],
  },
  email_metrics: {
    days: 30,
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

    expect(screen.getAllByText('6月8日-6月9日').length).toBeGreaterThan(0);
  });

  it('shows chat quality and latency metrics', () => {
    render(<ActivityComparisonPanel initialData={initialData} />);

    expect(screen.getByText('MVP 增长指标')).toBeInTheDocument();
    expect(screen.getByText('Chat 质量 / 可靠性')).toBeInTheDocument();
    expect(screen.getByText('首次 AI 输出率')).toBeInTheDocument();
    expect(screen.getByText(/第一条助手回答/)).toBeInTheDocument();
    expect(screen.getByText('有用回答率')).toBeInTheDocument();
    expect(screen.getByText('负向反馈率')).toBeInTheDocument();
    expect(screen.getByText('错误率')).toBeInTheDocument();
    expect(screen.getByText('超时率')).toBeInTheDocument();
    expect(screen.getByText('P50 延迟')).toBeInTheDocument();
    expect(screen.getByText('P75 延迟')).toBeInTheDocument();
    expect(screen.getByText('P95 延迟')).toBeInTheDocument();
    expect(screen.getByText('P99 延迟')).toBeInTheDocument();
    expect(screen.getByText('900ms')).toBeInTheDocument();
    expect(screen.getByText('1.5s')).toBeInTheDocument();
    expect(screen.getByText('2.4s')).toBeInTheDocument();
    expect(screen.getByText('3.2s')).toBeInTheDocument();
    expect(screen.getAllByText(/样本 12 条/)).toHaveLength(4);
    expect(screen.getByLabelText('Chat 指标开始日期')).toBeInTheDocument();
    expect(screen.getByLabelText('Chat 指标结束日期')).toBeInTheDocument();
  });

  it('sends normalized growth date range params when applying the filter', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ...initialData,
        growth_metrics: {
          ...initialData.growth_metrics,
          current: {
            start_date: '2026-06-07',
            end_date: '2026-06-09',
          },
          previous: {
            start_date: '2026-06-04',
            end_date: '2026-06-06',
          },
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<ActivityComparisonPanel initialData={initialData} />);

    fireEvent.change(screen.getByLabelText('增长指标开始日期'), {
      target: { value: '2026-06-09' },
    });
    fireEvent.change(screen.getByLabelText('增长指标结束日期'), {
      target: { value: '2026-06-07' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: '应用' })[0]);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/admin/activity?');
    expect(String(url)).toContain('days=30');
    expect(String(url)).toContain('growth_start=2026-06-07');
    expect(String(url)).toContain('growth_end=2026-06-09');
    expect(options.headers.Authorization).toBe('Bearer test-token');
  });

  it('sends normalized chat quality date range params when applying the filter', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ...initialData,
        growth_metrics: {
          ...initialData.growth_metrics,
          current: {
            start_date: '2026-06-07',
            end_date: '2026-06-09',
          },
          previous: {
            start_date: '2026-06-04',
            end_date: '2026-06-06',
          },
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<ActivityComparisonPanel initialData={initialData} />);

    fireEvent.change(screen.getByLabelText('Chat 指标开始日期'), {
      target: { value: '2026-06-09' },
    });
    fireEvent.change(screen.getByLabelText('Chat 指标结束日期'), {
      target: { value: '2026-06-07' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: '应用' })[1]);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/admin/activity?');
    expect(String(url)).toContain('days=30');
    expect(String(url)).toContain('growth_start=2026-06-07');
    expect(String(url)).toContain('growth_end=2026-06-09');
    expect(options.headers.Authorization).toBe('Bearer test-token');
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

    const [, , , , startInput, endInput] = Array.from(container.querySelectorAll('input[type="date"]'));
    fireEvent.change(startInput, {
      target: { value: '2026-06-09' },
    });
    fireEvent.change(endInput, {
      target: { value: '2026-06-07' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: '应用' })[2]);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/admin/activity?');
    expect(String(url)).toContain('days=30');
    expect(String(url)).toContain('email_start=2026-06-07');
    expect(String(url)).toContain('email_end=2026-06-09');
    expect(options.headers.Authorization).toBe('Bearer test-token');
  });
});
