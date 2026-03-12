import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStockSearch } from '../useStockSearch';
import type { StockSearchResult } from '@/lib/api';

// ---------------------------------------------------------------------------
// Mock api
// ---------------------------------------------------------------------------
const mockSearchStocks = vi.fn();

vi.mock('@/lib/api', () => ({
  api: {
    searchStocks: (...args: unknown[]) => mockSearchStocks(...args),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const SAMPLE_RESULTS: StockSearchResult[] = [
  { symbol: 'AAPL', name: 'Apple Inc.', type: 'stock', exchange: 'NASDAQ' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', type: 'stock', exchange: 'NASDAQ' },
  { symbol: 'ASML', name: 'ASML Holding', type: 'stock', exchange: 'NASDAQ' },
];

function fireQueryChange(
  hook: ReturnType<typeof useStockSearch>,
  value: string,
) {
  act(() => {
    hook.onQueryChange(value);
  });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.useFakeTimers();
  mockSearchStocks.mockReset();
  mockSearchStocks.mockResolvedValue({ stocks: SAMPLE_RESULTS });
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------
describe('useStockSearch - initial state', () => {
  it('starts with empty query and results', () => {
    const { result } = renderHook(() => useStockSearch());
    expect(result.current.query).toBe('');
    expect(result.current.results).toEqual([]);
    expect(result.current.isSearching).toBe(false);
    expect(result.current.open).toBe(false);
  });

  it('provides inputHandlers', () => {
    const { result } = renderHook(() => useStockSearch());
    expect(typeof result.current.inputHandlers.onCompositionStart).toBe('function');
    expect(typeof result.current.inputHandlers.onCompositionEnd).toBe('function');
    expect(typeof result.current.inputHandlers.onFocus).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// Search + debounce
// ---------------------------------------------------------------------------
describe('useStockSearch - search and debounce', () => {
  it('debounces search by 300ms', async () => {
    const { result } = renderHook(() => useStockSearch());

    fireQueryChange(result.current, 'AAPL');
    expect(mockSearchStocks).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(mockSearchStocks).toHaveBeenCalledWith('AAPL', 8);
  });

  it('clears results when query is empty', async () => {
    const { result } = renderHook(() => useStockSearch());

    // First do a search
    fireQueryChange(result.current, 'AAPL');
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(result.current.results).toHaveLength(3);

    // Clear search
    fireQueryChange(result.current, '');
    expect(result.current.results).toEqual([]);
    expect(result.current.open).toBe(false);
  });

  it('sets isSearching during search and clears after', async () => {
    let resolveSearch: (v: unknown) => void;
    mockSearchStocks.mockReturnValue(new Promise(r => { resolveSearch = r; }));

    const { result } = renderHook(() => useStockSearch());

    fireQueryChange(result.current, 'AAPL');
    await act(async () => { vi.advanceTimersByTime(300); });

    expect(result.current.isSearching).toBe(true);

    await act(async () => {
      resolveSearch!({ stocks: SAMPLE_RESULTS });
    });

    expect(result.current.isSearching).toBe(false);
    expect(result.current.open).toBe(true);
  });

  it('only uses latest search result (race condition protection)', async () => {
    let resolveFirst: (v: unknown) => void;
    let resolveSecond: (v: unknown) => void;

    mockSearchStocks
      .mockReturnValueOnce(new Promise(r => { resolveFirst = r; }))
      .mockReturnValueOnce(new Promise(r => { resolveSecond = r; }));

    const { result } = renderHook(() => useStockSearch());

    // First search
    fireQueryChange(result.current, 'A');
    await act(async () => { vi.advanceTimersByTime(300); });

    // Second search (overwrites first)
    fireQueryChange(result.current, 'AA');
    await act(async () => { vi.advanceTimersByTime(300); });

    // Resolve second first, then first
    const secondResults = [{ symbol: 'AA', name: 'Alcoa', type: 'stock', exchange: 'NYSE' }];
    await act(async () => { resolveSecond!({ stocks: secondResults }); });
    await act(async () => { resolveFirst!({ stocks: SAMPLE_RESULTS }); });

    // Should only have second results (first is stale)
    expect(result.current.results).toEqual(secondResults);
  });
});

// ---------------------------------------------------------------------------
// Utility methods
// ---------------------------------------------------------------------------
describe('useStockSearch - utility methods', () => {
  it('clearSearch resets all state', async () => {
    const { result } = renderHook(() => useStockSearch());

    fireQueryChange(result.current, 'AAPL');
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(result.current.results.length).toBeGreaterThan(0);

    act(() => { result.current.clearSearch(); });

    expect(result.current.query).toBe('');
    expect(result.current.results).toEqual([]);
    expect(result.current.open).toBe(false);
  });

  it('closeDropdown hides dropdown', async () => {
    const { result } = renderHook(() => useStockSearch());

    fireQueryChange(result.current, 'A');
    await act(async () => { vi.advanceTimersByTime(300); });

    act(() => { result.current.closeDropdown(); });
    expect(result.current.open).toBe(false);
  });

  it('resetAfterSelect clears query, results, and closes', async () => {
    const { result } = renderHook(() => useStockSearch());

    fireQueryChange(result.current, 'A');
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(result.current.open).toBe(true);

    act(() => { result.current.resetAfterSelect(); });

    expect(result.current.query).toBe('');
    expect(result.current.results).toEqual([]);
    expect(result.current.open).toBe(false);
  });
});
