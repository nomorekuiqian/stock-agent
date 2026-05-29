import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MorningReportContent } from '../MorningReportContent';
import type {
  MorningFuturesQuote,
  MorningGlobalSnapshot,
  MorningOvernightItem,
} from '@/lib/api';

// ---------------------------------------------------------------------------
// Cleanup between tests (vitest globals not enabled)
// ---------------------------------------------------------------------------

afterEach(cleanup);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const futures: MorningFuturesQuote[] = [
  { name: 'S&P 500 Futures', value: 5432.1, daily_change: 0.85 },
  { name: 'Nasdaq Futures', value: 19200, daily_change: -0.42 },
  { name: 'Dow Futures', value: 42100, daily_change: 0.15 },
];

const globalMarkets: MorningGlobalSnapshot = {
  asia: [
    { name: 'Nikkei 225', value: 38500, daily_change: 1.2 },
    { name: 'Hang Seng', value: 17800, daily_change: -0.65 },
    { name: 'Shanghai Composite', value: 3150, daily_change: 0.3 },
  ],
  europe: [
    { name: 'DAX', value: 18200, daily_change: 0.45 },
    { name: 'FTSE 100', value: 8100, daily_change: -0.18 },
  ],
  other: [
    { name: 'Gold', value: 2340, daily_change: 0.55 },
    { name: 'Crude Oil', value: 78.5, daily_change: -1.2 },
    { name: 'VIX', value: 14.3, daily_change: -3.8 },
  ],
};

const overnightNews: MorningOvernightItem[] = [
  { title: 'Fed Minutes Signal Patience', analysis: 'The FOMC minutes revealed a willingness to wait.', url: 'https://example.com/fed' },
  { title: 'China PMI Beats Expectations', analysis: 'Manufacturing PMI came in at 51.2 vs 50.5 expected.' },
];

const todayFocus = [
  { title: 'CPI Data Release', analysis: 'Core CPI expected at 0.3% MoM.', time: '8:30 AM ET' },
  { title: 'AAPL Earnings After Close', analysis: 'Apple reports Q1 earnings after market close.' },
];

const summary = [
  { title: 'overnight_review', content: 'Asian markets rallied overnight.\n\nEuropean futures followed suit.' },
  { title: 'today_outlook', content: 'Focus on CPI data and tech earnings.' },
];

