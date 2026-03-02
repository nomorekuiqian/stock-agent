'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import PaywallGuard from '@/components/PaywallGuard';
import {
  api,
  type ScreenerFilterResult,
  type ScreenerFilterRequest,
  type ScreenerAskResult,
} from '@/lib/api';
import StrategyCards from './_components/StrategyCards';
import ScreenerInput from './_components/ScreenerInput';
import AiSummary from './_components/AiSummary';
import FunnelProgress, { type FunnelStep } from './_components/FunnelProgress';
import AppliedFilters, { type AppliedFilter } from './_components/AppliedFilters';
import NarrowingSuggestions from './_components/NarrowingSuggestions';
import CandidateList from './_components/CandidateList';
import DataStatus from './_components/DataStatus';
import SectorSelector from './_components/SectorSelector';

// Sector label mapping for display
const SECTOR_ZH: Record<string, string> = {
  'Commercial Services': '商业服务',
  'Communications': '通信',
  'Consumer Durables': '耐用消费品',
  'Consumer Non-Durables': '非耐用消费品',
  'Consumer Services': '消费服务',
  'Distribution Services': '分销服务',
  'Electronic Technology': '电子技术',
  'Energy Minerals': '能源矿产',
  'Finance': '金融',
  'Health Services': '医疗服务',
  'Health Technology': '医疗技术',
  'Industrial Services': '工业服务',
  'Miscellaneous': '其他',
  'Non-Energy Minerals': '非能源矿产',
  'Process Industries': '加工工业',
  'Producer Manufacturing': '生产制造',
  'Retail Trade': '零售',
  'Technology Services': '科技服务',
  'Transportation': '运输',
  'Utilities': '公用事业',
};

// Strategy display names for filter chips
const STRATEGY_NAMES: Record<string, string> = {
  hot_sectors: '热门板块',
  volume_surge: '放量异动',
  value_discovery: '价值发现',
  high_dividend: '高股息',
  momentum: '动量选股',
  oversold_quality: '超跌优质',
  by_sector: '板块筛选',
  custom: '自定义',
};

// Conversation history entry
interface ChatTurn {
  role: 'user' | 'assistant';
  content?: string;
  summary?: string;
}

const MAX_ROUNDS = 5;

// Map narrowing chip clicks to custom filter params
function narrowingToFilter(
  dimension: string,
  value: string,
): { field: string; op: string; value: unknown } | null {
  switch (dimension) {
    case 'sector':
      return { field: 'sector', op: 'eq', value };
    case 'market_cap_tier':
      return { field: 'market_cap_tier', op: 'eq', value };
    case 'pe_ttm':
      if (value === 'low') return { field: 'pe_ttm', op: 'lt', value: 15 };
      if (value === 'mid') return { field: 'pe_ttm', op: 'gte', value: 15 };
      if (value === 'high') return { field: 'pe_ttm', op: 'gt', value: 25 };
      return null;
    case 'analyst_rating':
      if (value === 'buy') return { field: 'analyst_rating', op: 'lt', value: 2.5 };
      if (value === 'hold') return { field: 'analyst_rating', op: 'gte', value: 2.5 };
      if (value === 'sell') return { field: 'analyst_rating', op: 'gt', value: 3.5 };
      return null;
    case 'rsi':
      if (value === 'oversold') return { field: 'rsi', op: 'lt', value: 30 };
      if (value === 'neutral') return { field: 'rsi', op: 'gte', value: 30 };
      if (value === 'overbought') return { field: 'rsi', op: 'gt', value: 70 };
      return null;
    case 'dividend_yield':
      if (value === 'yes') return { field: 'dividend_yield', op: 'gt', value: 0 };
      if (value === 'no') return { field: 'dividend_yield', op: 'lte', value: 0 };
      return null;
    case 'above_sma200':
      if (value === 'above') return { field: 'above_sma200', op: 'eq', value: true };
      if (value === 'below') return { field: 'above_sma200', op: 'eq', value: false };
      return null;
    default:
      return null;
  }
}

