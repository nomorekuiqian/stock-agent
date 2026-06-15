'use client';

import { useState, useEffect } from 'react';
import type { SignalLights } from '@/lib/api';
import { useWeeklyReport } from '@/hooks/queries/use-weekly-report';
import { useLiquidityMetrics, useLiquidityHistory, useGlobalLiquidity } from '@/hooks/queries/use-liquidity-data';
import {
  useEconomicFundamentals,
  useInflationRates,
  useCpiBreakdown,
  useMarketSentiment,
  useTreasuryCommodities,
} from '@/hooks/queries/use-macro-data';
import type { MacroTab } from '../../_lib/contentTypes';
import MacroOverview from '../MacroOverview';
import LiquidityView from '../LiquidityView';
import EconomyView from '../EconomyView';
import InflationView from '../InflationView';
import SentimentView from '../SentimentView';

// ---------------------------------------------------------------------------
// Shared indicator shape for context payload
// ---------------------------------------------------------------------------

interface ContextIndicator {
  series_id: string;
  name: string;
  value: number | null;
  change: number | null;
  date: string | null;
  units: string;
}

interface ContextDimension {
  name: string;
  name_zh: string;
  score: number;
  risk_level: string;
  headline: string;
  indicators: ContextIndicator[];
}

// ---------------------------------------------------------------------------
// Context payload type — mirrors everything the user sees on the panel
// ---------------------------------------------------------------------------

export interface MacroPanelContextPayload {
  type: 'macro';
  active_tab: string;

  // Weekly report
  week_label?: string;
  verdict?: string;
  signal_lights?: { liquidity: string; economy: string; inflation: string; sentiment: string };
  landscape?: string;
  narrative?: string;
  takeaway?: string;

  // Liquidity — full metrics + recent history + global
  liquidity?: {
    metrics: Record<string, { value: number | null; change: number | null; date: string | null; units: string }>;
    recent_history: { time: string; net_liquidity: number; fed_assets: number; tga: number; rrp: number }[];
    global?: {
      global_liquidity_value: number | null;
      fed_assets: number | null;
      ecb_assets: number | null;
      boj_assets: number | null;
      fx_rates?: { eurusd: number | null; usdjpy: number | null };
    };
  };

  // Economy — full dimensions with all indicator values
  economy?: {
    overall_score: number;
    overall_level: string;
    overall_headline: string;
    dimensions: ContextDimension[];
  };

  // Inflation — full dimensions + CPI breakdown + treasury + commodities
  inflation?: {
    overall_score: number;
    overall_level: string;
    overall_headline: string;
    dimensions: ContextDimension[];
    cpi_components: { name_zh: string; yoy_pct: number | null; mom_pct: number | null }[];
    treasury?: {
      rates: Record<string, { rate: number; daily_change_bps: number | null }>;
      spreads: Record<string, number>;
      yield_curve_shape: string;
    };
    commodities?: Record<string, { price: number | null; changePercent: number | null }>;
    dollar?: { price: number | null; daily_change: number | null };
  };

  // Sentiment — full dimensions (CNN 7 components + VIX/VVIX/SKEW values)
  sentiment?: {
    overall_score: number;
    overall_level: string;
    overall_headline: string;
    dimensions: ContextDimension[];
  };
}

// ---------------------------------------------------------------------------
// Props & constants
// ---------------------------------------------------------------------------

interface MacroPanelViewProps {
  defaultTab?: MacroTab;
  onContextReady?: (payload: MacroPanelContextPayload) => void;
}

const TABS: { key: MacroTab; label: string }[] = [
  { key: 'overview', label: '周报' },
  { key: 'liquidity', label: '流动性' },
  { key: 'economy', label: '经济基本面' },
  { key: 'inflation', label: '通胀与利率' },
  { key: 'sentiment', label: '市场情绪' },
];

const SIGNAL_COLORS: Record<string, string> = {
  green: 'bg-emerald-500', yellow: 'bg-amber-400', red: 'bg-red-500',
};
const SIGNAL_TEXT_COLORS: Record<string, string> = {
  green: 'text-emerald-500', yellow: 'text-amber-400', red: 'text-red-500',
};
const SIGNAL_LABELS: Record<string, string> = {
  green: '利好', yellow: '中性', red: '利空',
};
const DIMENSION_NAMES: Record<string, string> = {
  liquidity: '流动性', economy: '经济', inflation: '通胀', sentiment: '情绪',
};

