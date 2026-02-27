import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import StockSearchDropdown from '../StockSearchDropdown';
import type { StockSearchResult } from '@/lib/api';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------
const RESULTS: StockSearchResult[] = [
  { symbol: 'AAPL', name: 'Apple Inc.', type: 'stock', exchange: 'NASDAQ' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', type: 'stock', exchange: 'NASDAQ' },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('StockSearchDropdown', () => {
  it('shows "搜索中..." when isSearching with no results', () => {
    render(
      <StockSearchDropdown
        results={[]}
        highlightedIndex={-1}
        isSearching={true}
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByText('搜索中...')).toBeTruthy();
  });

  it('shows "无结果" when results empty and showEmpty is true', () => {
    render(
      <StockSearchDropdown
        results={[]}
        highlightedIndex={-1}
        isSearching={false}
        showEmpty={true}
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByText('无结果')).toBeTruthy();
  });

  it('renders results in navigate mode', () => {
    render(
      <StockSearchDropdown
        results={RESULTS}
        highlightedIndex={-1}
        isSearching={false}
        mode="navigate"
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByText('AAPL')).toBeTruthy();
    expect(screen.getByText('Apple Inc.')).toBeTruthy();
    expect(screen.getByText('AMZN')).toBeTruthy();
  });

  it('shows "已添加" for in-list symbols in watchlist mode', () => {
    render(
      <StockSearchDropdown
        results={RESULTS}
        highlightedIndex={-1}
        isSearching={false}
        mode="watchlist"
        inListSymbols={['AAPL']}
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByText('已添加')).toBeTruthy();
    expect(screen.getByText('添加')).toBeTruthy();
  });

  it('returns null for empty results when showEmpty is false', () => {
    const { container } = render(
      <StockSearchDropdown
        results={[]}
        highlightedIndex={-1}
        isSearching={false}
        showEmpty={false}
        onSelect={vi.fn()}
      />
    );

    expect(container.innerHTML).toBe('');
  });
});
