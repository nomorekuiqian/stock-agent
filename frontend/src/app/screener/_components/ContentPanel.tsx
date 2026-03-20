'use client';

import type { ContentContext } from '../_lib/contentTypes';
import type { FilterStep } from './FilterProgress';
import type { StockContextPayload } from './StockResearchView';
import type { DailyReportContextPayload } from './DailyReportView';
import type { MacroContextPayload } from './MacroOverview';
import type { BrewContextPayload } from './BrewDigestView';
import ResultsPanel from './ResultsPanel';
import StockResearchView from './StockResearchView';
import DailyReportView from './DailyReportView';
import MacroOverview from './MacroOverview';
import BrewDigestView from './BrewDigestView';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

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
    recommendations: { symbol: string; reason: string }[];
    loading: boolean;
    onStockClick?: (symbol: string) => void;
  };
  /** Called when stock data is loaded in StockResearchView, for Agent context. */
  onStockContextReady?: (payload: StockContextPayload) => void;
  /** Called when daily report data is loaded in DailyReportView, for Agent context. */
  onReportContextReady?: (payload: DailyReportContextPayload) => void;
  /** Called when macro data is loaded in MacroOverview, for Agent context. */
  onMacroContextReady?: (payload: MacroContextPayload) => void;
  /** Called when brew digest data is loaded in BrewDigestView, for Agent context. */
  onBrewContextReady?: (payload: BrewContextPayload) => void;
}

export default function ContentPanel({
  activeContent,
  canGoBack,
  onGoBack,
  screenerProps,
  onStockContextReady,
  onReportContextReady,
  onMacroContextReady,
  onBrewContextReady,
}: ContentPanelProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Back navigation header (desktop) — shown during drill-down */}
      {canGoBack && (
        <div className="shrink-0 hidden lg:flex items-center gap-2 px-4 py-2 border-b border-border/30">
          <button
            onClick={onGoBack}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            返回
          </button>
          <span className="text-[11px] text-muted-foreground/60">
            {activeContent.label}
          </span>
        </div>
      )}

      {/* Back navigation header (mobile) */}
      {canGoBack && (
        <div className="shrink-0 lg:hidden flex items-center gap-2 px-4 py-2 border-b border-border/30">
          <button
            onClick={onGoBack}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            返回
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
            key={activeContent.params.symbol}
            symbol={activeContent.params.symbol}
            onContextReady={onStockContextReady}
          />
        )}

        {activeContent.type === 'daily_report' && (
          <DailyReportView
            key={activeContent.params.date || 'latest'}
            date={activeContent.params.date || undefined}
            onContextReady={onReportContextReady}
          />
        )}

        {activeContent.type === 'macro' && (
          <MacroOverview onContextReady={onMacroContextReady} />
        )}

        {activeContent.type === 'brew' && (
          <BrewDigestView
            digestId={activeContent.params.digestId || undefined}
            onContextReady={onBrewContextReady}
          />
        )}
      </div>
    </div>
  );
}
