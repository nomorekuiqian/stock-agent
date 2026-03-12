import { useState, useCallback, useEffect, useRef } from 'react';
import { api, StockSearchResult } from '@/lib/api';

export interface UseStockSearchOptions {
  limit?: number;
  debounceMs?: number;
}

export interface UseStockSearchReturn {
  query: string;
  results: StockSearchResult[];
  isSearching: boolean;
  open: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onQueryChange: (value: string) => void;
  inputHandlers: {
    onCompositionStart: () => void;
    onCompositionEnd: (e: React.CompositionEvent<HTMLInputElement>) => void;
    onFocus: () => void;
  };
  resetAfterSelect: () => void;
  closeDropdown: () => void;
  clearSearch: () => void;
}

export function useStockSearch(options: UseStockSearchOptions = {}): UseStockSearchReturn {
  const { limit = 8, debounceMs = 300 } = options;

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StockSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [open, setOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isComposingRef = useRef(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const doSearch = useCallback(async (value: string) => {
    if (value.length < 1) {
      setResults([]);
      setOpen(false);
      return;
    }
    const currentId = ++requestIdRef.current;
    setIsSearching(true);
    try {
      const result = await api.searchStocks(value, limit);
      if (requestIdRef.current !== currentId) return;
      setResults(result.stocks);
      setOpen(true);
    } catch {
      if (requestIdRef.current !== currentId) return;
      setResults([]);
    } finally {
      if (requestIdRef.current === currentId) {
        setIsSearching(false);
      }
    }
  }, [limit]);

  const scheduleSearch = useCallback((value: string) => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (value.length < 1) {
      setResults([]);
      setOpen(false);
      return;
    }
    searchTimeoutRef.current = setTimeout(() => doSearch(value), debounceMs);
  }, [doSearch, debounceMs]);

  const onQueryChange = useCallback((value: string) => {
    setQuery(value);
    if (isComposingRef.current) return;
    scheduleSearch(value.toUpperCase());
  }, [scheduleSearch]);

  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true;
  }, []);

  const handleCompositionEnd = useCallback((e: React.CompositionEvent<HTMLInputElement>) => {
    isComposingRef.current = false;
    scheduleSearch(e.currentTarget.value.toUpperCase());
  }, [scheduleSearch]);

  const handleFocus = useCallback(() => {
    isComposingRef.current = false;
    if (results.length > 0 && query.length > 0) {
      setOpen(true);
    }
  }, [results.length, query.length]);

  const resetAfterSelect = useCallback(() => {
    setOpen(false);
    setQuery('');
    setResults([]);
  }, []);

  const closeDropdown = useCallback(() => {
    setOpen(false);
  }, []);

  const clearSearch = useCallback(() => {
    setQuery('');
    setResults([]);
    setOpen(false);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
  }, []);

  return {
    query,
    results,
    isSearching,
    open,
    containerRef,
    onQueryChange,
    inputHandlers: {
      onCompositionStart: handleCompositionStart,
      onCompositionEnd: handleCompositionEnd,
      onFocus: handleFocus,
    },
    resetAfterSelect,
    closeDropdown,
    clearSearch,
  };
}
