import { useState, useCallback, useEffect, useRef } from 'react';
import { api, StockSearchResult } from '@/lib/api';

export interface UseStockSearchOptions {
  limit?: number;
  debounceMs?: number;
  onSelect?: (result: StockSearchResult) => void;
  onEnterRaw?: (query: string) => void;
}

export interface UseStockSearchReturn {
  query: string;
  results: StockSearchResult[];
  isSearching: boolean;
  showDropdown: boolean;
  highlightedIndex: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
  inputProps: {
    value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onCompositionStart: () => void;
    onCompositionEnd: (e: React.CompositionEvent<HTMLInputElement>) => void;
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
    onFocus: () => void;
    autoComplete: string;
    autoCapitalize: string;
    spellCheck: boolean;
  };
  closeDropdown: () => void;
  clearSearch: () => void;
}

export function useStockSearch(options: UseStockSearchOptions = {}): UseStockSearchReturn {
  const {
    limit = 8,
    debounceMs = 300,
    onSelect,
    onEnterRaw,
  } = options;

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StockSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

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
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const doSearch = useCallback(async (value: string) => {
    if (value.length < 1) {
      setResults([]);
      setShowDropdown(false);
      return;
    }
    const currentId = ++requestIdRef.current;
    setIsSearching(true);
    try {
      const result = await api.searchStocks(value, limit);
      if (requestIdRef.current !== currentId) return;
      setResults(result.stocks);
      setShowDropdown(true);
      setHighlightedIndex(-1);
    } catch (err) {
      if (requestIdRef.current !== currentId) return;
      console.error('Search failed:', err);
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
      setShowDropdown(false);
      return;
    }
    searchTimeoutRef.current = setTimeout(() => doSearch(value), debounceMs);
  }, [doSearch, debounceMs]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toUpperCase();
    setQuery(value);

    // Reset IME composing state if compositionEnd never fired (e.g. Esc or IME switch)
    const nativeEvent = e.nativeEvent as InputEvent;
    if (nativeEvent.isComposing === false && isComposingRef.current) {
      isComposingRef.current = false;
    }

    if (isComposingRef.current) return;
    scheduleSearch(value);
  }, [scheduleSearch]);

  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true;
  }, []);

  const handleCompositionEnd = useCallback((e: React.CompositionEvent<HTMLInputElement>) => {
    isComposingRef.current = false;
    const value = e.currentTarget.value.toUpperCase();
    setQuery(value);
    scheduleSearch(value);
  }, [scheduleSearch]);

  const selectResult = useCallback((result: StockSearchResult) => {
    setShowDropdown(false);
    setQuery('');
    setResults([]);
    setHighlightedIndex(-1);
    onSelect?.(result);
  }, [onSelect]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown || results.length === 0) {
      if (e.key === 'Enter' && query.trim()) {
        e.preventDefault();
        onEnterRaw?.(query.trim());
        setQuery('');
        setResults([]);
        setShowDropdown(false);
        setHighlightedIndex(-1);
      }
      if (e.key === 'Escape') {
        setShowDropdown(false);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => (prev + 1) % results.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => (prev - 1 + results.length) % results.length);
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < results.length) {
          selectResult(results[highlightedIndex]);
        } else if (results.length > 0) {
          selectResult(results[0]);
        }
        break;
      case 'Escape':
        setShowDropdown(false);
        setHighlightedIndex(-1);
        break;
    }
  }, [showDropdown, results, highlightedIndex, query, selectResult, onEnterRaw]);

  const handleFocus = useCallback(() => {
    isComposingRef.current = false;
    if (results.length > 0 && query.length > 0) {
      setShowDropdown(true);
    }
  }, [results.length, query.length]);

  const closeDropdown = useCallback(() => {
    setShowDropdown(false);
    setHighlightedIndex(-1);
  }, []);

  const clearSearch = useCallback(() => {
    setQuery('');
    setResults([]);
    setShowDropdown(false);
    setHighlightedIndex(-1);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
  }, []);

  return {
    query,
    results,
    isSearching,
    showDropdown,
    highlightedIndex,
    containerRef,
    inputProps: {
      value: query,
      onChange: handleChange,
      onCompositionStart: handleCompositionStart,
      onCompositionEnd: handleCompositionEnd,
      onKeyDown: handleKeyDown,
      onFocus: handleFocus,
      autoComplete: 'off',
      autoCapitalize: 'characters',
      spellCheck: false,
    },
    closeDropdown,
    clearSearch,
  };
}
