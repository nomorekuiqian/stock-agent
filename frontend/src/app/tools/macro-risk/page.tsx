'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { TradingViewWidget } from '@/components/TradingViewWidget';
import { LiquidityCard } from '@/components/LiquidityCard';
import { RiskGauge } from '@/components/RiskGauge';
import {
  api,
  MacroRiskDashboardResponse,
  AIStockInfo,
} from '@/lib/api';
import { formatTimestamp } from '@/lib/timezone';

// FRED symbols for TradingView charts
const FRED_SYMBOLS = {
  yieldCurve: 'FRED:T10Y2Y',
  recessionProb: 'FRED:RECPROUSM156N',
  cfnai: 'FRED:CFNAI',
  sentiment: 'FRED:UMCSENT',
  hyOas: 'FRED:BAMLH0A0HYM2',
  bbbSpread: 'FRED:BAMLC0A4CBBB',
  creDelinquency: 'FRED:DRCRELEXFACBS',
  bizDelinquency: 'FRED:DRBLACBS',
  unemployment: 'FRED:UNRATE',
  initialClaims: 'FRED:ICSA',
  sahmRule: 'FRED:SAHMREALTIME',
  nonfarmPayrolls: 'FRED:PAYEMS',
};

// Indicator descriptions
const INDICATOR_INFO: Record<string, { title: string; description: string }> = {
  yieldCurve: {
    title: '10Y-2Y 收益率曲线 (T10Y2Y)',
    description: '10年期减2年期国债收益率利差。倒挂（负值）自1970年以来预测了每一次美国经济衰退。当短期利率超过长期利率时，意味着债券市场预期经济将走弱。曲线通常在衰退实际开始前恢复正常。',
  },
  recessionProb: {
    title: '平滑衰退概率 (RECPROUSM156N)',
    description: 'Piger & Chauvet 基于非农就业、工业产出、实际收入和实际销售的平滑衰退概率模型。历史上超过30%的读数与 NBER 认定的衰退期吻合。属于滞后但高度准确的指标。',
  },
  cfnai: {
    title: '芝加哥联储国家活动指数 (CFNAI)',
    description: '85项月度经济指标的加权平均。在经济扩张期后低于-0.70表明衰退可能性上升。正值表示经济增长高于趋势水平。',
  },
  sentiment: {
    title: '消费者信心指数 (UMCSENT)',
    description: '密歇根大学消费者信心指数，追踪消费者对个人财务和商业环境的预期。信心大幅下降通常预示消费支出减少。历史上低于60的读数与衰退期吻合。',
  },
  hyOas: {
    title: '美国高收益债利差 (BAMLH0A0HYM2)',
    description: '美国高收益企业债相对国债的期权调整利差，衡量投资者要求的信用风险溢价。利差超过500bps表明显著压力；超过800bps为危机级别。这是最敏感的实时压力指标之一。',
  },
  bbbSpread: {
    title: 'BBB 公司债利差 (BAMLC0A4CBBB)',
    description: 'BBB评级公司债相对国债利差。BBB是最低投资级评级——利差扩大意味着潜在的降级风险，以及企业部门融资条件收紧。',
  },
  creDelinquency: {
    title: '商业地产贷款违约率 (DRCRELEXFACBS)',
    description: '所有商业银行商业地产贷款违约率。商业地产违约率上升可能预示更广泛的银行体系压力，因为商业地产贷款在区域性银行资产负债表中占相当大比例。',
  },
  bizDelinquency: {
    title: '商业贷款违约率 (DRBLACBS)',
    description: '工商业贷款违约率。违约率上升表明企业偿债困难，通常因收入下降或信贷条件收紧所致。',
  },
  unemployment: {
    title: '失业率 (UNRATE)',
    description: '美国失业率。历史上，失业率从周期低点持续上升0.5个百分点以上是可靠的衰退信号（这本质上就是Sahm规则所衡量的）。周期低点的背景比绝对水平更重要。',
  },
  initialClaims: {
    title: '初请失业金人数 (ICSA)',
    description: '每周新增失业保险申请人数，是最及时的劳动力市场指标。持续突破25万通常表明劳动力市场恶化。初请失业金飙升通常领先失业率上升2-4个月。',
  },
  sahmRule: {
    title: 'Sahm 规则指标 (SAHMREALTIME)',
    description: '当失业率3个月移动平均值比过去12个月的低点上升0.50个百分点时触发。自1970年以来准确识别了每一次衰退，无误报。超过0.50表示经济衰退。',
  },
  nonfarmPayrolls: {
    title: '非农就业 (PAYEMS)',
    description: '非农就业总人数，最受关注的月度就业指标。环比负增长通常只在衰退期出现。趋势比单月数据更重要——持续减速趋近于零是警告信号。',
  },
};