function formatWeekLabel(label: string): string {
  const match = label.match(/^(\d{4})\.W(\d{2})$/);
  if (!match) return label;
  return `${match[1]} 年第 ${parseInt(match[2], 10)} 周`;
}

/** Map SubDimension to context-friendly shape with full indicators */
function mapDimension(d: { name: string; name_zh: string; score: number; risk_level: string; headline: string; indicators: { series_id: string; name: string; value: number | null; change: number | null; date: string | null; units: string }[] }): ContextDimension {
  return {
    name: d.name,
    name_zh: d.name_zh,
    score: d.score,
    risk_level: d.risk_level,
    headline: d.headline,
    indicators: d.indicators.map((ind) => ({
      series_id: ind.series_id,
      name: ind.name,
      value: ind.value,
      change: ind.change,
      date: ind.date,
      units: ind.units,
    })),
  };
}

// Recent history: keep last N data points for AI context
const HISTORY_POINTS = 8;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MacroPanelView({
  defaultTab,
  onContextReady,
}: MacroPanelViewProps) {
  const [activeTab, setActiveTab] = useState<MacroTab>(defaultTab || 'overview');

  // --- Data hooks (React Query deduplicates with sub-views) ---
  const { data: weeklyResponse, isLoading, error } = useWeeklyReport();
  // Liquidity
  const { data: liqResponse } = useLiquidityMetrics();
  const { data: liqHistoryResponse } = useLiquidityHistory(365);
  const { data: globalLiqResponse } = useGlobalLiquidity();
  // Economy
  const { data: econResponse } = useEconomicFundamentals();
  // Inflation + Treasury/Commodities
  const { data: inflResponse } = useInflationRates();
  const { data: cpiResponse } = useCpiBreakdown();
  const { data: tcResponse } = useTreasuryCommodities();
  // Sentiment
  const { data: sentResponse } = useMarketSentiment();

  // --- Derived data ---
  const report = weeklyResponse?.success ? weeklyResponse.data : null;
  const liqMetrics = liqResponse?.success ? liqResponse.metrics : null;
  const liqHistory = liqHistoryResponse?.success ? liqHistoryResponse.data?.observations : null;
  const globalLiq = globalLiqResponse?.success ? globalLiqResponse.data : null;
  const econ = econResponse?.success ? econResponse.data : null;
  const inflation = inflResponse?.success ? inflResponse.data : null;
  const cpiComponents = cpiResponse?.success ? cpiResponse.components : null;
  const tcData = tcResponse?.success ? tcResponse : null;
  const sentiment = sentResponse?.success ? sentResponse.data : null;

  // --- Push aggregated context to parent ---
  useEffect(() => {
    if (!onContextReady || !report) return;

    const payload: MacroPanelContextPayload = {
      type: 'macro',
      active_tab: activeTab,
      // Weekly report
      week_label: report.week_label,
      verdict: report.verdict,
      signal_lights: report.signal_lights,
      landscape: report.landscape,
      narrative: report.narrative,
      takeaway: report.takeaway,
    };

    // --- Liquidity: full metrics + recent history + global ---
    if (liqMetrics) {
      const metricEntries: Record<string, { value: number | null; change: number | null; date: string | null; units: string }> = {};
      for (const [key, m] of Object.entries(liqMetrics)) {
        metricEntries[key] = { value: m.value, change: m.change, date: m.date, units: m.units };
      }

      const recentHistory = (liqHistory ?? [])
        .slice(-HISTORY_POINTS)
        .map((obs) => ({
          time: obs.time,
          net_liquidity: obs.value,
          fed_assets: obs.fed_assets,
          tga: obs.tga,
          rrp: obs.rrp,
        }));

      payload.liquidity = {
        metrics: metricEntries,
        recent_history: recentHistory,
      };

      if (globalLiq) {
        payload.liquidity.global = {
          global_liquidity_value: globalLiq.global_liquidity?.value ?? null,
          fed_assets: globalLiq.fed_assets?.value ?? null,
          ecb_assets: globalLiq.ecb_assets?.value ?? null,
          boj_assets: globalLiq.boj_assets?.value ?? null,
          fx_rates: globalLiq.fx_rates,
        };
      }
    }

    // --- Economy: full dimensions with all 17 indicator values ---
    if (econ) {
      payload.economy = {
        overall_score: econ.overall_score,
        overall_level: econ.overall_level,
        overall_headline: econ.overall_headline,
        dimensions: econ.sub_dimensions.map(mapDimension),
      };
    }

    // --- Inflation: full dimensions + CPI + treasury + commodities ---
    if (inflation) {
      payload.inflation = {
        overall_score: inflation.overall_score,
        overall_level: inflation.overall_level,
        overall_headline: inflation.overall_headline,
        dimensions: inflation.sub_dimensions.map(mapDimension),
        cpi_components: (cpiComponents || []).map((c) => ({
          name_zh: c.name_zh,
          yoy_pct: c.yoy_pct,
          mom_pct: c.mom_pct,
        })),
      };

      if (tcData) {
        payload.inflation.treasury = {
          rates: tcData.treasury.rates,
          spreads: tcData.treasury.spreads,
          yield_curve_shape: tcData.treasury.yield_curve_shape,
        };
        const commodities: Record<string, { price: number | null; changePercent: number | null }> = {};
        for (const [name, data] of Object.entries(tcData.commodities)) {
          commodities[name] = { price: data.price, changePercent: data.changePercent };
        }
        payload.inflation.commodities = commodities;
        payload.inflation.dollar = tcData.dollar;
      }
    }

    // --- Sentiment: full dimensions (CNN 7 components + VIX/VVIX/SKEW) ---
    if (sentiment) {
      payload.sentiment = {
        overall_score: sentiment.overall_score,
        overall_level: sentiment.overall_level,
        overall_headline: sentiment.overall_headline,
        dimensions: sentiment.sub_dimensions.map(mapDimension),
      };
    }

    onContextReady(payload);
  }, [activeTab, report, liqMetrics, liqHistory, globalLiq, econ, inflation, cpiComponents, tcData, sentiment, onContextReady]);

  // --- Loading state ---
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 rounded-full border border-primary/20" />
          <div className="absolute inset-0 rounded-full border-t border-primary animate-spin" />
          <svg
            className="absolute inset-0 m-auto w-5 h-5 text-primary/60"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth="1.5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5"
            />
          </svg>
        </div>
        <span className="text-xs text-muted-foreground">加载宏观数据</span>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
        <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
          <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
            />
          </svg>
        </div>
        <p className="text-sm text-muted-foreground">无法加载宏观数据</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      {/* Hero header */}
      <div className="px-5 pt-4 pb-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-primary text-xs font-semibold tracking-[0.25em] uppercase">MACRO</span>
        </div>
        <h2 className="text-2xl font-semibold text-foreground tracking-tight">
          宏观市场
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          {formatWeekLabel(report.week_label)}
          {report.generated_at && ` · ${new Date(report.generated_at).toLocaleDateString('zh-CN')}`}
        </p>

        {/* Signal lights */}
        {report.signal_lights && (
          <div className="flex flex-wrap gap-2 mt-3">
            {(Object.entries(report.signal_lights) as [keyof SignalLights, string][]).map(([key, color]) => (
              <div key={key} className="flex items-center gap-1.5 rounded-full bg-card border border-border/60 px-2.5 py-1">
                <div className={`w-1.5 h-1.5 rounded-full ${SIGNAL_COLORS[color] || 'bg-muted'}`} />
                <span className="text-xs text-foreground">{DIMENSION_NAMES[key]}</span>
                <span className={`text-xs font-medium ${SIGNAL_TEXT_COLORS[color] || 'text-muted-foreground'}`}>
                  {SIGNAL_LABELS[color] || color}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tab switcher */}
      <div className="flex items-center border-b border-border/30 px-5 overflow-x-auto scrollbar-none">
        {TABS.map((t) => {
          const active = t.key === activeTab;
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`relative px-3.5 py-2.5 text-sm font-medium whitespace-nowrap transition-colors cursor-pointer shrink-0
                focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:outline-none
                ${active ? 'text-emerald-400' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {t.label}
              {active && (
                <span className="absolute bottom-[-1px] left-2 right-2 h-0.5 bg-emerald-400 rounded-t" />
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div key={activeTab} className="animate-in fade-in-0 duration-200">
        {activeTab === 'overview' && <MacroOverview embedded />}
        {activeTab === 'liquidity' && <LiquidityView embedded />}
        {activeTab === 'economy' && <EconomyView embedded />}
        {activeTab === 'inflation' && <InflationView embedded />}
        {activeTab === 'sentiment' && <SentimentView embedded />}
      </div>
    </div>
  );
}
