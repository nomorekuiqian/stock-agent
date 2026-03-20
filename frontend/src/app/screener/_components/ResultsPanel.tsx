'use client';

import FilterProgress, { type FilterStep } from './FilterProgress';
import RecommendationCard from './RecommendationCard';
import CandidateList from './CandidateList';

interface ResultsPanelProps {
  steps: FilterStep[];
  appliedFilters: { field: string; op: string; value: unknown }[];
  candidates: Record<string, unknown>[];
  candidateCount: number;
  universeSize: number;
  recommendations: { symbol: string; reason: string }[];
  loading: boolean;
  /** When provided, clicking a stock opens it in the right panel. */
  onStockClick?: (symbol: string) => void;
}

/**
 * ResultsPanel - Right side results display.
 *
 * Shows:
 * 1. Filter progress funnel (3,680 -> 45 -> 5)
 * 2. Applied filter condition chips
 * 3. Recommendation cards (when AI makes final recommendations)
 * 4. Candidate stock list (table on desktop, cards on mobile)
 *
 * Empty state shown when no results yet.
 */
export default function ResultsPanel({
  steps,
  appliedFilters,
  candidates,
  candidateCount,
  universeSize,
  recommendations,
  loading,
  onStockClick,
}: ResultsPanelProps) {
  const hasResults = candidates.length > 0;
  const hasReasons = recommendations.length > 0;

  // Empty state
  if (!hasResults && !loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 text-center">
        <div className="w-12 h-12 rounded-2xl bg-card border border-border/50 flex items-center justify-center mb-4">
          <svg className="w-6 h-6 text-muted-foreground/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
            <path d="M13 13l6 6" />
          </svg>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          在左侧对话中描述你的偏好<br />
          AI 会帮你筛选出合适的股票
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-4 space-y-4 animate-panel-enter">
      {/* Filter progress */}
      <FilterProgress steps={steps} appliedFilters={appliedFilters} />

      {/* Result count */}
      {hasResults && (
        <div className="flex items-baseline gap-2">
          <span className="font-data text-lg text-emerald-600 dark:text-emerald-400 tabular-nums">
            {candidateCount}
          </span>
          <span className="text-xs text-muted-foreground">
            / {universeSize.toLocaleString()} 只匹配
          </span>
        </div>
      )}

      {/* Loading overlay */}
      {loading && hasResults && (
        <div className="flex items-center gap-2 py-2">
          <div className="w-4 h-4 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 animate-spin" />
          <span className="text-xs text-muted-foreground">更新中...</span>
        </div>
      )}

      {/* AI recommendation cards (always shown when available) */}
      {hasReasons && (
        <div className="space-y-3">
          <h3 className="text-xs font-medium text-muted-foreground">
            AI 推荐
          </h3>
          {recommendations.map((pr, i) => {
            const stock = candidates.find(
              (c) => {
                const s = String(c.symbol || '');
                const clean = s.includes(':') ? s.split(':')[1] : s;
                return clean === pr.symbol || s === pr.symbol;
              }
            );
            return (
              <RecommendationCard
                key={pr.symbol}
                symbol={pr.symbol}
                name={stock?.name as string}
                price={stock?.price as number}
                dailyChange={stock?.daily_change as number}
                reason={pr.reason}
                index={i}
                onStockClick={onStockClick}
              />
            );
          })}
        </div>
      )}

      {/* Full candidate list (always shown when there are results) */}
      {hasResults && (
        <>
          {hasReasons && (
            <div className="border-t border-border/30 pt-3">
              <h3 className="text-xs font-medium text-muted-foreground mb-3">
                全部候选 ({candidateCount})
              </h3>
            </div>
          )}
          <CandidateList
            candidates={candidates}
            strategy="custom"
            expanded={candidateCount <= 5}
            onStockClick={onStockClick}
          />
        </>
      )}

      {/* Prompt for deep research */}
      {candidateCount > 0 && candidateCount <= 5 && (
        <div className="text-center py-3">
          <p className="text-xs text-emerald-600/70 dark:text-emerald-500/70">
            点击股票代码查看详细分析
          </p>
        </div>
      )}
    </div>
  );
}
