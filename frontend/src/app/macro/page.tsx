'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  api,
  WeeklyMacroReport,
  SectionAnalysis,
  SignalLights,
  LiquidityMetrics,
  EconomicFundamentals,
} from '@/lib/api';

// ============================================================================
// Types & Constants
// ============================================================================

interface DimensionConfig {
  id: string;
  number: string;
  nameZh: string;
  question: string;
  detail: string;
  href: string;
}

const DIMENSIONS: DimensionConfig[] = [
  {
    id: 'liquidity',
    number: '01',
    nameZh: '流动性环境',
    question: '市场上的钱是多了还是少了?',
    detail: 'WALCL / TGA / RRP / NFCI',
    href: '/macro/liquidity',
  },
  {
    id: 'economy',
    number: '02',
    nameZh: '经济基本面',
    question: '经济是在变好还是变差?',
    detail: 'GDP / Unemployment / Yield Curve',
    href: '/macro/economy',
  },
  {
    id: 'inflation',
    number: '03',
    nameZh: '通胀与利率',
    question: '物价压力如何? 美联储会怎么做?',
    detail: 'CPI / PCE / Fed Funds / Treasury',
    href: '/macro/inflation-rates',
  },
  {
    id: 'sentiment',
    number: '04',
    nameZh: '市场情绪',
    question: '市场参与者现在是贪婪还是恐惧?',
    detail: 'VIX / Put-Call / Breadth / Spreads',
    href: '/macro/sentiment',
  },
];

const SIGNAL_LABELS: Record<string, string> = {
  green: '利好',
  yellow: '中性',
  red: '利空',
};

const SIGNAL_COLORS: Record<string, string> = {
  green: 'bg-emerald-500',
  yellow: 'bg-amber-400',
  red: 'bg-rose-500',
};

const SIGNAL_TEXT_COLORS: Record<string, string> = {
  green: 'text-emerald-500',
  yellow: 'text-amber-400',
  red: 'text-rose-500',
};

const ANALYSIS_SECTIONS: {
  key: 'liquidity_analysis' | 'economy_analysis' | 'inflation_analysis' | 'sentiment_analysis';
  title: string;
  signalKey: keyof SignalLights;
}[] = [
  { key: 'liquidity_analysis', title: '流动性环境', signalKey: 'liquidity' },
  { key: 'economy_analysis', title: '经济基本面', signalKey: 'economy' },
  { key: 'inflation_analysis', title: '通胀与利率', signalKey: 'inflation' },
  { key: 'sentiment_analysis', title: '市场情绪', signalKey: 'sentiment' },
];

// ============================================================================
// Helpers
// ============================================================================

function formatBillions(value: number | null | undefined): string {
  if (value == null) return '--';
  const abs = Math.abs(value);
  if (abs >= 1e3) return `$${(value / 1e3).toFixed(2)}T`;
  return `$${value.toFixed(0)}B`;
}

// ============================================================================
// Sub-Components
// ============================================================================

function CardSkeleton() {
  return (
    <div className="h-full rounded-xl bg-card/60 border border-border/40 p-4 animate-pulse">
      <div className="flex items-start justify-between mb-5">
        <div className="h-8 w-10 bg-muted rounded" />
        <div className="h-5 w-16 bg-muted rounded-full" />
      </div>
      <div className="h-6 w-32 bg-muted rounded mb-2" />
      <div className="h-4 w-48 bg-muted rounded mb-4" />
      <div className="space-y-2 mb-5">
        <div className="h-4 w-full bg-muted rounded" />
        <div className="h-4 w-3/4 bg-muted rounded" />
      </div>
      <div className="h-4 w-24 bg-muted rounded" />
    </div>
  );
}

