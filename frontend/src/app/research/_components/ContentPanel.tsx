'use client';

import type { ContentContext } from '../_lib/contentTypes';
import type { FilterStep } from './FilterProgress';
import type { StockPanelContextPayload } from './panel/StockPanelView';
import type { DailyReportContextPayload } from './DailyReportView';
import type { MorningReportContextPayload } from './MorningReportView';
import type { BrewContextPayload } from './BrewDigestView';
import type { MacroPanelContextPayload } from './panel/MacroPanelView';
import type { StockTab, MacroTab } from '../_lib/contentTypes';
import ResultsPanel from './ResultsPanel';
import StockPanelView from './panel/StockPanelView';
import MacroPanelView from './panel/MacroPanelView';
import DailyReportView from './DailyReportView';
import MorningReportView from './MorningReportView';
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
  /** Called when stock data is loaded in StockPanelView, for Agent context. */
  onStockContextReady?: (payload: StockPanelContextPayload) => void;
  /** Called when daily report data is loaded in DailyReportView, for Agent context. */
  onReportContextReady?: (payload: DailyReportContextPayload) => void;
  /** Called when morning report data is loaded in MorningReportView, for Agent context. */
  onMorningContextReady?: (payload: MorningReportContextPayload) => void;
  /** Called when macro panel data is loaded in MacroPanelView, for Agent context. */
  onMacroPanelContextReady?: (payload: MacroPanelContextPayload) => void;
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
  onMorningContextReady,
  onMacroPanelContextReady,
  onBrewContextReady,
}: ContentPanelProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Back navigation header */}
      {canGoBack && (
        <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-border/30">
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
          <span className="text-xs text-muted-foreground/70">
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
          <StockPanelView
            key={`${activeContent.params.symbol}-${activeContent.params.tab || ''}`}
            symbol={activeContent.params.symbol}
            defaultTab={(activeContent.params.tab as StockTab) || undefined}
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

        {activeContent.type === 'morning_report' && (
          <MorningReportView
            key={activeContent.params.date || 'latest'}
            date={activeContent.params.date || undefined}
            onContextReady={onMorningContextReady}
          />
        )}

        {activeContent.type === 'macro' && (
          <MacroPanelView
            key={`macro-${activeContent.params.tab || 'overview'}`}
            defaultTab={(activeContent.params.tab as MacroTab) || undefined}
            onContextReady={onMacroPanelContextReady}
          />
        )}

        {/* Legacy: map old macro_* types through MacroPanelView */}
        {activeContent.type === 'macro_liquidity' && (
          <MacroPanelView key="macro-liquidity" defaultTab="liquidity" onContextReady={onMacroPanelContextReady} />
        )}
        {activeContent.type === 'macro_economy' && (
          <MacroPanelView key="macro-economy" defaultTab="economy" onContextReady={onMacroPanelContextReady} />
        )}
        {activeContent.type === 'macro_inflation' && (
          <MacroPanelView key="macro-inflation" defaultTab="inflation" onContextReady={onMacroPanelContextReady} />
        )}
        {activeContent.type === 'macro_sentiment' && (
          <MacroPanelView key="macro-sentiment" defaultTab="sentiment" onContextReady={onMacroPanelContextReady} />
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
