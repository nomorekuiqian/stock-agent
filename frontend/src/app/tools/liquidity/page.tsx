'use client';

import { useState, useEffect, useCallback } from 'react';
import { TradingViewWidget } from '@/components/TradingViewWidget';
import { LiquidityCard } from '@/components/LiquidityCard';
import { NFCIGauge } from '@/components/NFCIGauge';
import { NetLiquidityChart } from '@/components/NetLiquidityChart';
import { api, LiquidityMetrics, LiquidityAnalysis, LiquidityHistoryObservation } from '@/lib/api';
import { formatCompareDateLabel, formatDateTimePacific } from '@/lib/timezone';
import ReactMarkdown from 'react-markdown';

// FRED symbols for key liquidity indicators
const FRED_SYMBOLS = {
  fedAssets: 'FRED:WALCL',      // Fed Total Assets
  tga: 'FRED:WDTGAL',           // Treasury General Account
  rrp: 'FRED:RRPONTSYD',        // Overnight Reverse Repo
  reserves: 'FRED:WRESBAL',     // Bank Reserves
  sofr: 'FRED:SOFR',            // SOFR Rate
  effr: 'FRED:EFFR',            // Effective Fed Funds Rate
  nfci: 'FRED:NFCI',            // Financial Conditions Index
};

// Indicator descriptions in Chinese
const INDICATOR_INFO = {
  fedAssets: {
    title: '美联储总资产 (WALCL)',
    description: '美联储资产负债表的总规模。当美联储购买国债或MBS时,资产增加,向市场注入流动性(QE);当美联储缩表时,资产减少,回收流动性(QT)。这是影响市场流动性的最核心指标。',
  },
  tga: {
    title: '财政部一般账户 (TGA)',
    description: '美国财政部在美联储的存款账户。当财政部发债募资时,TGA余额上升,从市场抽走流动性;当财政部支出时,TGA余额下降,流动性释放回市场。债务上限谈判期间波动通常会加大。',
  },
  rrp: {
    title: '隔夜逆回购 (ON RRP)',
    description: '货币市场基金等机构将现金存放在美联储的工具。RRP下降意味着资金从美联储流回市场,释放流动性;RRP上升则吸收市场流动性。当RRP耗尽接近零时,市场将失去这一流动性缓冲,届时QT的紧缩效应将更加明显。',
  },
  reserves: {
    title: '银行准备金 (WRESBAL)',
    description: '商业银行存放在美联储的准备金余额。准备金是银行进行借贷和交易的基础。美联储认为准备金在3万亿美元以上属于"充裕"水平,低于该阈值可能触发货币市场压力。',
  },
  sofr: {
    title: 'SOFR (有担保隔夜融资利率)',
    description: '基于美国国债回购市场的基准利率,反映银行间短期融资成本。关注SOFR是否稳定在美联储目标区间内——若出现异常波动或突破区间上限,通常预示流动性紧张,如2019年9月的回购市场危机。',
  },
  effr: {
    title: '有效联邦基金利率 (EFFR)',
    description: '银行间隔夜无担保借贷的实际利率,是美联储货币政策传导的核心指标。EFFR在目标区间中部表示流动性适中,接近上限暗示流动性趋紧,接近下限则表示流动性充裕。',
  },
  nfci: {
    title: '芝加哥联储金融状况指数 (NFCI)',
    description: '综合衡量美国金融状况的指标,包含风险、信贷和杠杆三个维度。负值表示金融条件宽松(有利于风险资产),正值表示金融条件收紧。除当前值外,也需关注变化趋势。',
  },
};

// Format relative time for comparison label - use Pacific timezone utility
const formatCompareDate = formatCompareDateLabel;