function LiquidityCard({ config, data }: { config: DimensionConfig; data: LiquidityMetrics | null }) {
  const netLiq = data?.net_liquidity;

  return (
    <Link href={config.href} className="group block h-full">
      <div className="relative h-full rounded-xl bg-card/60 border border-border/40 p-4 cursor-pointer hover:border-emerald-500/30 hover:bg-card transition-all duration-500 flex flex-col">
        <div className="mb-3">
          <span className="text-2xl font-data font-bold leading-none text-emerald-500/30 tracking-tighter select-none group-hover:text-emerald-500/50 transition-colors duration-500">
            {config.number}
          </span>
        </div>

        <h3 className="font-editorial text-lg text-foreground mb-1 group-hover:text-emerald-400 transition-colors duration-300">
          {config.nameZh}
        </h3>
        <p className="font-editorial text-sm text-emerald-500 italic mb-3">
          {config.question}
        </p>

        <div className="mb-auto">
          {data ? (
            netLiq && netLiq.value != null ? (
              <div>
                <span className="font-data text-xl font-semibold text-foreground tracking-tight">
                  {formatBillions(netLiq.value)}
                </span>
                <p className="text-xs text-muted-foreground mt-0.5">净流动性</p>
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">数据暂不可用</span>
            )
          ) : (
            <div className="h-6 w-28 bg-muted/50 rounded animate-pulse" />
          )}
        </div>

        <div className="mt-4 pt-3 border-t border-border/30 flex items-center justify-end">
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-500 group-hover:text-emerald-400 transition-colors duration-300">
            查看实时数据
            <svg className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </span>
        </div>
      </div>
    </Link>
  );
}