const CATEGORY_NAMES_ZH: Record<string, string> = {
  'Economic Deterioration': '经济恶化指标',
  'Credit / Default Risk': '信用/违约风险',
  'Employment': '就业市场',
  'AI Company Health': 'AI 公司健康度',
};

const CATEGORY_DESC_ZH: Record<string, string> = {
  'Economic Deterioration': '衰退概率、收益率曲线、芝加哥联储活动指数和消费者信心信号。',
  'Credit / Default Risk': '高收益债和投资级债利差，商业地产和商业贷款违约率。',
  'Employment': '失业率、每周初请失业金、Sahm规则衰退指标和非农就业。',
  'AI Company Health': '10只核心AI股票的实时表现: NVDA, MSFT, GOOGL, META, AMD, AVGO, TSM, SMCI, ARM, PLTR。',
};

// Indicator description component (same pattern as liquidity page)
function IndicatorDescription({ title, description }: { title: string; description: string }) {
  return (
    <div className="bg-muted/30 rounded-lg p-3 mb-3 min-h-[120px]">
      <h4 className="text-sm font-medium text-foreground mb-1">{title}</h4>
      <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}

function formatRiskValue(value: number | null | undefined, units: string): string {
  if (value === null || value === undefined) return 'N/A';
  if (units.toLowerCase().includes('percent')) return `${value.toFixed(2)}%`;
  if (units.toLowerCase().includes('thousand')) return `${(value / 1000).toFixed(0)}K`;
  return value.toFixed(2);
}

function getRiskLevelColor(level: string) {
  if (level === 'low') return { bg: 'bg-emerald-500/10', text: 'text-emerald-500', label: '低' };
  if (level === 'medium') return { bg: 'bg-amber-500/10', text: 'text-amber-500', label: '中' };
  return { bg: 'bg-red-500/10', text: 'text-red-500', label: '高' };
}

export default function MacroRiskPage() {
  const [timeRange, setTimeRange] = useState<'1M' | '3M' | '6M' | '1Y' | 'ALL'>('6M');
  const [theme] = useState<'light' | 'dark'>('dark');
  const [dashboard, setDashboard] = useState<MacroRiskDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.getMacroRiskDashboard();
      if (response.success) {
        setDashboard(response);
        setLastUpdated(response.timestamp);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
      console.error('Error fetching macro risk data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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

  // Extract categories
  const econCategory = dashboard?.categories?.find(c => c.category_id === 1);
  const creditCategory = dashboard?.categories?.find(c => c.category_id === 2);
  const employCategory = dashboard?.categories?.find(c => c.category_id === 3);
  const aiCategory = dashboard?.categories?.find(c => c.category_id === 4);

  return (
    <main className="min-h-screen bg-background">
      {/* Header - same pattern as liquidity page */}
      <section className="border-b border-border">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-8 md:py-10">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 dark:bg-emerald-500/20 border border-emerald-500/20 dark:border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-medium mb-3">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                宏观风险
              </div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
                宏观风险仪表盘
              </h1>
              <p className="text-muted-foreground mt-1">
                监控经济恶化、信用压力、就业市场和AI板块健康度
              </p>
              {lastUpdated && (
                <p className="text-xs text-muted-foreground mt-2">
                  更新时间: {formatTimestamp(lastUpdated)}
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
                    {range}
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
        {/* Risk Overview */}
        <section>
          <h2 className="text-sm font-medium text-muted-foreground mb-3">风险总览</h2>

          {/* Composite Risk Gauge */}
          <div className="mb-4">
            <RiskGauge value={dashboard?.composite_score ?? 0} loading={loading} />
          </div>

          {/* Category Score Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(dashboard?.categories || []).map((cat) => {
              return (
                <LiquidityCard
                  key={cat.category_id}
                  title={CATEGORY_NAMES_ZH[cat.category_name] || cat.category_name}
                  value={cat.risk_score.toFixed(1)}
                  unit="/ 10"
                  description={cat.headline}
                  loading={loading}
                  highlight={cat.risk_level === 'low'}
                />
              );
            })}
          </div>
        </section>

        {/* Section 1: Economic Deterioration */}
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">
            {CATEGORY_NAMES_ZH['Economic Deterioration']}
            {econCategory && (
              <span className={`ml-2 text-sm font-medium px-2 py-0.5 rounded-full ${getRiskLevelColor(econCategory.risk_level).bg} ${getRiskLevelColor(econCategory.risk_level).text}`}>
                {econCategory.risk_score.toFixed(1)}
              </span>
            )}
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            {CATEGORY_DESC_ZH['Economic Deterioration']}
          </p>

          {/* Indicator cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {econCategory?.indicators.map((ind) => (
              <LiquidityCard
                key={ind.series_id}
                title={ind.name}
                value={formatRiskValue(ind.value, ind.units)}
                change={ind.change ?? undefined}
                loading={loading}
              />
            ))}
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col">
              <IndicatorDescription title={INDICATOR_INFO.yieldCurve.title} description={INDICATOR_INFO.yieldCurve.description} />
              <TradingViewWidget symbol={FRED_SYMBOLS.yieldCurve} height={400} interval={getInterval()} theme={theme} />
            </div>
            <div className="flex flex-col">
              <IndicatorDescription title={INDICATOR_INFO.recessionProb.title} description={INDICATOR_INFO.recessionProb.description} />
              <TradingViewWidget symbol={FRED_SYMBOLS.recessionProb} height={400} interval={getInterval()} theme={theme} />
            </div>
            <div className="flex flex-col">
              <IndicatorDescription title={INDICATOR_INFO.cfnai.title} description={INDICATOR_INFO.cfnai.description} />
              <TradingViewWidget symbol={FRED_SYMBOLS.cfnai} height={400} interval={getInterval()} theme={theme} />
            </div>
            <div className="flex flex-col">
              <IndicatorDescription title={INDICATOR_INFO.sentiment.title} description={INDICATOR_INFO.sentiment.description} />
              <TradingViewWidget symbol={FRED_SYMBOLS.sentiment} height={400} interval={getInterval()} theme={theme} />
            </div>
          </div>
        </section>

        {/* Section 2: Credit / Default Risk */}
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">
            {CATEGORY_NAMES_ZH['Credit / Default Risk']}
            {creditCategory && (
              <span className={`ml-2 text-sm font-medium px-2 py-0.5 rounded-full ${getRiskLevelColor(creditCategory.risk_level).bg} ${getRiskLevelColor(creditCategory.risk_level).text}`}>
                {creditCategory.risk_score.toFixed(1)}
              </span>
            )}
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            {CATEGORY_DESC_ZH['Credit / Default Risk']}
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {creditCategory?.indicators.map((ind) => (
              <LiquidityCard
                key={ind.series_id}
                title={ind.name}
                value={formatRiskValue(ind.value, ind.units)}
                change={ind.change ?? undefined}
                loading={loading}
              />
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col">
              <IndicatorDescription title={INDICATOR_INFO.hyOas.title} description={INDICATOR_INFO.hyOas.description} />
              <TradingViewWidget symbol={FRED_SYMBOLS.hyOas} height={400} interval={getInterval()} theme={theme} />
            </div>
            <div className="flex flex-col">
              <IndicatorDescription title={INDICATOR_INFO.bbbSpread.title} description={INDICATOR_INFO.bbbSpread.description} />
              <TradingViewWidget symbol={FRED_SYMBOLS.bbbSpread} height={400} interval={getInterval()} theme={theme} />
            </div>
            <div className="flex flex-col">
              <IndicatorDescription title={INDICATOR_INFO.creDelinquency.title} description={INDICATOR_INFO.creDelinquency.description} />
              <TradingViewWidget symbol={FRED_SYMBOLS.creDelinquency} height={400} interval={getInterval()} theme={theme} />
            </div>
            <div className="flex flex-col">
              <IndicatorDescription title={INDICATOR_INFO.bizDelinquency.title} description={INDICATOR_INFO.bizDelinquency.description} />
              <TradingViewWidget symbol={FRED_SYMBOLS.bizDelinquency} height={400} interval={getInterval()} theme={theme} />
            </div>
          </div>
        </section>

        {/* Section 3: Employment */}
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">
            {CATEGORY_NAMES_ZH['Employment']}
            {employCategory && (
              <span className={`ml-2 text-sm font-medium px-2 py-0.5 rounded-full ${getRiskLevelColor(employCategory.risk_level).bg} ${getRiskLevelColor(employCategory.risk_level).text}`}>
                {employCategory.risk_score.toFixed(1)}
              </span>
            )}
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            {CATEGORY_DESC_ZH['Employment']}
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {employCategory?.indicators.map((ind) => (
              <LiquidityCard
                key={ind.series_id}
                title={ind.name}
                value={formatRiskValue(ind.value, ind.units)}
                change={ind.change ?? undefined}
                loading={loading}
              />
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col">
              <IndicatorDescription title={INDICATOR_INFO.sahmRule.title} description={INDICATOR_INFO.sahmRule.description} />
              <TradingViewWidget symbol={FRED_SYMBOLS.sahmRule} height={400} interval={getInterval()} theme={theme} />
            </div>
            <div className="flex flex-col">
              <IndicatorDescription title={INDICATOR_INFO.unemployment.title} description={INDICATOR_INFO.unemployment.description} />
              <TradingViewWidget symbol={FRED_SYMBOLS.unemployment} height={400} interval={getInterval()} theme={theme} />
            </div>
            <div className="flex flex-col">
              <IndicatorDescription title={INDICATOR_INFO.initialClaims.title} description={INDICATOR_INFO.initialClaims.description} />
              <TradingViewWidget symbol={FRED_SYMBOLS.initialClaims} height={400} interval={getInterval()} theme={theme} />
            </div>
            <div className="flex flex-col">
              <IndicatorDescription title={INDICATOR_INFO.nonfarmPayrolls.title} description={INDICATOR_INFO.nonfarmPayrolls.description} />
              <TradingViewWidget symbol={FRED_SYMBOLS.nonfarmPayrolls} height={400} interval={getInterval()} theme={theme} />
            </div>
          </div>
        </section>

        {/* Section 4: AI Company Health */}
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">
            {CATEGORY_NAMES_ZH['AI Company Health']}
            {aiCategory && (
              <span className={`ml-2 text-sm font-medium px-2 py-0.5 rounded-full ${getRiskLevelColor(aiCategory.risk_level).bg} ${getRiskLevelColor(aiCategory.risk_level).text}`}>
                {aiCategory.risk_score.toFixed(1)}
              </span>
            )}
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            {CATEGORY_DESC_ZH['AI Company Health']}
          </p>

          {/* AI Basket indicator cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {aiCategory?.indicators.map((ind) => (
              <LiquidityCard
                key={ind.series_id}
                title={ind.name}
                value={formatRiskValue(ind.value, ind.units)}
                loading={loading}
              />
            ))}
          </div>

          {/* AI Stock Table */}
          {dashboard?.ai_stocks && dashboard.ai_stocks.length > 0 && (
            <div className="bg-card rounded-xl border border-border overflow-hidden mb-6">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">代码</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">价格</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">日涨跌</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.ai_stocks.map((stock: AIStockInfo) => (
                      <tr key={stock.symbol} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3">
                          <span className="font-medium text-foreground">{stock.symbol}</span>
                        </td>
                        <td className="px-4 py-3 text-right font-data text-foreground">
                          {stock.price != null ? `$${stock.price.toFixed(2)}` : 'N/A'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {stock.daily_change != null ? (
                            <span className={`font-data font-medium ${stock.daily_change >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                              {stock.daily_change >= 0 ? '+' : ''}{stock.daily_change.toFixed(2)}%
                            </span>
                          ) : (
                            <span className="text-muted-foreground">N/A</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* AI ETF charts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col">
              <div className="bg-muted/30 rounded-lg p-3 mb-3 min-h-[80px]">
                <h4 className="text-sm font-medium text-foreground mb-1">NVDA (NVIDIA)</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">AI 交易的风向标。NVIDIA 以80%+的市场份额主导 AI GPU 市场，其价格走势反映了整体 AI 投资情绪。</p>
              </div>
              <TradingViewWidget symbol="NVDA" height={400} interval={getInterval()} theme={theme} />
            </div>
            <div className="flex flex-col">
              <div className="bg-muted/30 rounded-lg p-3 mb-3 min-h-[80px]">
                <h4 className="text-sm font-medium text-foreground mb-1">BOTZ (Global X 机器人与AI ETF)</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">追踪涉及AI、工业机器人和自动驾驶系统公司的板块ETF，反映AI/机器人赛道的广泛投资热度。</p>
              </div>
              <TradingViewWidget symbol="BOTZ" height={400} interval={getInterval()} theme={theme} />
            </div>
          </div>
        </section>

        {/* Section 5: Liquidity Summary */}
        <section className="bg-muted/30 rounded-xl border border-border p-4">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-medium text-foreground mb-1">流动性摘要</h3>
              <p className="text-xs text-muted-foreground">
                来自美联储资产负债表监控的关键流动性指标。
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <LiquidityCard
              title="NFCI (金融条件指数)"
              value={dashboard?.liquidity_summary?.nfci?.value?.toFixed(2) ?? 'N/A'}
              change={dashboard?.liquidity_summary?.nfci?.change ?? undefined}
              description={
                dashboard?.liquidity_summary?.nfci?.value != null
                  ? dashboard.liquidity_summary.nfci.value < 0
                    ? '负值 = 宽松条件，对风险资产有利'
                    : '正值 = 紧缩条件，风险资产可能承压'
                  : undefined
              }
              loading={loading}
            />
            <LiquidityCard
              title="净流动性 (WALCL - TGA - RRP)"
              value={
                dashboard?.liquidity_summary?.net_liquidity?.value != null
                  ? `$${dashboard.liquidity_summary.net_liquidity.value.toFixed(0)}B`
                  : 'N/A'
              }
              change={dashboard?.liquidity_summary?.net_liquidity?.change ?? undefined}
              loading={loading}
            />
          </div>

          <Link
            href="/tools/liquidity"
            className="inline-flex items-center gap-1 text-sm text-emerald-500 hover:text-emerald-400 transition-colors"
          >
            查看完整流动性看板
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </section>

        {/* Data Sources Footer */}
        <section className="text-center py-4">
          <p className="text-xs text-muted-foreground">
            数据来源:{' '}
            <a href="https://fred.stlouisfed.org/" target="_blank" rel="noopener noreferrer" className="text-emerald-500 hover:underline">
              FRED
            </a>
            {' '}|{' '}
            <a href="https://finance.yahoo.com/" target="_blank" rel="noopener noreferrer" className="text-emerald-500 hover:underline">
              yfinance
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
