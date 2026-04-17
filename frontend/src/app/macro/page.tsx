'use client';

import { useQueryClient } from '@tanstack/react-query';
import dynamic from 'next/dynamic';

import { AiChatLink } from '@/components/AiChatLink';
import { MacroActions } from './_components/MacroActions';
import { OverviewStrip } from './_components/OverviewStrip';
import { MacroQuadrant } from './_components/MacroQuadrant';
import { DashboardLegend } from './_components/DashboardLegend';

import { useMacroRiskDashboard, useMarketSentiment, useTreasuryCommodities, useInflationRates, useEconomicFundamentals } from '@/hooks/queries/use-macro-data';
import { useLiquidityMetrics, useLiquidityHistory } from '@/hooks/queries/use-liquidity-data';
import { useWeeklyReport } from '@/hooks/queries/use-weekly-report';
import { queryKeys } from '@/hooks/queries/query-keys';
import { formatLiquidityValue } from './liquidity/liquidity-metrics';
// SignalLights type no longer used on dashboard (moved to weekly report page)

// ── Chart components (dynamic, ssr: false) ──────────────────────────────────

const NetLiquidityChart = dynamic(
  () => import('@/components/NetLiquidityChart').then(mod => mod.NetLiquidityChart),
  { ssr: false, loading: () => <div className="h-[220px] bg-muted/30 animate-pulse rounded-lg" /> },
);
// YieldCurveChart available but not used on dashboard (available in /macro/economy detail page)
const FredAreaChart = dynamic(
  () => import('@/components/FredAreaChart').then(mod => mod.FredAreaChart),
  { ssr: false, loading: () => <div className="h-[200px] bg-muted/30 animate-pulse rounded-lg" /> },
);
const IndexAreaChart = dynamic(
  () => import('@/components/IndexAreaChart').then(mod => mod.IndexAreaChart),
  { ssr: false, loading: () => <div className="h-[220px] bg-muted/30 animate-pulse rounded-lg" /> },
);

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtPercent(v: number | null | undefined, decimals = 1): string {
  if (v == null) return 'N/A';
  return `${v.toFixed(decimals)}%`;
}

function fmtNumber(v: number | null | undefined, decimals = 2): string {
  if (v == null) return 'N/A';
  return v.toFixed(decimals);
}

function fmtK(v: number | null | undefined): string {
  if (v == null) return 'N/A';
  // Source unit is "thousands of persons" (e.g. PAYEMS). 159,900 → "159.9M"
  const abs = Math.abs(v);
  if (abs >= 1000) return `${(v / 1000).toFixed(1)}M`;
  return `${v.toFixed(0)}K`;
}

