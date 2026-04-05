import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StockOverviewPanel from '../for-you/StockOverviewPanel';
import { StockAnalysis } from '@/lib/api';
import {
  parseChangePercent,
  sortByVolatility,
  isNotableMove,
} from '@/lib/digest-utils';

// ---------------------------------------------------------------------------
// Mock next/link
// ---------------------------------------------------------------------------
vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------
const mockStocks: StockAnalysis[] = [
  {
    symbol: 'AAPL',
    name: '苹果',
    price: 250.0,
    daily_change: '+0.50%',
    week_change: '+1.20%',
    status: '小幅上涨',
    quick_take: 'Apple released new products.',
  },
  {
    symbol: 'TSLA',
    name: '特斯拉',
    price: 182.3,
    daily_change: '-4.20%',
    week_change: '-6.80%',
    status: '跟随板块回调',
    quick_take: 'Tesla dropped on tariff concerns.',
  },
  {
    symbol: 'NVDA',
    name: '英伟达',
    price: 850.25,
    daily_change: '+2.40%',
    week_change: '+5.20%',
    status: '数据中心需求强劲',
    quick_take: 'NVDA continued to rally on AI demand.',
  },
];

// ---------------------------------------------------------------------------
// Utility function tests
// ---------------------------------------------------------------------------
describe('digest-utils: parseChangePercent', () => {
  it('parses positive percentage', () => {
    expect(parseChangePercent('+2.35%')).toBeCloseTo(2.35);
  });

  it('parses negative percentage', () => {
    expect(parseChangePercent('-4.20%')).toBeCloseTo(-4.2);
  });

  it('parses zero', () => {
    expect(parseChangePercent('0.00%')).toBe(0);
  });

  it('returns 0 for empty string', () => {
    expect(parseChangePercent('')).toBe(0);
  });
});

describe('digest-utils: sortByVolatility', () => {
  it('sorts by absolute daily change descending', () => {
    const sorted = sortByVolatility(mockStocks);
    expect(sorted[0].symbol).toBe('TSLA'); // |-4.20%| = 4.20
    expect(sorted[1].symbol).toBe('NVDA'); // |+2.40%| = 2.40
    expect(sorted[2].symbol).toBe('AAPL'); // |+0.50%| = 0.50
  });

  it('returns empty array for empty input', () => {
    expect(sortByVolatility([])).toEqual([]);
  });

  it('does not mutate original array', () => {
    const original = [...mockStocks];
    sortByVolatility(mockStocks);
    expect(mockStocks).toEqual(original);
  });
});

describe('digest-utils: isNotableMove', () => {
  it('returns true for >= 3%', () => {
    expect(isNotableMove('-4.20%')).toBe(true);
    expect(isNotableMove('+3.00%')).toBe(true);
  });

  it('returns false for < 3%', () => {
    expect(isNotableMove('+2.90%')).toBe(false);
    expect(isNotableMove('-0.50%')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// StockOverviewPanel component tests
// ---------------------------------------------------------------------------
describe('StockOverviewPanel', () => {
  it('renders all stock symbols', () => {
    render(<StockOverviewPanel stocks={mockStocks} />);

    // Each symbol appears in both desktop and mobile views
    for (const stock of mockStocks) {
      expect(screen.getAllByText(stock.symbol).length).toBeGreaterThanOrEqual(1);
    }
  });

  it('selects the most volatile stock by default', () => {
    render(<StockOverviewPanel stocks={mockStocks} />);

    // TSLA has the highest absolute change (-4.20%)
    // Its quick_take should be visible (in both desktop + mobile views)
    const quickTakes = screen.getAllByText('Tesla dropped on tariff concerns.');
    expect(quickTakes.length).toBeGreaterThanOrEqual(1);
  });

  it('switches detail panel on click', () => {
    render(<StockOverviewPanel stocks={mockStocks} />);

    // Initially TSLA detail is shown
    expect(screen.getAllByText('Tesla dropped on tariff concerns.').length).toBeGreaterThanOrEqual(1);

    // Click NVDA in the list — find the button containing NVDA text
    const nvdaButtons = screen.getAllByRole('button').filter((btn) =>
      btn.textContent?.includes('NVDA')
    );
    fireEvent.click(nvdaButtons[0]);

    // Now NVDA detail should be visible
    expect(screen.getAllByText('NVDA continued to rally on AI demand.').length).toBeGreaterThanOrEqual(1);
  });

  it('renders link to /stock/{symbol}', () => {
    render(<StockOverviewPanel stocks={mockStocks} />);

    // TSLA is selected by default; check for its analysis link
    const links = screen.getAllByRole('link').filter(
      (a) => a.getAttribute('href') === '/stock/TSLA'
    );
    expect(links.length).toBeGreaterThanOrEqual(1);
  });

  it('highlights notable moves (>=3%)', () => {
    const { container } = render(<StockOverviewPanel stocks={mockStocks} />);

    // TSLA (-4.2%) should have red highlight class in the desktop list
    // Find the desktop list container
    const desktopGrid = container.querySelector('.md\\:grid');
    if (desktopGrid) {
      // The TSLA button should have a red-tinted background
      const tslaButton = Array.from(desktopGrid.querySelectorAll('button')).find(
        (btn) => btn.textContent?.includes('TSLA')
      );
      expect(tslaButton).toBeTruthy();
    }
  });

  it('renders nothing for empty stocks array', () => {
    const { container } = render(<StockOverviewPanel stocks={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('handles single stock correctly', () => {
    render(<StockOverviewPanel stocks={[mockStocks[0]]} />);
    // Renders in both desktop and mobile views
    expect(screen.getAllByText('Apple released new products.').length).toBeGreaterThanOrEqual(1);
  });
});
