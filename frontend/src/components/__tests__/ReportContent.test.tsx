import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReportContent } from '../ReportContent';

// ---------------------------------------------------------------------------
// Mock timezone functions
// ---------------------------------------------------------------------------
vi.mock('@/lib/timezone', () => ({
  isTodayPacific: vi.fn(() => false),
  formatCalendarDate: vi.fn(() => ({ month: 'Mar', day: 15, weekday: 'Sun' })),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('ReportContent', () => {
  it('renders without props and does not crash', () => {
    const { container } = render(<ReportContent />);
    expect(container).toBeTruthy();
  });

  it('renders market indices grid', () => {
    render(
      <ReportContent
        indices={[
          { name: 'S&P 500', value: 5432.1, change_percent: 1.2 },
          { name: 'Nasdaq', value: 17200, change_percent: -0.5 },
          { name: 'VIX', value: 15.3, change_percent: -2.1 },
        ]}
      />
    );

    expect(screen.getByText(/S&P 500/)).toBeTruthy();
    expect(screen.getByText(/NASDAQ/)).toBeTruthy();
    expect(screen.getByText(/VIX/)).toBeTruthy();
  });

  it('renders intro section', () => {
    render(<ReportContent intro="Markets rallied today on strong earnings data." />);
    expect(screen.getByText(/Markets rallied today/)).toBeTruthy();
  });

  it('renders news headlines', () => {
    render(
      <ReportContent
        news={{
          headlines: [
            {
              title: 'Fed Holds Rates Steady',
              fact_summary: 'The Federal Reserve kept rates unchanged.',
              deep_analysis: 'This signals continued patience.',
              url: 'https://example.com/fed',
            },
          ],
          briefs: [],
        }}
      />
    );

    expect(screen.getByText('Fed Holds Rates Steady')).toBeTruthy();
    expect(screen.getByText(/Federal Reserve kept rates/)).toBeTruthy();
  });

  it('renders calendar events', () => {
    render(
      <ReportContent
        calendar={[
          {
            date: '2026-03-15',
            event: 'CPI Release',
            analysis: 'Expected to show cooling inflation.',
          },
        ]}
      />
    );

    expect(screen.getByText('CPI Release')).toBeTruthy();
    expect(screen.getByText('Mar')).toBeTruthy();
    expect(screen.getByText('15')).toBeTruthy();
  });

  it('renders summary sections from array', () => {
    render(
      <ReportContent
        report_summary={[
          { title: 'Market Outlook', content: 'Bullish momentum continues.' },
          { title: 'Risk Factors', content: 'Geopolitical tensions remain.' },
        ]}
      />
    );

    expect(screen.getByText('Market Outlook')).toBeTruthy();
    expect(screen.getByText('Risk Factors')).toBeTruthy();
  });
});