/** Format a yield-curve spread with explicit sign: +0.45% / -0.12%. */
function fmtSpread(v: number | null | undefined, decimals = 2): string {
  if (v == null) return 'N/A';
  return `${v >= 0 ? '+' : ''}${v.toFixed(decimals)}%`;
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function MacroPage() {
  const queryClient = useQueryClient();

  // Data hooks (all fire in parallel)
  const { data: dashboardRes, isLoading: dashboardLoading } = useMacroRiskDashboard();
  const { data: liquidityRes, isLoading: liquidityLoading } = useLiquidityMetrics();
  const { data: historyRes, isLoading: historyLoading } = useLiquidityHistory(180);
  const { data: sentimentRes, isLoading: sentimentLoading } = useMarketSentiment();
  const { data: treasuryRes, isLoading: treasuryLoading } = useTreasuryCommodities();
  const { data: inflationRes, isLoading: inflationLoading } = useInflationRates();
  const { data: economyRes, isLoading: economyLoading } = useEconomicFundamentals();
  const { data: weeklyRes, isLoading: weeklyLoading } = useWeeklyReport();

  // Derived data
  const dashboard = dashboardRes?.success ? dashboardRes : null;
  const metrics = liquidityRes?.success ? liquidityRes.metrics : null;
  const historyData = historyRes?.success ? historyRes.data : null;
  const sentiment = sentimentRes?.success ? sentimentRes.data : null;
  const treasury = treasuryRes?.success ? treasuryRes : null;
  const report = weeklyRes?.success ? weeklyRes.data : null;

  const inflation = inflationRes?.success ? inflationRes.data : null;
  const economy = economyRes?.success ? economyRes.data : null;
  const verdict = report?.verdict ?? null;

  const isAnyLoading = dashboardLoading || liquidityLoading || sentimentLoading || treasuryLoading || inflationLoading || weeklyLoading || economyLoading;

  // Sentiment sub-dimensions
  const volDim = sentiment?.sub_dimensions?.find(d => d.name === 'volatility');
  const overallScore = sentiment?.overall_score != null ? Math.round(sentiment.overall_score) : null;
  const vix = volDim?.indicators?.find(i => i.series_id === 'VIX');

  // Economy indicators — pulled from the /api/macro-risk/economy sub_dimensions
  // response, which is the only endpoint that exposes indicator values/changes
  // in a display-ready shape. The dashboard API's categories are risk-scoring
  // metadata and don't carry value/change fields.
  const growthDim = economy?.sub_dimensions?.find(d => d.name === 'growth');
  const employmentDim = economy?.sub_dimensions?.find(d => d.name === 'employment');
  const creditDim = economy?.sub_dimensions?.find(d => d.name === 'credit');
  const gdpInd = growthDim?.indicators?.find(i => i.series_id === 'A191RL1Q225SBEA');
  const unempInd = employmentDim?.indicators?.find(i => i.series_id === 'UNRATE');
  const payrollsInd = employmentDim?.indicators?.find(i => i.series_id === 'PAYEMS');
  const yieldCurveInd = creditDim?.indicators?.find(i => i.series_id === 'T10Y2Y');

  // Inflation indicators (from inflation-rates API sub_dimensions)
  const inflationDim = inflation?.sub_dimensions?.find(d => d.name === 'inflation');
  const ratesDim = inflation?.sub_dimensions?.find(d => d.name === 'rates');
  const cpiInd = inflationDim?.indicators?.find(i => i.series_id === 'CPIAUCSL');
  const pceInd = inflationDim?.indicators?.find(i => i.series_id === 'PCEPILFE');
  const ffrInd = ratesDim?.indicators?.find(i => i.series_id === 'FEDFUNDS');

  // Refresh handler
  function handleRefresh() {
    queryClient.invalidateQueries({ queryKey: queryKeys.macro.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.liquidity.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.weeklyReport.all });
  }

  return (
    <main className="min-h-screen bg-background">
      {/* ── Header ── */}
      <div className="border-b border-border/30">
        <div className="max-w-[1400px] mx-auto px-4 lg:px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="font-editorial text-2xl text-foreground tracking-tight">
                  宏观仪表盘
                </h1>
                {!isAnyLoading && dashboard?.timestamp && (
                  <span className="text-xs text-muted-foreground/70 font-data hidden sm:inline">
                    {new Date(dashboard.timestamp).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleRefresh}
                disabled={isAnyLoading}
                className="p-2 rounded-lg text-muted-foreground/70 hover:text-primary hover:bg-primary/5 transition-all disabled:opacity-40"
                aria-label="刷新数据"
              >
                <svg className={`w-4 h-4 ${isAnyLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
              <AiChatLink href="/research?context=macro" />
              <MacroActions />
            </div>
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="max-w-[1400px] mx-auto px-4 lg:px-6 py-5 space-y-4">

        {/* Onboarding导读 */}
        <DashboardLegend />

        {/* Executive summary */}
        <OverviewStrip
          verdict={verdict}
          landscape={report?.landscape ?? null}
          loading={weeklyLoading}
        />

        {/* Four quadrants grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* ── Quadrant 1: Liquidity ── */}
          <MacroQuadrant
            title="流动性环境"
            subtitle={report?.liquidity_analysis?.summary}
            detailHref="/macro/liquidity"
            loading={liquidityLoading && historyLoading}
            aiText={report?.liquidity_analysis?.data_changes}
            defaultChart="net_liquidity"
            metrics={[
              {
                key: 'net_liquidity', label: '净流动性',
                value: metrics ? formatLiquidityValue(metrics.net_liquidity.value, metrics.net_liquidity.units) : 'N/A',
                trend: { type: 'weekly' as const, label: metrics?.net_liquidity.change != null ? `周${metrics.net_liquidity.change >= 0 ? '+' : ''}${metrics.net_liquidity.change.toFixed(1)}%` : undefined, direction: metrics?.net_liquidity.change != null ? (metrics.net_liquidity.change >= 0 ? 'up' as const : 'down' as const) : undefined },
                chart: historyData?.observations
                  ? <NetLiquidityChart data={historyData.observations} height={200} compact />
                  : <div className="h-[200px] flex items-center justify-center text-xs text-muted-foreground/70">加载中...</div>,
              },
              { key: 'fed_assets', label: 'Fed 资产', value: metrics ? formatLiquidityValue(metrics.fed_assets.value, metrics.fed_assets.units) : 'N/A', trend: { type: 'weekly' as const, label: metrics?.fed_assets.change != null ? `周${metrics.fed_assets.change >= 0 ? '+' : ''}${metrics.fed_assets.change.toFixed(1)}%` : undefined, direction: metrics?.fed_assets.change != null ? (metrics.fed_assets.change >= 0 ? 'up' as const : 'down' as const) : undefined }, chart: <FredAreaChart seriesId="WALCL" timeRange="1Y" height={200} valueFormat="currency_millions" /> },
              { key: 'tga', label: 'TGA', value: metrics ? formatLiquidityValue(metrics.tga.value, metrics.tga.units) : 'N/A', trend: { type: 'weekly' as const, label: metrics?.tga.change != null ? `周${metrics.tga.change >= 0 ? '+' : ''}${metrics.tga.change.toFixed(1)}%` : undefined, direction: metrics?.tga.change != null ? (metrics.tga.change >= 0 ? 'up' as const : 'down' as const) : undefined }, chart: <FredAreaChart seriesId="WDTGAL" timeRange="1Y" height={200} valueFormat="currency_millions" /> },
              { key: 'reserves', label: '银行准备金', value: metrics ? formatLiquidityValue(metrics.reserves.value, metrics.reserves.units) : 'N/A', trend: { type: 'weekly' as const, label: metrics?.reserves.change != null ? `周${metrics.reserves.change >= 0 ? '+' : ''}${metrics.reserves.change.toFixed(1)}%` : undefined, direction: metrics?.reserves.change != null ? (metrics.reserves.change >= 0 ? 'up' as const : 'down' as const) : undefined }, chart: <FredAreaChart seriesId="WRESBAL" timeRange="1Y" height={200} valueFormat="currency_millions" /> },
            ]}
          />

          {/* ── Quadrant 2: Economy ── */}
          <MacroQuadrant
            title="经济基本面"
            subtitle={report?.economy_analysis?.summary}
            detailHref="/macro/economy"
            loading={economyLoading}
            aiText={report?.economy_analysis?.data_changes}
            defaultChart="gdp"
            metrics={[
              {
                key: 'gdp', label: 'GDP 增长率',
                value: fmtPercent(gdpInd?.value),
                trend: { type: 'quarterly' as const, label: gdpInd?.previous_value != null ? `前值 ${gdpInd.previous_value.toFixed(1)}%` : undefined },
                chart: <FredAreaChart seriesId="A191RL1Q225SBEA" timeRange="5Y" height={200} valueFormat="percent" chartType="histogram" />,
              },
              { key: 'unemployment', label: '失业率', value: fmtPercent(unempInd?.value), trend: { type: 'monthly' as const, direction: unempInd?.change != null ? (unempInd.change <= 0 ? 'down' as const : 'up' as const) : undefined }, chart: <FredAreaChart seriesId="UNRATE" timeRange="2Y" height={200} valueFormat="percent" /> },
              { key: 'payrolls', label: '非农就业', value: payrollsInd?.value != null ? fmtK(payrollsInd.value) : 'N/A', trend: { type: 'monthly' as const, direction: payrollsInd?.change != null ? (payrollsInd.change >= 0 ? 'up' as const : 'down' as const) : undefined }, chart: <FredAreaChart seriesId="PAYEMS" timeRange="2Y" height={200} valueFormat="thousands" /> },
              { key: 'yield_curve', label: '10Y-2Y 利差', value: fmtSpread(yieldCurveInd?.value), trend: { type: 'daily' as const, label: yieldCurveInd?.value != null ? (yieldCurveInd.value >= 0 ? '正常' : '倒挂') : undefined, direction: yieldCurveInd?.value != null ? (yieldCurveInd.value >= 0 ? 'up' as const : 'down' as const) : undefined }, chart: <FredAreaChart seriesId="T10Y2Y" timeRange="3Y" height={200} valueFormat="percent" /> },
            ]}
          />

          {/* ── Quadrant 3: Inflation & Rates ── */}
          <MacroQuadrant
            title="通胀与利率"
            subtitle={report?.inflation_analysis?.summary}
            detailHref="/macro/inflation-rates"
            loading={inflationLoading}
            aiText={report?.inflation_analysis?.data_changes}
            defaultChart="cpi"
            metrics={[
              {
                key: 'cpi', label: 'CPI YoY',
                value: fmtPercent(cpiInd?.value),
                trend: { type: 'monthly' as const, direction: cpiInd?.change != null ? (cpiInd.change <= 0 ? 'down' as const : 'up' as const) : undefined },
                chart: <FredAreaChart seriesId="CPIAUCSL" timeRange="2Y" height={200} units="pc1" valueFormat="percent" />,
              },
              { key: 'pce', label: '核心 PCE', value: fmtPercent(pceInd?.value), trend: { type: 'monthly' as const, direction: pceInd?.change != null ? (pceInd.change <= 0 ? 'down' as const : 'up' as const) : undefined }, chart: <FredAreaChart seriesId="PCEPILFE" timeRange="2Y" height={200} units="pc1" valueFormat="percent" /> },
              { key: 'ffr', label: '联邦基金利率', value: metrics?.effr?.value != null ? fmtPercent(metrics.effr.value, 2) : fmtPercent(ffrInd?.value, 2), trend: { type: 'daily' as const }, chart: <FredAreaChart seriesId="FEDFUNDS" timeRange="2Y" height={200} valueFormat="percent" /> },
              { key: '5y5y', label: '长期通胀预期', value: 'N/A', trend: { type: 'daily' as const }, chart: <FredAreaChart seriesId="T5YIFR" timeRange="1Y" height={200} valueFormat="percent" /> },
              { key: '10y', label: '10Y 国债', value: treasury?.treasury?.rates?.['10Y']?.rate != null ? fmtPercent(treasury.treasury.rates['10Y'].rate, 2) : 'N/A', trend: { type: 'daily' as const }, chart: <FredAreaChart seriesId="DGS10" timeRange="2Y" height={200} valueFormat="percent" /> },
            ]}
          />

          {/* ── Quadrant 4: Sentiment ── */}
          <MacroQuadrant
            title="市场情绪"
            subtitle={report?.sentiment_analysis?.summary}
            detailHref="/macro/sentiment"
            loading={sentimentLoading}
            aiText={report?.sentiment_analysis?.data_changes}
            defaultChart="vix"
            metrics={[
              {
                key: 'fg', label: '恐贪指数',
                value: overallScore != null ? `${overallScore}/100` : 'N/A',
              },
              {
                key: 'vix', label: 'VIX',
                value: vix?.value != null ? fmtNumber(vix.value) : 'N/A',
                trend: { type: 'daily' as const, direction: vix?.change != null ? (vix.change <= 0 ? 'down' as const : 'up' as const) : undefined },
                chart: <IndexAreaChart symbol="VIX" timeRange="6M" height={200} />,
              },
            ]}
          />

        </div>
      </div>
    </main>
  );
}
