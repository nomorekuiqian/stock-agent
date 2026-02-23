'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { api, StockSearchResult } from '@/lib/api';
import { saveUserWatchlist } from '@/lib/insforge';
import { getStockDisplayName } from '@/lib/stock-names';
import { PORTFOLIO_TEMPLATES, PortfolioTemplate } from '@/lib/portfolio-templates';

type Step = 'choose' | 'customize';

export default function SetupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();

  const [step, setStep] = useState<Step>('choose');
  const [selectedTemplate, setSelectedTemplate] = useState<PortfolioTemplate | null>(null);
  const [symbols, setSymbols] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<StockSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Restore state from URL params (after login redirect)
  useEffect(() => {
    const templateId = searchParams.get('template');
    const symbolsParam = searchParams.get('symbols');

    if (templateId) {
      const template = PORTFOLIO_TEMPLATES.find(t => t.id === templateId);
      if (template) {
        setSelectedTemplate(template);
        if (symbolsParam) {
          setSymbols(symbolsParam.split(',').filter(Boolean));
        } else {
          setSymbols([...template.symbols]);
        }
        setStep('customize');
      }
    }
  }, [searchParams]);

  // Auto-save when user is authenticated and state is restored from URL
  useEffect(() => {
    const templateId = searchParams.get('template');
    if (templateId && isAuthenticated && user?.id && !authLoading) {
      handleSave();
    }
    // Only run once on auth resolve with URL params
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, authLoading, user?.id]);

  // Debounced search
  const handleSearch = useCallback(async (query: string) => {
    if (query.length < 1) {
      setSearchResults([]);
      setShowSearchDropdown(false);
      return;
    }

    setIsSearching(true);
    try {
      const result = await api.searchStocks(query, 8);
      const filtered = result.stocks.filter(s => !symbols.includes(s.symbol));
      setSearchResults(filtered);
      setShowSearchDropdown(true);
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [symbols]);

  const handleSearchInputChange = (value: string) => {
    setSearchQuery(value.toUpperCase());
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => handleSearch(value), 300);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, []);

  const handleSelectTemplate = (template: PortfolioTemplate) => {
    setSelectedTemplate(template);
    setSymbols([...template.symbols]);
    setStep('customize');
  };

  const handleAddSymbol = (symbol: string) => {
    const sym = symbol.trim().toUpperCase();
    if (sym && !symbols.includes(sym) && symbols.length < 25) {
      setSymbols(prev => [...prev, sym]);
    }
    setSearchQuery('');
    setSearchResults([]);
    setShowSearchDropdown(false);
  };

  const handleRemoveSymbol = (symbol: string) => {
    setSymbols(prev => prev.filter(s => s !== symbol));
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      e.preventDefault();
      if (searchResults.length > 0) {
        handleAddSymbol(searchResults[0].symbol);
      } else {
        handleAddSymbol(searchQuery);
      }
    } else if (e.key === 'Escape') {
      setShowSearchDropdown(false);
    }
  };

  const handleSave = async () => {
    if (symbols.length === 0) return;

    if (!isAuthenticated || !user) {
      // Redirect to login, preserving state in the redirect URL itself
      const setupParams = new URLSearchParams({
        template: selectedTemplate?.id || '',
        symbols: symbols.join(','),
      });
      const redirectPath = `/for-you/setup?${setupParams.toString()}`;
      router.push(`/login?redirect=${encodeURIComponent(redirectPath)}`);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      // Save watchlist
      await saveUserWatchlist(user.id, symbols);

      // Subscribe to personal digest
      if (user.email) {
        await api.subscriptions.subscribe('personal_digest', {
          email: user.email,
          user_id: user.id,
          symbols: symbols,
        });
      }

      router.push('/for-you');
    } catch (err) {
      console.error('Save failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to save. Please try again.');
      setSaving(false);
    }
  };

  const handleBack = () => {
    setStep('choose');
    setSelectedTemplate(null);
    setSymbols([]);
  };

  return (
    <main className="min-h-screen bg-background">
      {/* Page Header */}
      <section className="border-b border-border/50">
        <div className="max-w-4xl mx-auto px-4 md:px-6 py-8 md:py-12">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-primary to-transparent" />
              <span className="text-primary text-xs font-medium tracking-[0.2em] uppercase">FOR YOU</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-editorial text-foreground tracking-tight">
              选择投资模板
            </h1>
            <p className="text-muted-foreground text-sm md:text-base max-w-lg">
              选一个模板快速开始，或者自定义你的关注列表
            </p>
          </div>
        </div>
      </section>

      <div className="max-w-4xl mx-auto px-4 md:px-6 py-8">
        {/* Step 1: Choose Template */}
        {step === 'choose' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {PORTFOLIO_TEMPLATES.map((template) => (
              <button
                key={template.id}
                onClick={() => handleSelectTemplate(template)}
                className="terminal-card p-5 text-left transition-all hover:border-emerald-500/40 hover:bg-card/80 group"
              >
                <h3 className="text-base font-medium text-foreground group-hover:text-emerald-400 transition-colors mb-2">
                  {template.name}
                </h3>
                <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
                  {template.description}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {template.symbols.slice(0, 5).map((sym) => (
                    <span
                      key={sym}
                      className="px-2 py-0.5 bg-card border border-border/50 rounded text-xs font-data text-muted-foreground"
                    >
                      {sym}
                    </span>
                  ))}
                  {template.symbols.length > 5 && (
                    <span className="px-2 py-0.5 text-xs text-muted-foreground">
                      +{template.symbols.length - 5}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Step 2: Customize */}
        {step === 'customize' && selectedTemplate && (
          <div className="space-y-6">
            {/* Back button */}
            <button
              onClick={handleBack}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              返回选择模板
            </button>

            {/* Template info */}
            <div className="terminal-card p-5">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-lg font-medium text-foreground">{selectedTemplate.name}</h3>
                <span className="text-xs text-muted-foreground font-data">{symbols.length} / 25</span>
              </div>
              <p className="text-sm text-muted-foreground">{selectedTemplate.description}</p>
            </div>

            {/* Symbol chips */}
            <div className="terminal-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-1 h-5 bg-emerald-500 rounded-full" />
                <h4 className="text-sm font-medium text-foreground uppercase tracking-wider">关注列表</h4>
              </div>

              <div className="flex flex-wrap gap-2 mb-4">
                {symbols.map((sym) => (
                  <span
                    key={sym}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-card border border-border/50 rounded-lg text-sm group"
                  >
                    <span className="font-data text-foreground">{sym}</span>
                    <span className="text-xs text-muted-foreground hidden sm:inline">
                      {getStockDisplayName(sym)}
                    </span>
                    <button
                      onClick={() => handleRemoveSymbol(sym)}
                      className="ml-1 text-muted-foreground hover:text-red-400 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </span>
                ))}
              </div>

              {/* Search to add */}
              {symbols.length < 25 && (
                <div ref={searchContainerRef} className="relative">
                  <div className="relative">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={searchQuery}
                      onChange={(e) => handleSearchInputChange(e.target.value)}
                      onKeyDown={handleSearchKeyDown}
                      onFocus={() => searchQuery && setShowSearchDropdown(true)}
                      placeholder="搜索添加股票..."
                      className="w-full pl-10 pr-4 py-2.5 bg-background border border-border/50 rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-emerald-500/50 transition-colors"
                    />
                    {isSearching && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <div className="w-4 h-4 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 animate-spin" />
                      </div>
                    )}
                  </div>

                  {/* Search dropdown */}
                  {showSearchDropdown && searchResults.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-card border border-border/50 rounded-lg shadow-lg overflow-hidden">
                      {searchResults.map((result) => (
                        <button
                          key={result.symbol}
                          onClick={() => handleAddSymbol(result.symbol)}
                          className="w-full px-4 py-2.5 text-left hover:bg-emerald-500/5 transition-colors flex items-center justify-between"
                        >
                          <div>
                            <span className="font-data text-sm font-medium text-foreground">{result.symbol}</span>
                            <span className="text-xs text-muted-foreground ml-2">{result.name}</span>
                          </div>
                          <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
                {error}
              </div>
            )}

            {/* CTA */}
            <button
              onClick={handleSave}
              disabled={symbols.length === 0 || saving}
              className="w-full py-3 bg-emerald-600 text-white rounded-lg font-medium text-sm transition-all hover:bg-emerald-500 hover:shadow-lg hover:shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                  <span>保存中...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span>{isAuthenticated ? '开始使用' : '登录并开始使用'}</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
