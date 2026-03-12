import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Command } from 'cmdk';
import StockSearchDropdown from '../StockSearchDropdown';
import type { StockSearchResult } from '@/lib/api';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------
const RESULTS: StockSearchResult[] = [
  { symbol: 'AAPL', name: 'Apple Inc.', type: 'stock', exchange: 'NASDAQ' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', type: 'stock', exchange: 'NASDAQ' },
];

function renderWithCommand(ui: React.ReactElement) {
  return render(
    <Command shouldFilter={false}>{ui}</Command>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('StockSearchDropdown', () => {
  it('shows loading text when isSearching with no results', () => {
    renderWithCommand(
      <StockSearchDropdown
        results={[]}
        isSearching={true}
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByText('搜索中...')).toBeTruthy();
  });

  it('shows empty text when results empty and showEmpty is true', () => {
    renderWithCommand(
      <StockSearchDropdown
        results={[]}
        isSearching={false}
        showEmpty={true}
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByText('无结果')).toBeTruthy();
  });

  it('renders results in navigate mode', () => {
    renderWithCommand(
      <StockSearchDropdown
        results={RESULTS}
        isSearching={false}
        mode="navigate"
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByText('AAPL')).toBeTruthy();
    expect(screen.getByText('Apple Inc.')).toBeTruthy();
    expect(screen.getByText('AMZN')).toBeTruthy();
  });

  it('shows add/already-added in watchlist mode', () => {
    renderWithCommand(
      <StockSearchDropdown
        results={RESULTS}
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
    const { container } = renderWithCommand(
      <StockSearchDropdown
        results={[]}
        isSearching={false}
        showEmpty={false}
        onSelect={vi.fn()}
      />
    );

    // Only the Command wrapper should be rendered, no dropdown content
    expect(container.querySelector('[cmdk-list]')).toBeNull();
  });
});