function FundamentalsCard({ config, data }: { config: DimensionConfig; data: EconomicFundamentals | null }) {
  // Pick top 2 indicators from first 2 sub-dimensions
  const topIndicators: { name: string; value: number | null; units: string }[] = [];
  if (data?.sub_dimensions) {
    for (const sub of data.sub_dimensions) {
      if (topIndicators.length >= 2) break;
      if (sub.indicators && sub.indicators.length > 0) {
        const ind = sub.indicators[0];
        topIndicators.push({ name: ind.name, value: ind.value, units: ind.units });
      }
    }
  }

  return (
    <Link href={config.href} className="group block h-full">
      <div className="relative h-full rounded-xl bg-card/60 border border-border/40 p-4 cursor-pointer hover:border-emerald-500/30 hover:bg-card transition-all duration-500 flex flex-col">
        <div className="mb-3">
          <span className="text-2xl font-data font-bold leading-none text-emerald-500/30 tracking-tighter select-none group-hover:text-emerald-500/50 transition-colors duration-500">
            {config.number}
          </span>
        </div>

        <h3 className="font-editorial text-lg text-foreground mb-1 group-hover:text-emerald-400 transition-colors duration-300">
          {config.nameZh}
        </h3>
        <p className="font-editorial text-sm text-emerald-500 italic mb-3">
          {config.question}
        </p>

        <div className="mb-auto">
          {data ? (
            <div className="space-y-2">
              {topIndicators.map((ind) => (
                <div key={ind.name} className="flex items-baseline justify-between">
                  <span className="text-xs text-muted-foreground truncate mr-3">{ind.name}</span>
                  <span className="font-data text-base font-semibold text-foreground shrink-0">
                    {ind.value != null
                      ? ind.units.toLowerCase().includes('percent')
                        ? `${ind.value.toFixed(1)}%`
                        : ind.value.toFixed(2)
                      : '--'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="h-5 w-28 bg-muted/50 rounded animate-pulse" />
              <div className="h-5 w-24 bg-muted/50 rounded animate-pulse" />
            </div>
          )}
        </div>

        <div className="mt-4 pt-3 border-t border-border/30 flex items-center justify-end">
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-500 group-hover:text-emerald-400 transition-colors duration-300">
            查看实时数据
            <svg className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </span>
        </div>
      </div>
    </Link>
  );
}

function ReportSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="h-6 w-48 bg-muted rounded" />
      <div className="space-y-3">
        <div className="h-4 w-full bg-muted rounded" />
        <div className="h-4 w-5/6 bg-muted rounded" />
        <div className="h-4 w-4/6 bg-muted rounded" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-2xl bg-card/60 border border-border/40 p-6 space-y-3">
            <div className="h-5 w-24 bg-muted rounded" />
            <div className="h-4 w-full bg-muted rounded" />
            <div className="h-4 w-3/4 bg-muted rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

function AnalysisCard({ title, analysis, signal }: { title: string; analysis: SectionAnalysis; signal?: string }) {
  return (
    <div className="rounded-2xl bg-card/60 border border-border/40 p-5 md:p-6">
      <div className="flex items-center gap-2 mb-4">
        {signal && (
          <div className={`w-2 h-2 rounded-full shrink-0 ${SIGNAL_COLORS[signal] || 'bg-muted'}`} />
        )}
        <h4 className="font-editorial text-lg text-foreground">{title}</h4>
      </div>
      <div className="mb-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">数据变化</p>
        <p className="text-sm text-foreground/90 leading-relaxed">{analysis.data_changes}</p>
      </div>
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">对股市含义</p>
        <p className="text-sm text-foreground/90 leading-relaxed">{analysis.market_implication}</p>
      </div>
    </div>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function MacroPage() {
  const [report, setReport] = useState<WeeklyMacroReport | null>(null);
  const [reportLoading, setReportLoading] = useState(true);

  const [liquidityData, setLiquidityData] = useState<LiquidityMetrics | null>(null);
  const [economyData, setEconomyData] = useState<EconomicFundamentals | null>(null);
  const [inflationData, setInflationData] = useState<EconomicFundamentals | null>(null);
  const [sentimentData, setSentimentData] = useState<EconomicFundamentals | null>(null);
  const [cardsLoading, setCardsLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([
      api.getLiquidityMetrics(),
      api.getEconomicFundamentals(),
      api.getInflationRates(),
      api.getMarketSentiment(),
    ]).then(([liq, eco, inf, sen]) => {
      if (liq.status === 'fulfilled' && liq.value.success !== false) setLiquidityData(liq.value.metrics);
      if (eco.status === 'fulfilled' && eco.value.success !== false) setEconomyData(eco.value.data);
      if (inf.status === 'fulfilled' && inf.value.success !== false) setInflationData(inf.value.data);
      if (sen.status === 'fulfilled' && sen.value.success !== false) setSentimentData(sen.value.data);
      setCardsLoading(false);
    });

    api.weeklyReport
      .getLatest()
      .then((res) => {
        if (res.success) setReport(res.data);
      })
      .catch(() => {})
      .finally(() => setReportLoading(false));
  }, []);

  return (
    <main className="min-h-screen bg-background">
      {/* ── Header ── */}
      <section className="relative">
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/[0.02] to-transparent pointer-events-none" />
        <div className="relative max-w-6xl mx-auto px-4 md:px-6 pt-12 pb-6 md:pt-16 md:pb-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-primary to-transparent" />
            <span className="text-primary text-xs font-medium tracking-[0.2em] uppercase">MACRO</span>
          </div>
          <h1 className="font-editorial text-3xl md:text-4xl lg:text-5xl text-foreground tracking-tight leading-[1.1] mb-3">
            宏观环境
          </h1>
          <p className="text-muted-foreground text-base md:text-lg max-w-lg leading-relaxed">
            30 秒看懂宏观，5 分钟做出判断
          </p>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-4 md:px-6 pb-8 space-y-8">
        {/* ── Intro ── */}
        <section className="max-w-2xl">
          <p className="text-sm text-muted-foreground leading-relaxed">
            宏观环境是投资决策的「水温」。在决定仓位和方向之前，你需要知道市场上的钱多不多、经济是否健康、通胀和利率往哪走、以及市场参与者的情绪状态。这四个维度共同决定了风险资产的大方向。
          </p>
        </section>

        {/* ── Four Dimension Cards ── */}
        <section>
          <h2 className="text-xs font-medium text-muted-foreground tracking-[0.2em] uppercase mb-4">
            四大板块
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {cardsLoading ? (
              <>
                <CardSkeleton />
                <CardSkeleton />
                <CardSkeleton />
                <CardSkeleton />
              </>
            ) : (
              <>
                <LiquidityCard config={DIMENSIONS[0]} data={liquidityData} />
                <FundamentalsCard config={DIMENSIONS[1]} data={economyData} />
                <FundamentalsCard config={DIMENSIONS[2]} data={inflationData} />
                <FundamentalsCard config={DIMENSIONS[3]} data={sentimentData} />
              </>
            )}
          </div>
        </section>

        {/* ── Weekly Report ── */}
        <section>
          <div className="flex items-center gap-3 mb-8">
            <div className="h-px flex-1 max-w-[40px] bg-gradient-to-r from-primary to-transparent" />
            <span className="text-primary text-xs font-medium tracking-[0.2em] uppercase">本周宏观周报</span>
            <div className="h-px flex-1 max-w-[40px] bg-gradient-to-l from-primary to-transparent" />
          </div>

          {reportLoading ? (
            <ReportSkeleton />
          ) : !report ? (
            <div className="rounded-2xl bg-card/60 border border-border/40 p-8 text-center">
              <p className="text-muted-foreground">暂无周报数据</p>
            </div>
          ) : (
            <div className="space-y-8">
              {/* Report header */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <h3 className="font-editorial text-2xl md:text-3xl text-foreground">
                  宏观周报
                </h3>
                <div className="flex items-center gap-3">
                  <span className="font-data text-sm text-emerald-500 tracking-wider">
                    {report.week_label}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(report.generated_at).toLocaleDateString('zh-CN')}
                  </span>
                </div>
              </div>

              {/* Signal Lights Bar */}
              <div className="flex flex-wrap gap-3 md:gap-4">
                {(Object.entries(report.signal_lights) as [keyof SignalLights, string][]).map(([key, color]) => {
                  const nameMap: Record<string, string> = {
                    liquidity: '流动性',
                    economy: '经济',
                    inflation: '通胀',
                    sentiment: '情绪',
                  };
                  return (
                    <div key={key} className="flex items-center gap-2 rounded-full bg-card/80 border border-border/40 px-4 py-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${SIGNAL_COLORS[color] || 'bg-muted'}`} />
                      <span className="text-sm text-foreground">{nameMap[key]}</span>
                      <span className={`text-xs font-medium ${SIGNAL_TEXT_COLORS[color] || 'text-muted-foreground'}`}>
                        {SIGNAL_LABELS[color] || color}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Executive Summary */}
              <div className="rounded-2xl bg-card/60 border border-border/40 p-5 md:p-6">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                  本周定调
                </h4>
                <p className="text-foreground leading-relaxed whitespace-pre-line">
                  {report.executive_summary}
                </p>
              </div>

              {/* Market Recap */}
              <div className="rounded-2xl bg-card/60 border border-border/40 p-5 md:p-6">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                  市场回顾
                </h4>
                <p className="text-foreground/90 leading-relaxed">{report.market_recap}</p>
              </div>

              {/* Four Analysis Sections */}
              <div>
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">
                  四大板块分析
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {ANALYSIS_SECTIONS.map(({ key, title, signalKey }) => (
                    <AnalysisCard
                      key={key}
                      title={title}
                      analysis={report[key] as SectionAnalysis}
                      signal={report.signal_lights[signalKey]}
                    />
                  ))}
                </div>
              </div>

              {/* Investment Implications */}
              <div className="rounded-2xl bg-gradient-to-br from-emerald-500/[0.05] via-card to-card border border-emerald-500/20 p-5 md:p-6">
                <h4 className="text-xs font-medium text-emerald-500 uppercase tracking-wider mb-3">
                  对股市的启示
                </h4>
                <p className="text-foreground leading-relaxed whitespace-pre-line">
                  {report.investment_implications}
                </p>
              </div>

              {/* Week Ahead Table */}
              {report.week_ahead && report.week_ahead.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">
                    下周关注
                  </h4>
                  <div className="rounded-2xl bg-card/60 border border-border/40 overflow-hidden">
                    <div className="hidden md:grid grid-cols-[100px_1fr_1fr_1fr] gap-4 px-5 py-3 border-b border-border/40 bg-muted/30">
                      <span className="font-data text-xs text-muted-foreground uppercase tracking-wider">日期</span>
                      <span className="font-data text-xs text-muted-foreground uppercase tracking-wider">事件</span>
                      <span className="font-data text-xs text-muted-foreground uppercase tracking-wider">高于预期</span>
                      <span className="font-data text-xs text-muted-foreground uppercase tracking-wider">低于预期</span>
                    </div>
                    {report.week_ahead.map((event, i) => (
                      <div key={i} className={`px-5 py-4 ${i < report.week_ahead.length - 1 ? 'border-b border-border/30' : ''}`}>
                        <div className="hidden md:grid grid-cols-[100px_1fr_1fr_1fr] gap-4 items-start">
                          <span className="font-data text-sm text-emerald-500">{event.date}</span>
                          <span className="text-sm text-foreground font-medium">{event.event}</span>
                          <span className="text-sm text-muted-foreground">{event.if_above}</span>
                          <span className="text-sm text-muted-foreground">{event.if_below}</span>
                        </div>
                        <div className="md:hidden space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="font-data text-sm text-emerald-500">{event.date}</span>
                            <span className="text-sm text-foreground font-medium">{event.event}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                            <div>
                              <span className="text-emerald-500/70 mr-1">高于预期:</span>
                              {event.if_above}
                            </div>
                            <div>
                              <span className="text-rose-500/70 mr-1">低于预期:</span>
                              {event.if_below}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
