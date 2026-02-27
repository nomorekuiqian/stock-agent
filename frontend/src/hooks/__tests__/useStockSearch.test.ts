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

function fireInputChange(
  hook: ReturnType<typeof useStockSearch>,
  value: string,
) {
  act(() => {
    hook.inputProps.onChange({
      target: { value },
      nativeEvent: { isComposing: false },
    } as unknown as React.ChangeEvent<HTMLInputElement>);
  });
}

function fireKeyDown(
  hook: ReturnType<typeof useStockSearch>,
  key: string,
) {
  act(() => {
    hook.inputProps.onKeyDown({
      key,
      preventDefault: vi.fn(),
    } as unknown as React.KeyboardEvent<HTMLInputElement>);
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
    expect(result.current.showDropdown).toBe(false);
  });

  it('provides static inputProps values', () => {
    const { result } = renderHook(() => useStockSearch());
    expect(result.current.inputProps.autoComplete).toBe('off');
    expect(result.current.inputProps.autoCapitalize).toBe('characters');
    expect(result.current.inputProps.spellCheck).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Search + debounce
// ---------------------------------------------------------------------------
describe('useStockSearch - search and debounce', () => {
  it('debounces search by 300ms', async () => {
    const { result } = renderHook(() => useStockSearch());

    fireInputChange(result.current, 'AAPL');
    expect(mockSearchStocks).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(mockSearchStocks).toHaveBeenCalledWith('AAPL', 8);
  });

  it('clears results when query is empty', async () => {
    const { result } = renderHook(() => useStockSearch());

    // First do a search
    fireInputChange(result.current, 'AAPL');
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(result.current.results).toHaveLength(3);

    // Clear search
    fireInputChange(result.current, '');
    expect(result.current.results).toEqual([]);
    expect(result.current.showDropdown).toBe(false);
  });

  it('sets isSearching during search and clears after', async () => {
    let resolveSearch: (v: unknown) => void;
    mockSearchStocks.mockReturnValue(new Promise(r => { resolveSearch = r; }));

    const { result } = renderHook(() => useStockSearch());

    fireInputChange(result.current, 'AAPL');
    await act(async () => { vi.advanceTimersByTime(300); });

    expect(result.current.isSearching).toBe(true);

    await act(async () => {
      resolveSearch!({ stocks: SAMPLE_RESULTS });
    });

    expect(result.current.isSearching).toBe(false);
    expect(result.current.showDropdown).toBe(true);
  });

  it('only uses latest search result (race condition protection)', async () => {
    let resolveFirst: (v: unknown) => void;
    let resolveSecond: (v: unknown) => void;

    mockSearchStocks
      .mockReturnValueOnce(new Promise(r => { resolveFirst = r; }))
      .mockReturnValueOnce(new Promise(r => { resolveSecond = r; }));

    const { result } = renderHook(() => useStockSearch());

    // First search
    fireInputChange(result.current, 'A');
    await act(async () => { vi.advanceTimersByTime(300); });

    // Second search (overwrites first)
    fireInputChange(result.current, 'AA');
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
// Keyboard navigation
// ---------------------------------------------------------------------------
describe('useStockSearch - keyboard navigation', () => {
  async function setupWithResults() {
    const { result } = renderHook(() => useStockSearch());
    fireInputChange(result.current, 'A');
    await act(async () => { vi.advanceTimersByTime(300); });
    return result;
  }

  it('ArrowDown cycles through results', async () => {
    const result = await setupWithResults();

    fireKeyDown(result.current, 'ArrowDown');
    expect(result.current.highlightedIndex).toBe(0);

    fireKeyDown(result.current, 'ArrowDown');
    expect(result.current.highlightedIndex).toBe(1);

    fireKeyDown(result.current, 'ArrowDown');
    expect(result.current.highlightedIndex).toBe(2);

    // Wraps around
    fireKeyDown(result.current, 'ArrowDown');
    expect(result.current.highlightedIndex).toBe(0);
  });

  it('ArrowUp cycles backwards', async () => {
    const result = await setupWithResults();

    // Start from first
    fireKeyDown(result.current, 'ArrowDown');
    expect(result.current.highlightedIndex).toBe(0);

    // Go up wraps to last
    fireKeyDown(result.current, 'ArrowUp');
    expect(result.current.highlightedIndex).toBe(2);
  });

  it('Enter selects highlighted result', async () => {
    const onSelect = vi.fn();
    const { result } = renderHook(() => useStockSearch({ onSelect }));

    fireInputChange(result.current, 'A');
    await act(async () => { vi.advanceTimersByTime(300); });

    fireKeyDown(result.current, 'ArrowDown');
    fireKeyDown(result.current, 'Enter');

    expect(onSelect).toHaveBeenCalledWith(SAMPLE_RESULTS[0]);
    expect(result.current.query).toBe('');
  });

  it('Enter calls onEnterRaw when no results', async () => {
    mockSearchStocks.mockResolvedValue({ stocks: [] });
    const onEnterRaw = vi.fn();
    const { result } = renderHook(() => useStockSearch({ onEnterRaw }));

    fireInputChange(result.current, 'XYZ');
    await act(async () => { vi.advanceTimersByTime(300); });

    fireKeyDown(result.current, 'Enter');
    expect(onEnterRaw).toHaveBeenCalledWith('XYZ');
  });

  it('Escape closes dropdown', async () => {
    const result = await setupWithResults();
    expect(result.current.showDropdown).toBe(true);

    fireKeyDown(result.current, 'Escape');
    expect(result.current.showDropdown).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Utility methods
// ---------------------------------------------------------------------------
describe('useStockSearch - utility methods', () => {
  it('clearSearch resets all state', async () => {
    const { result } = renderHook(() => useStockSearch());

    fireInputChange(result.current, 'AAPL');
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(result.current.results.length).toBeGreaterThan(0);

    act(() => { result.current.clearSearch(); });

    expect(result.current.query).toBe('');
    expect(result.current.results).toEqual([]);
    expect(result.current.showDropdown).toBe(false);
  });

  it('closeDropdown hides dropdown and resets highlight', async () => {
    const { result } = renderHook(() => useStockSearch());

    fireInputChange(result.current, 'A');
    await act(async () => { vi.advanceTimersByTime(300); });

    act(() => { result.current.closeDropdown(); });
    expect(result.current.showDropdown).toBe(false);
    expect(result.current.highlightedIndex).toBe(-1);
  });
});
