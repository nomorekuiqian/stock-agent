'use client';

import type { ContentContext } from '../_lib/contentTypes';
import type { FilterStep } from './FilterProgress';
import type { StockContextPayload } from './StockResearchView';
import ResultsPanel from './ResultsPanel';
import StockResearchView from './StockResearchView';

interface ContentPanelProps {
  activeContent: ContentContext;
  canGoBack: boolean;
  onGoBack: () => void;
  // Screener results props (passed through when type === 'screener')
  screenerProps: {
    steps: FilterStep[];
    appliedFilters: { field: string; op: string; value: unknown }[];
    candidates: Record<string, unknown>[];
    candidateCount: number;
    universeSize: number;
    pickReasons: { symbol: string; reason: string }[];
    loading: boolean;
    onStockClick?: (symbol: string) => void;
  };
  /** Called when stock data is loaded in StockResearchView, for Agent context. */
  onStockContextReady?: (payload: StockContextPayload) => void;
}

/**
 * ContentPanel - Dynamic right-side panel for the Research Desk.
 *
 * Renders different content views based on activeContent.type:
 * - screener: ResultsPanel (stock screening results)
 * - stock: StockResearchView (embedded individual stock research)
 */
export default function ContentPanel({
  activeContent,
  canGoBack,
  onGoBack,
  screenerProps,
  onStockContextReady,
}: ContentPanelProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Content Header - shown when navigated away from default */}
      {canGoBack && (
        <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-border/30">
          <button
            onClick={onGoBack}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            返回选股
          </button>
          <div className="h-3 w-px bg-border/50" />
          <span className="text-xs text-muted-foreground">
            {activeContent.label}
          </span>
        </div>
      )}

      {/* Content body */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {activeContent.type === 'screener' && (
          <ResultsPanel {...screenerProps} />
        )}

        {activeContent.type === 'stock' && activeContent.params.symbol && (
          <StockResearchView
            symbol={activeContent.params.symbol}
            onContextReady={onStockContextReady}
          />
        )}
      </div>
    </div>
  );
}
