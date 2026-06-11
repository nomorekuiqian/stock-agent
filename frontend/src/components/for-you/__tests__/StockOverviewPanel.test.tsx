import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import StockOverviewPanel from '../StockOverviewPanel';
import type { HoldingView, StockAnalysis } from '@/lib/api';

afterEach(() => {
  cleanup();
});

function makeHolding(overrides: Partial<HoldingView> & { symbol: string }): HoldingView {
  return {
    symbol: overrides.symbol,
    weight_pct: overrides.weight_pct ?? null,
    shares: overrides.shares ?? null,
    cost_basis: overrides.cost_basis ?? null,
    entry_price: overrides.entry_price ?? null,
    market_value: overrides.market_value ?? null,
    unrealized_pnl: overrides.unrealized_pnl ?? null,
    price: overrides.price ?? null,
    thesis: overrides.thesis ?? null,
    target: overrides.target ?? null,
    stop_loss: overrides.stop_loss ?? null,
    conviction: overrides.conviction ?? null,
    effective_weight_pct: overrides.effective_weight_pct ?? 0,
    weight_source: overrides.weight_source ?? 'shares_x_price',
  };
}

function makeStock(overrides: Partial<StockAnalysis> & { symbol: string }): StockAnalysis {
  return {
    symbol: overrides.symbol,
    name: overrides.name ?? overrides.symbol,
    price: overrides.price ?? 100,
    daily_change: overrides.daily_change ?? '+1.00%',
    week_change: overrides.week_change ?? '+2.00%',
    status: overrides.status ?? 'status',
    quick_take: overrides.quick_take ?? 'quick take',
  };
}