// Format large numbers
function formatValue(value: number | null, units: string): string {
  if (value === null) return 'N/A';

  // Check if it's billions or millions based on units
  if (units.toLowerCase().includes('billion')) {
    if (value >= 1000) {
      return `$${(value / 1000).toFixed(2)}T`;
    }
    return `$${value.toFixed(0)}B`;
  }
  if (units.toLowerCase().includes('million')) {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(2)}T`;
    }
    if (value >= 1000) {
      return `$${(value / 1000).toFixed(0)}B`;
    }
    return `$${value.toFixed(0)}M`;
  }
  if (units.toLowerCase().includes('percent')) {
    return `${value.toFixed(2)}%`;
  }
  // For index values like NFCI
  return value.toFixed(2);
}

// Indicator description component
function IndicatorDescription({ title, description }: { title: string; description: string }) {
  return (
    <div className="bg-muted/30 rounded-lg p-3 mb-3 min-h-[120px]">
      <h4 className="text-sm font-medium text-foreground mb-1">{title}</h4>
      <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}

export default function LiquidityPage() {
  const [timeRange, setTimeRange] = useState<'1M' | '3M' | '6M' | '1Y' | 'ALL'>('6M');
  const [theme] = useState<'light' | 'dark'>('dark');
  const [metrics, setMetrics] = useState<LiquidityMetrics | null>(null);
  const [historyData, setHistoryData] = useState<LiquidityHistoryObservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  // AI Analysis state
  const [analysis, setAnalysis] = useState<LiquidityAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Unified data fetch - single API call for both metrics and history
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.getLiquidityHistory(365);
      if (response.success && response.data) {
        setHistoryData(response.data.observations);
        setLastUpdated(response.timestamp);
        // Extract metrics from the response
        if (response.data.metrics) {
          setMetrics(response.data.metrics);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取数据失败');
      console.error('Error fetching liquidity data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchLatestAnalysis = useCallback(async () => {
    try {
      const response = await api.getLatestLiquidityAnalysis();
      if (response.success && response.analysis) {
        setAnalysis(response.analysis);
      }
    } catch (err) {
      console.error('Error fetching latest analysis:', err);
    }
  }, []);

  const generateAnalysis = async () => {
    setAnalysisLoading(true);
    setAnalysisError(null);
    try {
      const response = await api.generateLiquidityAnalysis();
      if (response.success && response.analysis) {
        setAnalysis(response.analysis);
      } else {
        setAnalysisError(response.error || '生成分析失败');
      }
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : '生成分析失败');
      console.error('Error generating analysis:', err);
    } finally {
      setAnalysisLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    fetchLatestAnalysis();
  }, [fetchData, fetchLatestAnalysis]);

  const getInterval = () => {
    switch (timeRange) {
      case '1M': return 'D';
      case '3M': return 'D';
      case '6M': return 'W';
      case '1Y': return 'W';
      case 'ALL': return 'M';
      default: return 'W';
    }
  };

  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <section className="border-b border-border">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-8 md:py-10">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 dark:bg-emerald-500/20 border border-emerald-500/20 dark:border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-medium mb-3">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
                宏观流动性
              </div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
                流动性监测仪表盘
              </h1>
              <p className="text-muted-foreground mt-1">
                实时追踪美联储资产负债表、TGA、RRP 及净流动性变化
              </p>
              {lastUpdated && (
                <p className="text-xs text-muted-foreground mt-2">
                  最后更新: {formatDateTimePacific(lastUpdated)}
                </p>
              )}
            </div>

            <div className="flex items-center gap-3">
              {/* Refresh Button */}
              <button
                onClick={fetchData}
                disabled={loading}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
              >
                {loading ? (
                  <span className="flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    加载中...
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    刷新
                  </span>
                )}
              </button>

              {/* Time Range Selector */}
              <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                {(['1M', '3M', '6M', '1Y', 'ALL'] as const).map((range) => (
                  <button
                    key={range}
                    onClick={() => setTimeRange(range)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                      timeRange === range
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {range === 'ALL' ? '全部' : range}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Error Message */}
      {error && (
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-4">
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
            {error}
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 space-y-8">
        {/* Key Metrics Cards */}
        <section>
          <h2 className="text-sm font-medium text-muted-foreground mb-3">核心指标概览</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <LiquidityCard
              title="净流动性"
              value={metrics ? formatValue(metrics.net_liquidity?.value, metrics.net_liquidity?.units || 'Billions') : '-'}
              change={metrics?.net_liquidity?.change ?? undefined}
              changeLabel={formatCompareDate(metrics?.net_liquidity?.previous_date)}
              description="WALCL - TGA - RRP"
              loading={loading}
              highlight
            />
            <LiquidityCard
              title="美联储总资产"
              value={metrics ? formatValue(metrics.fed_assets?.value, metrics.fed_assets?.units || 'Billions') : '-'}
              change={metrics?.fed_assets?.change ?? undefined}
              changeLabel={formatCompareDate(metrics?.fed_assets?.previous_date)}
              loading={loading}
            />
            <LiquidityCard
              title="TGA 余额"
              value={metrics ? formatValue(metrics.tga?.value, metrics.tga?.units || 'Millions') : '-'}
              change={metrics?.tga?.change ?? undefined}
              changeLabel={formatCompareDate(metrics?.tga?.previous_date)}
              loading={loading}
            />
            <LiquidityCard
              title="隔夜逆回购"
              value={metrics ? formatValue(metrics.rrp?.value, metrics.rrp?.units || 'Billions') : '-'}
              change={metrics?.rrp?.change ?? undefined}
              changeLabel={formatCompareDate(metrics?.rrp?.previous_date)}
              loading={loading}
            />
          </div>
        </section>

        {/* Net Liquidity Formula Explanation */}
        <section className="bg-muted/30 rounded-xl border border-border p-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-medium text-foreground mb-1">净流动性计算公式</h3>
              <p className="text-xs text-muted-foreground">
                <code className="bg-muted px-1.5 py-0.5 rounded text-emerald-500">净流动性 = 美联储总资产 (WALCL) - TGA - RRP</code>
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                当 TGA 或 RRP 增加时,会从金融系统中抽走流动性;当它们减少时,流动性释放回市场。净流动性是判断市场资金面松紧的核心指标,与风险资产走势存在一定相关性,但通常存在数周至数月的滞后。
              </p>
            </div>
          </div>
        </section>

        {/* Net Liquidity Historical Chart */}
        <section>
          <h2 className="text-sm font-medium text-muted-foreground mb-3">净流动性历史趋势</h2>
          <NetLiquidityChart
            height={400}
            data={historyData}
            loading={loading}
            error={error}
            onRetry={fetchData}
          />
        </section>

        {/* Fed Balance Sheet Components */}
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">美联储资产负债表组成</h2>
          <p className="text-sm text-muted-foreground mb-4">
            这些指标共同决定了市场中可用的流动性水平,是理解宏观流动性的基础。
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Fed Assets */}
            <div className="flex flex-col">
              <IndicatorDescription
                title={INDICATOR_INFO.fedAssets.title}
                description={INDICATOR_INFO.fedAssets.description}
              />
              <TradingViewWidget
                symbol={FRED_SYMBOLS.fedAssets}
                title={INDICATOR_INFO.fedAssets.title}
                height={400}
                interval={getInterval()}
                theme={theme}
              />
            </div>

            {/* TGA */}
            <div className="flex flex-col">
              <IndicatorDescription
                title={INDICATOR_INFO.tga.title}
                description={INDICATOR_INFO.tga.description}
              />
              <TradingViewWidget
                symbol={FRED_SYMBOLS.tga}
                title={INDICATOR_INFO.tga.title}
                height={400}
                interval={getInterval()}
                theme={theme}
              />
            </div>

            {/* RRP */}
            <div className="flex flex-col">
              <IndicatorDescription
                title={INDICATOR_INFO.rrp.title}
                description={INDICATOR_INFO.rrp.description}
              />
              <TradingViewWidget
                symbol={FRED_SYMBOLS.rrp}
                title={INDICATOR_INFO.rrp.title}
                height={400}
                interval={getInterval()}
                theme={theme}
              />
            </div>

            {/* Bank Reserves */}
            <div className="flex flex-col">
              <IndicatorDescription
                title={INDICATOR_INFO.reserves.title}
                description={INDICATOR_INFO.reserves.description}
              />
              <TradingViewWidget
                symbol={FRED_SYMBOLS.reserves}
                title={INDICATOR_INFO.reserves.title}
                height={400}
                interval={getInterval()}
                theme={theme}
              />
            </div>
          </div>
        </section>

        {/* Money Market Rates & Financial Conditions */}
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">货币市场利率与金融状况</h2>
          <p className="text-sm text-muted-foreground mb-4">
            货币市场利率反映短期资金成本,金融状况指数综合衡量整体金融环境的松紧程度。
          </p>

          {/* SOFR & EFFR Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {/* SOFR */}
            <div className="flex flex-col">
              <IndicatorDescription
                title={INDICATOR_INFO.sofr.title}
                description={INDICATOR_INFO.sofr.description}
              />
              <TradingViewWidget
                symbol={FRED_SYMBOLS.sofr}
                title={INDICATOR_INFO.sofr.title}
                height={400}
                interval={getInterval()}
                theme={theme}
              />
            </div>

            {/* EFFR */}
            <div className="flex flex-col">
              <IndicatorDescription
                title={INDICATOR_INFO.effr.title}
                description={INDICATOR_INFO.effr.description}
              />
              <TradingViewWidget
                symbol={FRED_SYMBOLS.effr}
                title={INDICATOR_INFO.effr.title}
                height={400}
                interval={getInterval()}
                theme={theme}
              />
            </div>
          </div>

          {/* NFCI */}
          <div>
            <IndicatorDescription
              title={INDICATOR_INFO.nfci.title}
              description={INDICATOR_INFO.nfci.description}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <NFCIGauge
                value={metrics?.nfci?.value ?? 0}
                loading={loading}
              />
              <TradingViewWidget
                symbol={FRED_SYMBOLS.nfci}
                title="NFCI 历史走势"
                height={300}
                interval={getInterval()}
                theme={theme}
              />
            </div>
          </div>
        </section>

        {/* AI Analysis Section */}
        <section className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-medium text-foreground">AI 流动性分析</h3>
                <p className="text-xs text-muted-foreground">
                  由 GPT-4o-mini 提供支持
                  {analysis?.generated_at && (
                    <span className="ml-2">
                      | 生成于 {formatDateTimePacific(analysis.generated_at)}
                    </span>
                  )}
                </p>
              </div>
            </div>
            <button
              onClick={generateAnalysis}
              disabled={analysisLoading}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {analysisLoading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  生成中...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  生成分析
                </>
              )}
            </button>
          </div>

          {/* Analysis Error */}
          {analysisError && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
              {analysisError}
            </div>
          )}

          {/* Analysis Content */}
          {analysis ? (
            <div className="space-y-4">
              {/* Status Badge */}
              <div className="flex items-center gap-2">
                <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                  analysis.status === '充裕' ? 'bg-green-500/10 text-green-500' :
                  analysis.status === '适中' ? 'bg-yellow-500/10 text-yellow-500' :
                  'bg-red-500/10 text-red-500'
                }`}>
                  流动性状态: {analysis.status}
                </span>
              </div>

              {/* Analysis Text */}
              <div className="bg-muted/30 rounded-lg p-4">
                <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:text-foreground prose-headings:font-semibold prose-h3:text-base prose-h3:mt-4 prose-h3:mb-2 prose-p:text-foreground/90 prose-p:leading-relaxed prose-li:text-foreground/90 prose-strong:text-foreground prose-a:text-emerald-500 prose-a:no-underline hover:prose-a:underline">
                  <ReactMarkdown>{analysis.analysis}</ReactMarkdown>
                </div>
              </div>

              {/* Metrics Snapshot */}
              {analysis.metrics_snapshot && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2 pt-2 border-t border-border">
                  <div className="text-center p-2">
                    <div className="text-xs text-muted-foreground">净流动性</div>
                    <div className="text-sm font-medium text-foreground">
                      ${analysis.metrics_snapshot.net_liquidity?.toFixed(0) ?? 'N/A'}B
                    </div>
                  </div>
                  <div className="text-center p-2">
                    <div className="text-xs text-muted-foreground">美联储资产</div>
                    <div className="text-sm font-medium text-foreground">
                      ${analysis.metrics_snapshot.fed_assets?.toFixed(0) ?? 'N/A'}B
                    </div>
                  </div>
                  <div className="text-center p-2">
                    <div className="text-xs text-muted-foreground">TGA</div>
                    <div className="text-sm font-medium text-foreground">
                      ${analysis.metrics_snapshot.tga?.toFixed(0) ?? 'N/A'}B
                    </div>
                  </div>
                  <div className="text-center p-2">
                    <div className="text-xs text-muted-foreground">RRP</div>
                    <div className="text-sm font-medium text-foreground">
                      ${analysis.metrics_snapshot.rrp?.toFixed(0) ?? 'N/A'}B
                    </div>
                  </div>
                  <div className="text-center p-2">
                    <div className="text-xs text-muted-foreground">NFCI</div>
                    <div className="text-sm font-medium text-foreground">
                      {analysis.metrics_snapshot.nfci?.toFixed(2) ?? 'N/A'}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-muted/50 rounded-lg p-6 border border-dashed border-border">
              <p className="text-sm text-muted-foreground text-center">
                点击「生成分析」按钮,AI 将分析当前流动性状况
                <br />
                <span className="text-xs">分析包含当前状态、变化趋势、驱动因素、压力信号、前瞻展望和投资含义</span>
              </p>
            </div>
          )}
        </section>

        {/* Data Sources */}
        <section className="text-center py-4">
          <p className="text-xs text-muted-foreground">
            数据来源:{' '}
            <a href="https://fred.stlouisfed.org/" target="_blank" rel="noopener noreferrer" className="text-emerald-500 hover:underline">
              FRED (美联储经济数据库)
            </a>
            {' '}| 图表由{' '}
            <a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer" className="text-emerald-500 hover:underline">
              TradingView
            </a>
            {' '}提供
          </p>
        </section>
      </div>
    </main>
  );
}