// Map strategy to implicit custom filters (for condition accumulation)
function strategyToFilters(strategy: string, params?: Record<string, unknown>): {
  field: string; op: string; value: unknown;
}[] {
  switch (strategy) {
    case 'volume_surge':
      return [
        { field: 'relative_volume', op: 'gte', value: params?.ratio_threshold ?? 2.0 },
        { field: 'daily_change', op: 'gt', value: 0 },
        { field: 'avg_volume_30d', op: 'gte', value: 100000 },
      ];
    case 'high_dividend':
      return [
        { field: 'dividend_yield', op: 'gte', value: params?.min_yield ?? 2.0 },
        { field: 'payout_ratio', op: 'lt', value: 80 },
        { field: 'dividend_payout_years', op: 'gte', value: 3 },
      ];
    case 'momentum':
      return [
        { field: 'change_3m', op: 'gt', value: 0 },
        { field: 'rsi', op: 'gte', value: 50 },
        { field: 'rsi', op: 'lte', value: 70 },
        { field: 'above_sma50', op: 'eq', value: true },
      ];
    case 'oversold_quality':
      return [
        { field: 'rsi', op: 'lt', value: 35 },
        { field: 'roe', op: 'gt', value: 15 },
        { field: 'analyst_rating', op: 'lt', value: 2.5 },
        { field: 'market_cap', op: 'gte', value: 1e9 },
      ];
    default:
      return [];
  }
}