describe('StockOverviewPanel — holdings-sourced 我的持仓', () => {
  // Regression: xuxy1994@gmail.com saw only AAPL in 我的持仓 even though
  // their portfolio had multiple stocks, because we filtered digest.stocks
  // ∩ portfolioSymbols. With holdings as truth-source, every visible
  // holding must render regardless of digest.stocks contents.
  it('renders every portfolio holding even when digest.stocks is missing them', () => {
    const holdings = [
      makeHolding({ symbol: 'AAPL', shares: 10, price: 180, market_value: 1800, effective_weight_pct: 60 }),
      makeHolding({ symbol: 'NVDA', shares: 5, price: 800, market_value: 4000, effective_weight_pct: 40 }),
    ];
    const stocks = [
      // Stale cache: digest only knows about AAPL
      makeStock({ symbol: 'AAPL', daily_change: '+1.50%' }),
    ];

    render(
      <StockOverviewPanel
        stocks={stocks}
        holdings={holdings}
        totalMarketValue={5800}
        totalDailyChange={50}
        totalDailyChangePct={1.0}
      />,
    );

    // Both rows render even though NVDA is absent from digest.stocks.
    expect(screen.getAllByText('AAPL').length).toBeGreaterThan(0);
    expect(screen.getAllByText('NVDA').length).toBeGreaterThan(0);
  });

  it('displays shares × price = market_value on each holding row', () => {
    const holdings = [
      makeHolding({ symbol: 'AAPL', shares: 10, price: 180, market_value: 1800, effective_weight_pct: 100 }),
    ];

    render(<StockOverviewPanel stocks={[]} holdings={holdings} />);

    // Row contains shares + price + market_value (allow either desktop or mobile rendering).
    const rows = screen.getAllByText((_, el) =>
      !!el && /10.*股.*180.*1,800/.test(el.textContent ?? ''),
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  it('displays local currency for non-US holdings', () => {
    const holdings = [
      makeHolding({ symbol: '7203.T', shares: 10, price: 2000, market_value: 20000, effective_weight_pct: 100 }),
    ];

    render(<StockOverviewPanel stocks={[]} holdings={holdings} />);

    const rows = screen.getAllByText((_, el) =>
      !!el && /10.*股.*JPY 2,000.*¥20,000/.test(el.textContent ?? ''),
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  it('does not label mixed-currency portfolio totals as USD', () => {
    const holdings = [
      makeHolding({ symbol: 'AAPL', shares: 10, price: 180, market_value: 1800, effective_weight_pct: 50 }),
      makeHolding({ symbol: '7203.T', shares: 10, price: 2000, market_value: 20000, effective_weight_pct: 50 }),
    ];

    render(
      <StockOverviewPanel
        stocks={[]}
        holdings={holdings}
        totalMarketValue={21800}
        totalDailyChange={100}
        totalDailyChangePct={0.5}
      />,
    );

    expect(screen.getByText('多币种组合')).toBeInTheDocument();
    expect(screen.queryByText('$21,800')).not.toBeInTheDocument();
  });

  it('handles $CASH row: shows market_value, hides shares × price', () => {
    const holdings = [
      makeHolding({
        symbol: '$CASH',
        shares: 5000,
        market_value: 5000,
        effective_weight_pct: 100,
        weight_source: 'shares_x_price',
      }),
    ];

    render(<StockOverviewPanel stocks={[]} holdings={holdings} />);

    expect(screen.getAllByText('$CASH').length).toBeGreaterThan(0);
    // No "股 × $" pattern for cash.
    const cashRows = screen.getAllByText('$CASH');
    for (const node of cashRows) {
      const rowText = node.closest('button')?.textContent ?? '';
      expect(rowText).not.toMatch(/股 × \$/);
    }
  });

  it('falls back gracefully when shares present but price missing (quote API failure)', () => {
    const holdings = [
      makeHolding({
        symbol: 'AAPL',
        shares: 10,
        cost_basis: 1500,
        market_value: null,
        price: null,
        effective_weight_pct: 50,
      }),
    ];

    render(<StockOverviewPanel stocks={[]} holdings={holdings} />);

    // Should at minimum render the cost basis fallback.
    expect(screen.getAllByText(/成本 \$1,500/).length).toBeGreaterThan(0);
  });

  it('overlays daily_change from digest.stocks when symbol matches', () => {
    const holdings = [
      makeHolding({ symbol: 'NVDA', shares: 5, price: 800, market_value: 4000, effective_weight_pct: 100 }),
    ];
    const stocks = [makeStock({ symbol: 'NVDA', daily_change: '+3.21%' })];

    render(<StockOverviewPanel stocks={stocks} holdings={holdings} />);

    expect(screen.getAllByText('+3.21%').length).toBeGreaterThan(0);
  });

  it('fallback panel surfaces thesis, P&L, related news + events for symbols missing from digest.stocks', () => {
    // Regression for the original bug: when 我的持仓 has a symbol the digest
    // didn't analyze, the right pane was a dead end. Now it should compose
    // a meaningful summary from data we already have.
    const holdings = [
      makeHolding({
        symbol: 'NVDA',
        shares: 10,
        price: 800,
        cost_basis: 6000,
        entry_price: 600,
        market_value: 8000,
        unrealized_pnl: 2000,
        effective_weight_pct: 100,
        thesis: 'AI 长期主题，数据中心是核心',
      }),
    ];
    // digest.stocks intentionally empty — simulates LLM drop / cache stale
    const stocks: StockAnalysis[] = [];
    const headlines = [
      {
        title: '英伟达发布 Blackwell GPU',
        related_symbols: ['NVDA'],
        fact_summary: '正式发布下一代 AI 芯片',
        deep_analysis: '',
        url: 'https://example.com/blackwell',
        published_at: '',
      },
    ];
    const briefs = [
      {
        title: 'TSMC 产能利好 NVDA',
        related_symbols: ['NVDA', 'TSM'],
        summary: '',
        analysis: '',
        url: 'https://example.com/tsmc',
        published_at: '',
      },
    ];
    const events = [
      {
        date: '2026-05-28',
        event: 'NVDA Q1 财报',
        related_symbols: ['NVDA'],
        why_important: '决定数据中心增速预期',
      },
    ];

    render(
      <StockOverviewPanel
        stocks={stocks}
        holdings={holdings}
        headlines={headlines}
        briefs={briefs}
        events={events}
      />,
    );

    // P&L surfaces
    expect(screen.getAllByText(/\+\$2,000/).length).toBeGreaterThan(0);
    // Thesis surfaces
    expect(screen.getAllByText(/AI 长期主题/).length).toBeGreaterThan(0);
    // Related headlines surface
    expect(screen.getAllByText('英伟达发布 Blackwell GPU').length).toBeGreaterThan(0);
    // Related briefs surface
    expect(screen.getAllByText(/TSMC 产能利好 NVDA/).length).toBeGreaterThan(0);
    // Related events surface
    expect(screen.getAllByText('NVDA Q1 财报').length).toBeGreaterThan(0);
  });

  it('fallback panel filters news/events to selected symbol only', () => {
    const holdings = [
      makeHolding({ symbol: 'NVDA', shares: 10, price: 800, market_value: 8000, effective_weight_pct: 100 }),
    ];
    const headlines = [
      {
        title: '苹果发新机',
        related_symbols: ['AAPL'],  // unrelated to NVDA
        fact_summary: '',
        deep_analysis: '',
        url: '',
        published_at: '',
      },
      {
        title: '英伟达财报超预期',
        related_symbols: ['NVDA'],
        fact_summary: '',
        deep_analysis: '',
        url: '',
        published_at: '',
      },
    ];

    render(
      <StockOverviewPanel
        stocks={[]}
        holdings={holdings}
        headlines={headlines}
      />,
    );

    expect(screen.getAllByText('英伟达财报超预期').length).toBeGreaterThan(0);
    // AAPL-only headline must NOT bleed into the NVDA fallback
    expect(screen.queryByText('苹果发新机')).not.toBeInTheDocument();
  });

  it('fallback panel for $CASH shows cash balance, no stock fields', () => {
    const holdings = [
      makeHolding({
        symbol: '$CASH',
        shares: 5000,
        market_value: 5000,
        effective_weight_pct: 100,
      }),
    ];

    render(<StockOverviewPanel stocks={[]} holdings={holdings} events={[]} />);

    // Cash balance shown
    expect(screen.getAllByText(/现金头寸/).length).toBeGreaterThan(0);
    // No "shares × price" pattern for cash
    expect(screen.queryByText(/股 ×/)).not.toBeInTheDocument();
  });

  it('renders watchlist section separately from holdings when both present', () => {
    const holdings = [
      makeHolding({ symbol: 'AAPL', shares: 10, price: 180, market_value: 1800, effective_weight_pct: 100 }),
    ];
    const stocks = [
      makeStock({ symbol: 'AAPL' }),
      makeStock({ symbol: 'TSLA', name: 'Tesla' }),
    ];

    render(<StockOverviewPanel stocks={stocks} holdings={holdings} />);

    // 观察列表 heading appears when there's both a portfolio and watchlist-only stocks.
    expect(screen.getByText('观察列表')).toBeInTheDocument();
  });
});
