'use client';

import type { ContentContext } from '../_lib/contentTypes';
import type { FilterStep } from './FilterProgress';
import type { StockPanelContextPayload } from './panel/StockPanelView';
import type { DailyReportContextPayload } from './DailyReportView';
import type { MorningReportContextPayload } from './MorningReportView';
import type { MacroContextPayload } from './MacroOverview';
import type { BrewContextPayload } from './BrewDigestView';
import type { LiquidityContextPayload } from './LiquidityView';
import type { EconomyContextPayload } from './EconomyView';
import type { InflationContextPayload } from './InflationView';
import type { SentimentContextPayload } from './SentimentView';
import type { StockTab, MacroTab } from '../_lib/contentTypes';
import ResultsPanel from './ResultsPanel';
import StockPanelView from './panel/StockPanelView';
import DailyReportView from './DailyReportView';
import MorningReportView from './MorningReportView';
import MacroOverview from './MacroOverview';
import BrewDigestView from './BrewDigestView';
import LiquidityView from './LiquidityView';
import EconomyView from './EconomyView';
import InflationView from './InflationView';
import SentimentView from './SentimentView';

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
  /** Called when macro data is loaded in MacroOverview, for Agent context. */
  onMacroContextReady?: (payload: MacroContextPayload) => void;
  /** Called when brew digest data is loaded in BrewDigestView, for Agent context. */
  onBrewContextReady?: (payload: BrewContextPayload) => void;
  onLiquidityContextReady?: (payload: LiquidityContextPayload) => void;
  onEconomyContextReady?: (payload: EconomyContextPayload) => void;
  onInflationContextReady?: (payload: InflationContextPayload) => void;
  onSentimentContextReady?: (payload: SentimentContextPayload) => void;
}

export default function ContentPanel({
  activeContent,
  canGoBack,
  onGoBack,
  screenerProps,
  onStockContextReady,
  onReportContextReady,
  onMorningContextReady,
  onMacroContextReady,
  onBrewContextReady,
  onLiquidityContextReady,
  onEconomyContextReady,
  onInflationContextReady,
  onSentimentContextReady,
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

        {activeContent.type === 'macro' && (() => {
          const macroTab = activeContent.params.tab as MacroTab | undefined;
          if (macroTab === 'liquidity') return <LiquidityView onContextReady={onLiquidityContextReady} />;
          if (macroTab === 'economy') return <EconomyView onContextReady={onEconomyContextReady} />;
          if (macroTab === 'inflation') return <InflationView onContextReady={onInflationContextReady} />;
          if (macroTab === 'sentiment') return <SentimentView onContextReady={onSentimentContextReady} />;
          return <MacroOverview onContextReady={onMacroContextReady} />;
        })()}

        {/* Legacy: keep old macro_* types working for backward compat */}
        {activeContent.type === 'macro_liquidity' && (
          <LiquidityView onContextReady={onLiquidityContextReady} />
        )}

        {activeContent.type === 'macro_economy' && (
          <EconomyView onContextReady={onEconomyContextReady} />
        )}

        {activeContent.type === 'macro_inflation' && (
          <InflationView onContextReady={onInflationContextReady} />
        )}

        {activeContent.type === 'macro_sentiment' && (
          <SentimentView onContextReady={onSentimentContextReady} />
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