function defaultProps() {
  return {
    futures,
    global_markets: globalMarkets,
    overnight_news: overnightNews,
    today_focus: todayFocus,
    summary,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MorningReportContent', () => {
  it('renders futures section with S&P, NQ, DOW data', () => {
    render(<MorningReportContent {...defaultProps()} />);

    // S&P 500 Futures -> displayed as "S&P"
    expect(screen.getByText('S&P')).toBeTruthy();
    // Nasdaq Futures -> displayed as "NQ"
    expect(screen.getByText('NQ')).toBeTruthy();
    // Dow Futures -> displayed as "DOW"
    expect(screen.getByText('DOW')).toBeTruthy();

    // Values
    expect(screen.getByText('5,432')).toBeTruthy();
    expect(screen.getByText('19,200')).toBeTruthy();
    expect(screen.getByText('42,100')).toBeTruthy();

    // Change percentages
    expect(screen.getByText('+0.85%')).toBeTruthy();
    expect(screen.getByText('-0.42%')).toBeTruthy();
    expect(screen.getByText('+0.15%')).toBeTruthy();
  });

  it('hides futures section when futures array is empty', () => {
    render(
      <MorningReportContent
        {...defaultProps()}
        futures={[]}
      />
    );

    // Section header should not be present
    expect(screen.queryByText('美股期货')).toBeNull();
    expect(screen.queryByText('S&P')).toBeNull();
    expect(screen.queryByText('NQ')).toBeNull();
  });

  it('renders global markets grouped by region', () => {
    render(<MorningReportContent {...defaultProps()} />);

    // Region labels (Chinese)
    expect(screen.getByText('亚太')).toBeTruthy();
    expect(screen.getByText('欧洲')).toBeTruthy();
    expect(screen.getByText('其他')).toBeTruthy();

    // Market names are mapped to Chinese
    expect(screen.getByText('日经225')).toBeTruthy();
    expect(screen.getByText('恒生指数')).toBeTruthy();
    expect(screen.getByText('上证综指')).toBeTruthy();
    expect(screen.getByText('DAX (德国)')).toBeTruthy();
    expect(screen.getByText('富时100 (英国)')).toBeTruthy();
    expect(screen.getByText('黄金')).toBeTruthy();
    expect(screen.getByText('原油')).toBeTruthy();
    expect(screen.getByText('VIX 恐慌指数')).toBeTruthy();
  });

  it('renders overnight news with clickable links when url present', () => {
    render(<MorningReportContent {...defaultProps()} />);

    const link = screen.getByRole('link', { name: 'Fed Minutes Signal Patience' });
    expect(link).toBeTruthy();
    expect(link.getAttribute('href')).toBe('https://example.com/fed');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('renders overnight news without links when url absent', () => {
    render(<MorningReportContent {...defaultProps()} />);

    // The item without URL is rendered as a heading, not a link
    const heading = screen.getByText('China PMI Beats Expectations');
    expect(heading.tagName).toBe('H4');
    expect(heading.closest('a')).toBeNull();

    // Analysis text still appears
    expect(screen.getByText(/Manufacturing PMI came in at 51.2/)).toBeTruthy();
  });

  it('renders today focus items with time badge when time field present', () => {
    render(<MorningReportContent {...defaultProps()} />);

    // Item with time has the time badge
    expect(screen.getByText('8:30 AM ET')).toBeTruthy();
    expect(screen.getByText('CPI Data Release')).toBeTruthy();
    expect(screen.getByText(/Core CPI expected/)).toBeTruthy();
  });

  it('renders today focus items without time badge when time absent', () => {
    render(<MorningReportContent {...defaultProps()} />);

    // AAPL item has no time field
    expect(screen.getByText('AAPL Earnings After Close')).toBeTruthy();
    expect(screen.getByText(/Apple reports Q1 earnings/)).toBeTruthy();
  });

  it('renders summary sections using SUMMARY_TITLES mapping', () => {
    render(<MorningReportContent {...defaultProps()} />);

    // overnight_review -> mapped to Chinese title
    expect(screen.getByText('隔夜回顾')).toBeTruthy();
    // today_outlook -> mapped to Chinese title
    expect(screen.getByText('今日展望')).toBeTruthy();

    // Content is split by double newlines and rendered as paragraphs
    expect(screen.getByText('Asian markets rallied overnight.')).toBeTruthy();
    expect(screen.getByText('European futures followed suit.')).toBeTruthy();
    expect(screen.getByText('Focus on CPI data and tech earnings.')).toBeTruthy();
  });

  it('renders disclaimer at bottom', () => {
    render(<MorningReportContent {...defaultProps()} />);

    expect(screen.getByText(/AI 生成的报告，仅供参考，不构成投资建议/)).toBeTruthy();
  });

  it('renders futures_analysis text when provided', () => {
    render(
      <MorningReportContent
        {...defaultProps()}
        futures_analysis="Futures point to a cautious open as traders await CPI data."
      />
    );

    expect(screen.getByText('Futures point to a cautious open as traders await CPI data.')).toBeTruthy();
  });

  it('renders global_markets_analysis text when provided', () => {
    render(
      <MorningReportContent
        {...defaultProps()}
        global_markets_analysis="Global risk appetite improved after strong Asian session."
      />
    );

    expect(screen.getByText('Global risk appetite improved after strong Asian session.')).toBeTruthy();
  });

  describe('locked mode', () => {
    it('keeps futures cards visible but hides futures_analysis behind LockedBlur', () => {
      render(
        <MorningReportContent
          {...defaultProps()}
          futures_analysis="Real futures analysis text that should be hidden."
          locked
        />
      );

      // Futures cards still show real values
      expect(screen.getByText('S&P')).toBeTruthy();
      expect(screen.getByText('5,432')).toBeTruthy();
      expect(screen.getByText('+0.85%')).toBeTruthy();

      // The real analysis text must not be visible
      expect(screen.queryByText(/Real futures analysis text/)).toBeNull();
      // The LockedBlur label appears in its place
      expect(screen.getByText('期货走势解读')).toBeTruthy();
    });

    it('keeps global markets table visible but hides global_markets_analysis', () => {
      render(
        <MorningReportContent
          {...defaultProps()}
          global_markets_analysis="Real global markets analysis."
          locked
        />
      );

      // Region labels and quotes remain
      expect(screen.getByText('亚太')).toBeTruthy();
      expect(screen.getByText('日经225')).toBeTruthy();

      // Analysis is gated
      expect(screen.queryByText(/Real global markets analysis/)).toBeNull();
      expect(screen.getByText('全球市场解读')).toBeTruthy();
    });

    it('replaces overnight news bodies with LockedBlur placeholders and shows count', () => {
      render(<MorningReportContent {...defaultProps()} locked />);

      // Section header still present, with count of fixtures (2 items)
      expect(screen.getByText('隔夜要闻')).toBeTruthy();
      // Both 隔夜要闻 and 今日焦点 have 2 items in fixtures
      expect(screen.getAllByText('2 条').length).toBeGreaterThanOrEqual(1);

      // Real news titles and analyses must not be visible
      expect(screen.queryByText('Fed Minutes Signal Patience')).toBeNull();
      expect(screen.queryByText(/Manufacturing PMI came in at 51.2/)).toBeNull();

      // Locked rows render labelled placeholders
      expect(screen.getByText('要闻 01')).toBeTruthy();
      expect(screen.getByText('要闻 02')).toBeTruthy();
    });

    it('replaces today focus bodies with LockedBlur but keeps time badges', () => {
      render(<MorningReportContent {...defaultProps()} locked />);

      // Section header still present
      expect(screen.getByText('今日焦点')).toBeTruthy();
      // Time badge for the first focus item still renders
      expect(screen.getByText('8:30 AM ET')).toBeTruthy();
      // Real titles and analyses must be hidden
      expect(screen.queryByText('CPI Data Release')).toBeNull();
      expect(screen.queryByText(/Core CPI expected/)).toBeNull();
      expect(screen.queryByText('AAPL Earnings After Close')).toBeNull();
      // Locked rows render placeholders
      expect(screen.getByText('焦点 01')).toBeTruthy();
      expect(screen.getByText('焦点 02')).toBeTruthy();
    });

    it('keeps summary subsection titles visible but blurs the prose', () => {
      render(<MorningReportContent {...defaultProps()} locked />);

      // SUMMARY_TITLES mapping still applies
      expect(screen.getByText('隔夜回顾')).toBeTruthy();
      expect(screen.getByText('今日展望')).toBeTruthy();

      // Real paragraphs are hidden
      expect(screen.queryByText('Asian markets rallied overnight.')).toBeNull();
      expect(screen.queryByText('Focus on CPI data and tech earnings.')).toBeNull();
    });
  });

  it('handles empty/minimal data gracefully', () => {
    const emptyGlobalMarkets: MorningGlobalSnapshot = { asia: [], europe: [], other: [] };

    const { container } = render(
      <MorningReportContent
        futures={[]}
        global_markets={emptyGlobalMarkets}
        overnight_news={[]}
        today_focus={[]}
        summary={[]}
      />
    );

    // Should still render the disclaimer
    expect(screen.getByText(/AI 生成的报告/)).toBeTruthy();
    // Sections should be absent
    expect(screen.queryByText('美股期货')).toBeNull();
    expect(screen.queryByText('全球市场')).toBeNull();
    expect(screen.queryByText('隔夜要闻')).toBeNull();
    expect(screen.queryByText('今日焦点')).toBeNull();
    expect(screen.queryByText('总结与展望')).toBeNull();
    // Container should still exist
    expect(container).toBeTruthy();
  });
});
