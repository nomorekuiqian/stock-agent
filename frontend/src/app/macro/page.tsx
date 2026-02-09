'use client';

import type { ReactNode } from 'react';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import {
  api,
  WeeklyMacroReport,
  SectionAnalysis,
  SignalLights,
  LiquidityMetrics,
  EconomicFundamentals,
  CpiComponent,
} from '@/lib/api';


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



function formatBillions(value: number | null | undefined): string {
  if (value == null) return '--';
  const abs = Math.abs(value);
  if (abs >= 1e3) return `$${(value / 1e3).toFixed(2)}T`;
  return `$${value.toFixed(0)}B`;
}

function inflationColor(yoy: number | null | undefined): string {
  if (yoy == null) return 'text-foreground';
  if (yoy <= 2.5) return 'text-emerald-500';
  if (yoy <= 3.5) return 'text-amber-400';
  return 'text-red-500';
}

function buildInflationItems(cpi: CpiComponent[]) {
  const headline = cpi.find(c => c.series_id === 'CPIAUCSL');
  const yoy = headline?.yoy_pct;
  const corePce = cpi.find(c => c.series_id === 'PCEPILFE');
  const items: { name: string; display: string; colorClass?: string }[] = [
    { name: 'CPI 同比', display: yoy != null ? `${yoy.toFixed(1)}%` : '--', colorClass: inflationColor(yoy) },
  ];
  if (corePce?.yoy_pct != null) {
    items.push({ name: '核心 PCE', display: `${corePce.yoy_pct.toFixed(1)}%` });
  }
  return items;
}

function buildLiquidityItems(data: LiquidityMetrics | null): { name: string; display: string; colorClass?: string }[] {
  if (!data?.net_liquidity || data.net_liquidity.value == null) return [];
  return [{ name: '净流动性', display: formatBillions(data.net_liquidity.value) }];
}

function buildEconomyItems(data: EconomicFundamentals | null): { name: string; display: string; colorClass?: string }[] {
  if (!data?.sub_dimensions) return [];
  const items: { name: string; display: string; colorClass?: string }[] = [];
  for (const sub of data.sub_dimensions) {
    if (items.length >= 2) break;
    if (sub.indicators.length > 0) {
      const ind = sub.indicators[0];
      const display = ind.value != null
        ? ind.units.toLowerCase().includes('percent') ? `${ind.value.toFixed(1)}%` : ind.value.toFixed(2)
        : '--';
      items.push({ name: ind.name, display });
    }
  }
  return items;
}

function cnnScoreColor(score: number | null): string {
  if (score == null) return 'text-foreground';
  if (score >= 60) return 'text-emerald-500';
  if (score >= 40) return 'text-amber-400';
  return 'text-red-500';
}

function cnnScoreLabel(score: number | null): string {
  if (score == null) return '';
  if (score >= 75) return ' 极度贪婪';
  if (score >= 60) return ' 贪婪';
  if (score >= 40) return ' 中性';
  if (score >= 25) return ' 恐慌';
  return ' 极度恐慌';
}

function vixColor(vix: number | null): string {
  if (vix == null) return 'text-foreground';
  if (vix >= 30) return 'text-red-500';
  if (vix >= 20) return 'text-amber-400';
  return 'text-emerald-500';
}

function buildSentimentItems(data: EconomicFundamentals) {
  const cnnDim = data.sub_dimensions.find(d => d.name === 'cnn_indicators');
  const cnnScore = cnnDim ? Math.round(cnnDim.score * 10) : null;

  const volDim = data.sub_dimensions.find(d => d.name === 'volatility');
  const vix = volDim?.indicators.find(i => i.series_id === 'VIX')?.value ?? null;

  return [
    { name: '恐慌贪婪指数', display: cnnScore != null ? `${cnnScore}${cnnScoreLabel(cnnScore)}` : '--', colorClass: cnnScoreColor(cnnScore) },
    { name: 'VIX 恐慌指数', display: vix != null ? vix.toFixed(1) : '--', colorClass: vixColor(vix) },
  ];
}

function extractStatusSummary(analysis: SectionAnalysis | null): string | null {
  if (!analysis?.data_changes) return null;
  const idx = analysis.data_changes.indexOf('\u3002'); // Chinese period
  if (idx === -1) return null;
  return analysis.data_changes.substring(0, idx + 1);
}


const MACRO_MD_COMPONENTS = {
  p: ({ children }: { children?: ReactNode }) => (
    <p className="text-foreground/90 leading-relaxed mb-3 last:mb-0">
      {children}
    </p>
  ),
  strong: ({ children }: { children?: ReactNode }) => (
    <strong className="font-semibold text-foreground">
      {children}
    </strong>
  ),
  ul: ({ children }: { children?: ReactNode }) => (
    <ul className="pl-4 space-y-1.5 my-2 border-l-2 border-border/30">
      {children}
    </ul>
  ),
  ol: ({ children }: { children?: ReactNode }) => (
    <ol className="list-decimal pl-5 space-y-1.5 my-2">
      {children}
    </ol>
  ),
  li: ({ children }: { children?: ReactNode }) => (
    <li className="text-foreground/80 leading-relaxed pl-1">
      {children}
    </li>
  ),
  code: ({ children }: { children?: ReactNode }) => (
    <code className="font-data text-emerald-400 bg-emerald-500/10 px-1 py-0.5 rounded text-sm">
      {children}
    </code>
  ),
};

function MacroMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown components={MACRO_MD_COMPONENTS}>
      {content}
    </ReactMarkdown>
  );
}


function DimensionCard({
  config,
  dataItems,
  analysis,
  signalColor,
  loading,
}: {
  config: DimensionConfig;
  dataItems: { name: string; display: string; colorClass?: string }[] | null;
  analysis: SectionAnalysis | null;
  signalColor: string | null;
  loading: boolean;
}) {
  const signalDot = signalColor ? SIGNAL_COLORS[signalColor] : 'bg-muted';
  const signalLabel = signalColor ? SIGNAL_LABELS[signalColor] : '';
  const signalTextColor = signalColor ? SIGNAL_TEXT_COLORS[signalColor] : '';
  const statusSummary = analysis ? extractStatusSummary(analysis) : null;

  return (
    <Link href={config.href} className="group block h-full">
      <div className="relative h-full flex flex-col rounded-xl bg-card/60 border border-border/40 p-5 cursor-pointer hover:border-emerald-500/30 hover:bg-card transition-all duration-500">
        <div className="flex items-start justify-between mb-1">
          <span className="text-2xl font-data font-bold leading-none text-emerald-500/70 tracking-tighter select-none group-hover:text-emerald-500 transition-colors duration-500">
            {config.number}
          </span>
          {signalColor && (
            <div className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${signalDot}`} />
              <span className={`text-xs font-medium ${signalTextColor}`}>{signalLabel}</span>
            </div>
          )}
        </div>
        <h3 className="font-editorial text-lg text-foreground mb-0.5 group-hover:text-emerald-400 transition-colors duration-300">
          {config.nameZh}
        </h3>
        <p className="font-editorial text-sm text-emerald-500/70 italic mb-4">
          {config.question}
        </p>

        {loading ? (
          <div className="space-y-2 mb-4">
            <div className="h-5 w-28 bg-muted/50 rounded animate-pulse" />
            <div className="h-5 w-24 bg-muted/50 rounded animate-pulse" />
          </div>
        ) : dataItems && dataItems.length > 0 ? (
          <div className="space-y-1.5 mb-4">
            {dataItems.map((item) => (
              <div key={item.name} className="flex items-baseline justify-between">
                <span className="text-xs text-muted-foreground truncate mr-3">{item.name}</span>
                <span className={`font-data text-sm font-semibold shrink-0 ${item.colorClass || 'text-foreground'}`}>
                  {item.display}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        {analysis && (statusSummary || analysis.market_implication) ? (
          <div className="pt-3 border-t border-border/30 mb-4 space-y-3 flex-1">
            {statusSummary && (
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground tracking-wide mb-1.5">
                  现状评估
                </p>
                <p className="text-sm text-foreground leading-relaxed line-clamp-3">
                  {statusSummary}
                </p>
              </div>
            )}
            {analysis.market_implication && (
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground tracking-wide mb-1.5">
                  未来展望
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
                  {analysis.market_implication}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1" />
        )}

        <div className="pt-3 border-t border-border/30 flex items-center justify-end mt-auto">
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-500 group-hover:text-emerald-400 transition-colors duration-300">
            查看详细分析
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



export default function MacroPage() {
  const isDev = process.env.NODE_ENV === 'development';

  const [report, setReport] = useState<WeeklyMacroReport | null>(null);
  const [reportLoading, setReportLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const [liquidityData, setLiquidityData] = useState<LiquidityMetrics | null>(null);
  const [economyData, setEconomyData] = useState<EconomicFundamentals | null>(null);
  const [inflationData, setInflationData] = useState<EconomicFundamentals | null>(null);
  const [sentimentData, setSentimentData] = useState<EconomicFundamentals | null>(null);
  const [cpiData, setCpiData] = useState<CpiComponent[]>([]);
  const [cardsLoading, setCardsLoading] = useState(true);

  async function handleGenerate() {
    setGenerating(true);
    setGenerateError(null);
    try {
      const res = await api.weeklyReport.generate(true);
      if (res.success && res.data) {
        setReport(res.data);
      }
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Failed to generate weekly report');
    } finally {
      setGenerating(false);
    }
  }

  useEffect(() => {
    Promise.allSettled([
      api.getLiquidityMetrics(),
      api.getEconomicFundamentals(),
      api.getInflationRates(),
      api.getMarketSentiment(),
      api.getCpiBreakdown(),
    ]).then(([liq, eco, inf, sen, cpi]) => {
      if (liq.status === 'fulfilled' && liq.value.success !== false) setLiquidityData(liq.value.metrics);
      if (eco.status === 'fulfilled' && eco.value.success !== false) setEconomyData(eco.value.data);
      if (inf.status === 'fulfilled' && inf.value.success !== false) setInflationData(inf.value.data);
      if (sen.status === 'fulfilled' && sen.value.success !== false) setSentimentData(sen.value.data);
      if (cpi.status === 'fulfilled' && cpi.value.success !== false) setCpiData(cpi.value.components ?? []);
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
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="font-editorial text-3xl md:text-4xl lg:text-5xl text-foreground tracking-tight leading-[1.1] mb-3">
                宏观环境
              </h1>
              <p className="text-muted-foreground text-base md:text-lg max-w-lg leading-relaxed">
                30 秒看懂宏观，5 分钟做出判断
              </p>
            </div>
            {isDev && (
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="mt-1 px-5 py-2.5 bg-emerald-600 text-white rounded-lg font-medium text-sm transition-all hover:bg-emerald-500 hover:shadow-lg hover:shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none flex items-center gap-2 shrink-0"
              >
                {generating ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span>生成中...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <span>生成周报</span>
                  </>
                )}
              </button>
            )}
          </div>
          {generateError && (
            <p className="mt-2 text-sm text-red-500">{generateError}</p>
          )}
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-4 md:px-6 pb-8 space-y-8">
        {/* ── Intro ── */}
        <section className="max-w-2xl">
          <p className="text-sm text-muted-foreground leading-relaxed">
            宏观环境是投资决策的「水温」。在决定仓位和方向之前，你需要知道市场上的钱多不多、经济是否健康、通胀和利率往哪走、以及市场参与者的情绪状态。这四个维度共同决定了风险资产的大方向。
          </p>
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
            <div className="space-y-10">
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

              {/* ── SECTION 1: 本周市场速览 ── */}
              <div className="space-y-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-1 h-5 bg-emerald-500 rounded-full" />
                  <h4 className="text-sm font-semibold text-foreground uppercase tracking-wider">本周市场速览</h4>
                </div>

                <div className="flex flex-wrap gap-3">
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

                <div className="rounded-2xl bg-card/60 border border-border/40 p-5">
                  <p className="text-foreground/90 leading-relaxed">{report.market_recap}</p>
                </div>
              </div>

              {/* ── SECTION 2: 宏观深度解读 ── */}
              <div className="space-y-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-1 h-5 bg-emerald-500 rounded-full" />
                  <h4 className="text-sm font-semibold text-foreground uppercase tracking-wider">宏观深度解读</h4>
                </div>

                <div className="rounded-2xl bg-card/60 border border-border/40 p-5 md:p-6">
                  <MacroMarkdown content={report.executive_summary} />
                </div>

                {/* Four Dimension Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <DimensionCard
                    config={DIMENSIONS[0]}
                    dataItems={buildLiquidityItems(liquidityData)}
                    analysis={report.liquidity_analysis}
                    signalColor={report.signal_lights.liquidity}
                    loading={cardsLoading}
                  />
                  <DimensionCard
                    config={DIMENSIONS[1]}
                    dataItems={buildEconomyItems(economyData)}
                    analysis={report.economy_analysis}
                    signalColor={report.signal_lights.economy}
                    loading={cardsLoading}
                  />
                  <DimensionCard
                    config={DIMENSIONS[2]}
                    dataItems={cpiData.length > 0 ? buildInflationItems(cpiData) : buildEconomyItems(inflationData)}
                    analysis={report.inflation_analysis}
                    signalColor={report.signal_lights.inflation}
                    loading={cardsLoading}
                  />
                  <DimensionCard
                    config={DIMENSIONS[3]}
                    dataItems={sentimentData ? buildSentimentItems(sentimentData) : null}
                    analysis={report.sentiment_analysis}
                    signalColor={report.signal_lights.sentiment}
                    loading={cardsLoading}
                  />
                </div>
              </div>

              {/* ── SECTION 3: 宏观策略展望 ── */}
              <div className="space-y-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-1 h-5 bg-emerald-500 rounded-full" />
                  <h4 className="text-sm font-semibold text-foreground uppercase tracking-wider">宏观策略展望</h4>
                </div>
                <div className="rounded-2xl bg-gradient-to-br from-emerald-500/[0.05] via-card to-card border border-emerald-500/20 p-5 md:p-6">
                  <MacroMarkdown content={report.investment_implications} />
                </div>
              </div>

              {/* ── SECTION 4: 下周关注 ── */}
              {report.week_ahead && report.week_ahead.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-1 h-5 bg-emerald-500 rounded-full" />
                    <h4 className="text-sm font-semibold text-foreground uppercase tracking-wider">下周关注</h4>
                  </div>
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