function ScreenerContent() {
  const router = useRouter();
  const { isLoading: authLoading, isAuthenticated } = useAuth();

  // Core state
  const [result, setResult] = useState<ScreenerFilterResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedStrategy, setSelectedStrategy] = useState<string | null>(null);
  const [showSectorSelector, setShowSectorSelector] = useState(false);

  // Funnel state
  const [appliedFilters, setAppliedFilters] = useState<AppliedFilter[]>([]);
  const [funnelSteps, setFunnelSteps] = useState<FunnelStep[]>([]);

  // Accumulated custom filters (for progressive narrowing)
  const [customFilters, setCustomFilters] = useState<{ field: string; op: string; value: unknown }[]>([]);
  const [sortBy, setSortBy] = useState<string | null>(null);

  // Agent conversation state
  const [aiSummary, setAiSummary] = useState<string>('');
  const [chatHistory, setChatHistory] = useState<ChatTurn[]>([]);
  const [askLoading, setAskLoading] = useState(false);

  const resultsRef = useRef<HTMLDivElement>(null);

  const roundCount = chatHistory.filter(t => t.role === 'user').length;

  // Auth redirect
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login?redirect=/screener');
    }
  }, [authLoading, isAuthenticated, router]);

  // Scroll to results helper
  const scrollToResults = useCallback(() => {
    setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }, []);

  // Execute filter request (strategy buttons + narrowing chips)
  const executeFilter = useCallback(async (req: ScreenerFilterRequest) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.screener.filter(req);
      setResult(res);

      // Update funnel (use functional update to avoid stale closure)
      setFunnelSteps(prev => {
        if (prev.length === 0 && res.universe_size > 0) {
          return [
            { count: res.universe_size, label: '全市场' },
            { count: res.candidate_count, label: STRATEGY_NAMES[req.strategy] || req.strategy },
          ];
        }
        return [
          ...prev,
          { count: res.candidate_count, label: '' },
        ];
      });

      scrollToResults();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to filter');
    } finally {
      setLoading(false);
    }
  }, [scrollToResults]);

  // Handle Agent ask (natural language input)
  const handleAskSubmit = useCallback(async (message: string) => {
    setAskLoading(true);
    setLoading(true);
    setError(null);
    setAiSummary('');

    try {
      const askResult: ScreenerAskResult = await api.screener.ask({
        message,
        current_filters: customFilters.length > 0 ? customFilters : undefined,
        history: chatHistory.length > 0 ? chatHistory : undefined,
      });

      // Update conversation history
      const newHistory: ChatTurn[] = [
        ...chatHistory,
        { role: 'user', content: message },
        { role: 'assistant', summary: askResult.summary },
      ];
      setChatHistory(newHistory);

      // Update AI summary
      setAiSummary(askResult.summary);

      // Update filters from agent output
      const agentFilters = (askResult.filter_used?.params as Record<string, unknown>)?.filters;
      if (Array.isArray(agentFilters)) {
        setCustomFilters(agentFilters as { field: string; op: string; value: unknown }[]);
      }

      // Build result in FilterResult shape for display
      setResult({
        success: askResult.success,
        strategy: 'custom',
        candidates: askResult.candidates,
        candidate_count: askResult.candidate_count,
        universe_size: askResult.universe_size,
        data_freshness: askResult.data_freshness,
        is_stale: askResult.is_stale,
        suggestions: askResult.suggestions,
      });

      // Update selected strategy
      setSelectedStrategy('custom');

      // Update applied filters display
      const isFirstAsk = appliedFilters.length === 0;
      if (isFirstAsk) {
        setAppliedFilters([{
          id: 'strategy-custom',
          label: `AI: ${message.length > 20 ? message.slice(0, 20) + '...' : message}`,
          type: 'strategy',
        }]);
      } else {
        // Add new ask as a narrowing chip
        setAppliedFilters(prev => [
          ...prev,
          {
            id: `ask-${Date.now()}`,
            label: `AI: ${message.length > 15 ? message.slice(0, 15) + '...' : message}`,
            type: 'narrowing',
          },
        ]);
      }

      // Update funnel
      if (funnelSteps.length === 0 && askResult.universe_size > 0) {
        setFunnelSteps([
          { count: askResult.universe_size, label: '全市场' },
          { count: askResult.candidate_count, label: 'AI 筛选' },
        ]);
      } else {
        setFunnelSteps(prev => [
          ...prev,
          { count: askResult.candidate_count, label: '' },
        ]);
      }

      scrollToResults();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'AI 查询失败';
      if (msg.includes('登录已过期') || msg.includes('重新登录')) {
        router.push('/login?redirect=/screener');
        return;
      }
      setError(msg);
    } finally {
      setAskLoading(false);
      setLoading(false);
    }
  }, [customFilters, chatHistory, appliedFilters.length, funnelSteps.length, scrollToResults, router]);

  // Handle strategy selection
  const handleStrategy = useCallback((strategyId: string) => {
    // Reset agent state on strategy switch
    setChatHistory([]);
    setAiSummary('');

    if (strategyId === 'custom') {
      // Select custom card, focus input (no API call yet)
      setSelectedStrategy('custom');
      setShowSectorSelector(false);
      return;
    }

    if (strategyId === 'by_sector') {
      setShowSectorSelector(true);
      setSelectedStrategy('by_sector');
      return;
    }

    setShowSectorSelector(false);
    setSelectedStrategy(strategyId);
    setAppliedFilters([{
      id: `strategy-${strategyId}`,
      label: STRATEGY_NAMES[strategyId] || strategyId,
      type: 'strategy',
    }]);

    // Convert strategy to custom filters for future accumulation
    const implicitFilters = strategyToFilters(strategyId);
    setCustomFilters(implicitFilters);
    setSortBy(null);
    setFunnelSteps([]);

    executeFilter({ strategy: strategyId });
  }, [executeFilter]);

  // Handle sector selection for by_sector
  const handleSectorSelect = useCallback((sector: string) => {
    setShowSectorSelector(false);
    setChatHistory([]);
    setAiSummary('');
    setAppliedFilters([{
      id: 'strategy-by_sector',
      label: `${STRATEGY_NAMES.by_sector}: ${SECTOR_ZH[sector] || sector}`,
      type: 'strategy',
    }]);
    setCustomFilters([{ field: 'sector', op: 'eq', value: sector }]);
    setSortBy(null);
    setFunnelSteps([]);

    executeFilter({
      strategy: 'by_sector',
      sector,
    });
  }, [executeFilter]);

  // Handle narrowing chip click (categorical)
  const handleNarrowApply = useCallback((dimension: string, value: string, label: string) => {
    const filter = narrowingToFilter(dimension, value);
    if (!filter) return;

    const newFilters = [...customFilters, filter];
    setCustomFilters(newFilters);

    const filterId = `narrow::${dimension}::${value}`;
    setAppliedFilters(prev => [...prev, {
      id: filterId,
      label,
      type: 'narrowing',
    }]);

    executeFilter({
      strategy: 'custom',
      params: {
        filters: newFilters,
        ...(sortBy ? { sort_by: sortBy, sort_order: 'desc' } : {}),
        limit: 30,
      },
    });
  }, [customFilters, sortBy, executeFilter]);

  // Handle sort suggestion
  const handleSort = useCallback((dimension: string, label: string) => {
    setSortBy(dimension);

    const filterId = `sort-${dimension}`;
    setAppliedFilters(prev => [
      ...prev.filter(f => !f.id.startsWith('sort-')), // Remove previous sort
      { id: filterId, label: `${label} (降序)`, type: 'narrowing' },
    ]);

    executeFilter({
      strategy: 'custom',
      params: {
        filters: customFilters,
        sort_by: dimension,
        sort_order: 'desc',
        limit: 30,
      },
    });
  }, [customFilters, executeFilter]);

  // Handle filter chip removal
  const handleRemoveFilter = useCallback((filterId: string) => {
    // If removing strategy, reset everything
    if (filterId.startsWith('strategy-')) {
      setResult(null);
      setSelectedStrategy(null);
      setAppliedFilters([]);
      setCustomFilters([]);
      setSortBy(null);
      setFunnelSteps([]);
      setShowSectorSelector(false);
      setChatHistory([]);
      setAiSummary('');
      return;
    }

    // For AI ask chips, we can't reconstruct filters — just remove from display
    if (filterId.startsWith('ask-')) {
      setAppliedFilters(prev => prev.filter(f => f.id !== filterId));
      return;
    }

    // Remove specific narrowing filter
    const newFilters = appliedFilters.filter(f => f.id !== filterId);
    setAppliedFilters(newFilters);

    // Rebuild custom filters from remaining applied filters
    // (skip strategy filter, only process narrowing filters)
    const narrowingFilters = newFilters
      .filter(f => f.type === 'narrowing' && !f.id.startsWith('sort-') && !f.id.startsWith('ask-'))
      .map(f => {
        const [, dimension, value] = f.id.split('::');
        return narrowingToFilter(dimension, value);
      })
      .filter((f): f is NonNullable<typeof f> => f !== null);

    // Include base strategy filters
    const strategyFilter = newFilters.find(f => f.type === 'strategy');
    const baseFilters = strategyFilter
      ? strategyToFilters(strategyFilter.id.replace('strategy-', ''))
      : [];

    const allFilters = [...baseFilters, ...narrowingFilters];
    setCustomFilters(allFilters);

    // Check if sort was removed
    const hasSort = newFilters.some(f => f.id.startsWith('sort-'));
    if (!hasSort) setSortBy(null);

    // Re-execute if we still have a strategy
    if (strategyFilter) {
      if (narrowingFilters.length > 0 || hasSort) {
        executeFilter({
          strategy: 'custom',
          params: {
            filters: allFilters,
            ...(hasSort && sortBy ? { sort_by: sortBy, sort_order: 'desc' } : {}),
            limit: 30,
          },
        });
      } else {
        // Back to pure strategy
        const strat = strategyFilter.id.replace('strategy-', '');
        if (strat === 'custom') {
          // Custom strategy without filters — just clear results
          setResult(null);
          setFunnelSteps([]);
        } else {
          executeFilter({ strategy: strat });
        }
      }
    }
  }, [appliedFilters, sortBy, executeFilter]);

  // Handle clear all
  const handleClearAll = useCallback(() => {
    setResult(null);
    setSelectedStrategy(null);
    setAppliedFilters([]);
    setCustomFilters([]);
    setSortBy(null);
    setFunnelSteps([]);
    setShowSectorSelector(false);
    setChatHistory([]);
    setAiSummary('');
  }, []);

  // Auth loading
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen pt-16">
      {/* Page Header - compact with inline data status */}
      <section className="border-b border-border/50">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-8">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-primary to-transparent" />
              <span className="text-primary text-xs font-medium tracking-[0.2em] uppercase">
                SCREENER
              </span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-baseline gap-2 sm:gap-4">
              <h1 className="text-2xl md:text-3xl font-editorial text-foreground tracking-tight">
                Stock Screener
              </h1>
              <DataStatus inline />
            </div>
          </div>
        </div>
      </section>

      <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-5">
        {/* Strategy Cards - primary entry point */}
        <section>
          <StrategyCards
            onSelect={handleStrategy}
            loading={loading}
            selectedStrategy={selectedStrategy}
          />
        </section>

        {/* Sector selector (for by_sector strategy) */}
        {showSectorSelector && (
          <section className="p-4 rounded-xl border border-border/50 bg-card">
            <SectorSelector onSelect={handleSectorSelect} loading={loading} />
          </section>
        )}

        {/* AI Natural Language Input - secondary entry */}
        <section>
          <ScreenerInput
            onSubmit={handleAskSubmit}
            loading={askLoading}
            roundCount={roundCount}
            maxRounds={MAX_ROUNDS}
          />
        </section>

        {/* Error */}
        {error && (
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
            {error}
          </div>
        )}

        {/* Loading skeleton (appears before first result) */}
        {loading && !result && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 animate-spin" />
              <p className="text-sm text-muted-foreground">
                {askLoading ? 'AI 正在分析...' : '筛选中...'}
              </p>
            </div>
            {/* Skeleton rows */}
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-12 rounded-lg bg-muted/30 animate-pulse" style={{ animationDelay: `${i * 80}ms` }} />
              ))}
            </div>
          </div>
        )}

        {/* Results Section */}
        {result && result.success && (
          <section ref={resultsRef} className="space-y-5">
            <div className="h-px bg-border/50" />

            {/* AI Summary */}
            <AiSummary summary={aiSummary} loading={askLoading && !result} />

            {/* Funnel Progress */}
            <FunnelProgress steps={funnelSteps} />

            {/* Applied Filters */}
            <AppliedFilters
              filters={appliedFilters}
              onRemove={handleRemoveFilter}
              onClearAll={handleClearAll}
            />

            {/* Narrowing Suggestions */}
            {result.suggestions.length > 0 && result.candidate_count >= 5 && (
              <NarrowingSuggestions
                suggestions={result.suggestions}
                onApply={handleNarrowApply}
                onSort={handleSort}
                loading={loading}
              />
            )}

            {/* Inline ask input for follow-up queries after results */}
            {selectedStrategy === 'custom' && roundCount > 0 && roundCount < MAX_ROUNDS && (
              <div className="py-2">
                <ScreenerInput
                  onSubmit={handleAskSubmit}
                  loading={askLoading}
                  placeholder="继续用自然语言收窄..."
                  roundCount={roundCount}
                  maxRounds={MAX_ROUNDS}
                />
              </div>
            )}

            {/* Candidate list with loading overlay */}
            <div className="relative">
              {loading && (
                <div className="absolute inset-0 bg-background/60 backdrop-blur-sm z-10 flex items-center justify-center rounded-xl">
                  <div className="w-6 h-6 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 animate-spin" />
                </div>
              )}
              <CandidateList
                candidates={result.candidates}
                strategy={selectedStrategy || 'custom'}
                expanded={result.candidate_count <= 5}
              />
            </div>

            {/* Prompt for deep research when few candidates */}
            {result.candidate_count > 0 && result.candidate_count <= 5 && (
              <div className="text-center py-4">
                <p className="text-sm text-emerald-500 font-medium">
                  想深入了解哪只？点击股票代码查看详细分析
                </p>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

export default function ScreenerPage() {
  return (
    <PaywallGuard>
      <ScreenerContent />
    </PaywallGuard>
  );
}
