'use client';

import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { MacroPageHeader } from '@/components/MacroPageHeader';
import type { SubDimension, CpiComponent } from '@/lib/api';
import { useInflationRates, useCpiBreakdown, useTreasuryCommodities } from '@/hooks/queries/use-macro-data';
import { useWeeklyReport } from '@/hooks/queries/use-weekly-report';
import { queryKeys } from '@/hooks/queries/query-keys';
import { InsightBanner } from '@/components/InsightBanner';
import { formatTimestamp } from '@/lib/timezone';
import {
  HERO_CONFIG,
  SECONDARY_FORMAT,
  SUB_DIM_NAMES,
  SPREAD_NAMES,
  SPREAD_INFO,
  findIndicator,
  getColorClass,
  getSpreadColor,
  interpretRatio,
  SectionHeader,
  SectionExplainerBanner,
  DeepDiveSection,
  CommodityPanel,
  YieldCurveChart,
} from './components';

// ---------------------------------------------------------------------------
// Page-local components
// ---------------------------------------------------------------------------

function HeroCardSkeleton({ index }: { index: number }) {
  return (
    <div className="bg-card rounded-2xl border border-border/50 p-3 sm:p-5" style={{ animationDelay: `${index * 100}ms` }}>
      <div className="animate-pulse">
        <div className="h-3 w-12 bg-muted rounded mb-3" />
        <div className="h-10 w-28 bg-muted rounded mb-2" />
        <div className="h-3 w-24 bg-muted rounded mb-3" />
        <div className="h-px bg-border my-3" />
        <div className="h-3 w-32 bg-muted rounded" />
      </div>
    </div>
  );
}

function HeroCard({
  dim, index, selected, onSelect,
}: {
  dim: SubDimension; index: number; selected: boolean; onSelect: () => void;
}) {
  const config = HERO_CONFIG[dim.name];
  if (!config) return null;

  const primaryInd = findIndicator(dim, config.primary);
  const secondaryInd = findIndicator(dim, config.secondary);
  const formatted = primaryInd ? config.format(primaryInd) : 'N/A';
  const interpretation = primaryInd ? config.interpret(primaryInd) : { color: 'amber' };
  const secConfig = SECONDARY_FORMAT[config.secondary];
  const secFormatted = secondaryInd && secConfig ? secConfig.format(secondaryInd) : null;
  const accentColor = interpretation.color;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`
        group relative rounded-2xl p-3 sm:p-5 flex flex-col text-left transition-all duration-300 ease-out cursor-pointer
        ${selected ? 'bg-card border-2 translate-y-[-3px]' : 'bg-card/60 border border-border/40 hover:bg-card hover:border-border/60 hover:translate-y-[-2px]'}
        ${selected ? accentColor === 'emerald' ? 'border-emerald-500' : accentColor === 'amber' ? 'border-amber-500' : 'border-red-500' : ''}
      `}
      style={{
        boxShadow: selected
          ? accentColor === 'emerald' ? '0 8px 32px rgba(16,185,129,0.15), 0 0 0 1px rgba(16,185,129,0.1)' :
            accentColor === 'amber' ? '0 8px 32px rgba(245,158,11,0.15), 0 0 0 1px rgba(245,158,11,0.1)' :
            '0 8px 32px rgba(239,68,68,0.15), 0 0 0 1px rgba(239,68,68,0.1)'
          : undefined,
        animationDelay: `${index * 120}ms`,
      }}
    >
      <div className="mb-2 sm:mb-3">
        <span className="text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground">
          {SUB_DIM_NAMES[dim.name] || dim.name_zh}
        </span>
      </div>
      <div className="mb-1">
        <span className={`text-2xl sm:text-data-hero font-bold font-data tracking-tighter leading-tight transition-colors duration-300 ${
          selected ? getColorClass(accentColor) : 'text-foreground group-hover:text-foreground'
        }`}>{formatted}</span>
      </div>
      <p className="text-xs text-muted-foreground mb-3">{config.label}</p>
      <div className="h-px bg-border/50 mb-3 mt-auto" />
      {secConfig && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{secConfig.label}</span>
          <span className="font-data font-medium text-foreground">{secFormatted || 'N/A'}</span>
        </div>
      )}
      <div className={`absolute inset-x-0 bottom-2 flex justify-center transition-opacity duration-200 ${selected ? 'opacity-0' : 'opacity-0 group-hover:opacity-100'}`}>
        <span className="text-sm text-muted-foreground bg-background/80 px-2 py-0.5 rounded-full">点击查看详情</span>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function InflationRatesPage() {
  const [selectedDim, setSelectedDim] = useState<string>('inflation');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [fredTimeRange, setFredTimeRange] = useState('1Y');
  const [commodityTimeRange, setCommodityTimeRange] = useState('1Y');
  const queryClient = useQueryClient();

  const { data: ratesResponse, isLoading: ratesLoading, error: ratesError } = useInflationRates();
  const { data: cpiResponse, isLoading: cpiLoading } = useCpiBreakdown();
  const { data: tcResponse, isLoading: tcLoading } = useTreasuryCommodities();
  const { data: weeklyResponse, isLoading: weeklyLoading } = useWeeklyReport();

  const loading = ratesLoading || cpiLoading || tcLoading;
  const data = ratesResponse?.success ? ratesResponse.data : null;
  const lastUpdated = ratesResponse?.timestamp ?? null;
  const error = ratesError ? (ratesError instanceof Error ? ratesError.message : 'Failed to fetch data') : null;
  const cpiComponents: CpiComponent[] = cpiResponse?.success ? cpiResponse.components : [];
  const tcData = tcResponse?.success ? tcResponse : null;
  const weeklyReport = weeklyResponse?.success ? weeklyResponse.data : null;

  const inflationDim = data?.sub_dimensions.find((d) => d.name === 'inflation');
  const ratesDim = data?.sub_dimensions.find((d) => d.name === 'rates');
  const orderedDims = [inflationDim, ratesDim].filter((d): d is SubDimension => d != null);

  const goldData = tcData?.commodities?.Gold;
  const oilData = tcData?.commodities?.Oil;
  const silverData = tcData?.commodities?.Silver;
  const copperData = tcData?.commodities?.Copper;

  const handleDimSelect = useCallback((dimName: string) => {
    if (selectedDim === dimName) return;
    setIsTransitioning(true);
    setTimeout(() => { setSelectedDim(dimName); setIsTransitioning(false); }, 200);
  }, [selectedDim]);

  return (
    <main className="min-h-screen bg-background">
      <MacroPageHeader
        section="Inflation & Rates"
        title="美债收益率、CPI与美联储利率"
        question="物价压力如何? 美联储会怎么做?"
        lastUpdated={lastUpdated ? formatTimestamp(lastUpdated) : null}
        loading={loading}
        onRefresh={() => queryClient.invalidateQueries({ queryKey: queryKeys.macro.all })}
      />

      {error && (
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-4">
          <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm">{error}</div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 space-y-8">
        <section>
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            {loading ? (
              [0, 1, 2].map((i) => <HeroCardSkeleton key={i} index={i} />)
            ) : (
              <>
                {orderedDims.map((dim, i) => (
                  <HeroCard key={dim.name} dim={dim} index={i} selected={selectedDim === dim.name} onSelect={() => handleDimSelect(dim.name)} />
                ))}
                <button
                  type="button"
                  onClick={() => handleDimSelect('commodities')}
                  className={`group relative rounded-2xl p-5 flex flex-col text-left transition-all duration-300 ease-out cursor-pointer ${selectedDim === 'commodities' ? 'bg-card border-2 translate-y-[-3px] border-amber-500' : 'bg-card/60 border border-border/40 hover:bg-card hover:border-border/60 hover:translate-y-[-2px]'}`}
                  style={{ boxShadow: selectedDim === 'commodities' ? '0 8px 32px rgba(245,158,11,0.15), 0 0 0 1px rgba(245,158,11,0.1)' : undefined, animationDelay: '240ms' }}
                >
                  <div className="mb-3"><span className="text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground">{SUB_DIM_NAMES.commodities}</span></div>
                  <div className="mb-1">
                    <span className={`text-data-hero font-bold font-data tracking-tighter leading-tight transition-colors duration-300 ${selectedDim === 'commodities' ? 'text-amber-400' : 'text-foreground group-hover:text-foreground'}`}>
                      {goldData?.price != null ? `$${goldData.price.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : 'N/A'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">黄金 (XAU/USD)</p>
                  <div className="h-px bg-border/50 mb-3 mt-auto" />
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">布伦特原油</span>
                    <span className="font-data font-medium text-foreground">{oilData?.price != null ? `$${oilData.price.toFixed(2)}` : 'N/A'}</span>
                  </div>
                  <div className={`absolute inset-x-0 bottom-2 flex justify-center transition-opacity duration-200 ${selectedDim === 'commodities' ? 'opacity-0' : 'opacity-0 group-hover:opacity-100'}`}>
                    <span className="text-sm text-muted-foreground bg-background/80 px-2 py-0.5 rounded-full">点击查看详情</span>
                  </div>
                </button>
              </>
            )}
          </div>
        </section>

        <InsightBanner
          sectionTitle="通胀与利率"
          analysis={weeklyReport?.inflation_analysis ?? null}
          signalColor={weeklyReport?.signal_lights.inflation ?? null}
          weekLabel={weeklyReport?.week_label ?? null}
          loading={weeklyLoading}
        />

        {selectedDim === 'inflation' && (
          <div className="flex items-center gap-1">
            {['1Y', '2Y', '5Y', 'ALL'].map((range) => (
              <button key={range} type="button" onClick={() => setFredTimeRange(range)}
                className={`px-3 py-1.5 text-xs font-data rounded-lg transition-colors ${fredTimeRange === range ? 'bg-primary/15 text-primary font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}`}>
                {range}
              </button>
            ))}
          </div>
        )}

        {selectedDim === 'inflation' && cpiComponents.length > 0 && (
          <section>
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-[0.15em] mb-3">CPI 通胀细分</h3>
            <div className="grid grid-cols-5 gap-3">
              {cpiComponents.map((comp) => {
                const yoy = comp.yoy_pct;
                const yoyColor = yoy == null ? 'text-muted-foreground' : yoy <= 2.0 ? 'text-emerald-500' : yoy <= 3.5 ? 'text-amber-400' : 'text-red-500';
                return (
                  <div key={comp.series_id} className="bg-card/60 rounded-xl border border-border/40 p-4 text-center">
                    <p className="text-xs text-muted-foreground mb-2">{comp.name_zh}</p>
                    <p className={`text-2xl font-bold font-data tracking-tight ${yoyColor}`}>{yoy != null ? `${yoy.toFixed(1)}%` : '--'}</p>
                    <p className="text-sm text-muted-foreground mt-1">YoY</p>
                    {comp.mom_pct != null && (
                      <p className={`text-xs font-data mt-1 ${comp.mom_pct >= 0 ? 'text-red-400/70' : 'text-emerald-400/70'}`}>
                        {comp.mom_pct >= 0 ? '+' : ''}{comp.mom_pct.toFixed(2)}% MoM
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {selectedDim === 'rates' && (
          <div className={`space-y-6 transition-all duration-300 ease-out ${isTransitioning ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'}`}>
            {tcData?.treasury?.rates && Object.keys(tcData.treasury.rates).length > 0 && (
              <section><YieldCurveChart rates={tcData.treasury.rates} shape={tcData.treasury.yield_curve_shape} date={tcData.treasury.date} /></section>
            )}
            {tcData?.treasury?.spreads && Object.keys(tcData.treasury.spreads).length > 0 && (
              <section>
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-[0.15em] mb-3">关键利差</h3>
                <div className="grid grid-cols-4 gap-3">
                  {Object.entries(tcData.treasury.spreads).map(([key, value]) => {
                    const bps = Math.round(value * 100);
                    const colorClass = getSpreadColor(key, value);
                    return (
                      <div key={key} className="bg-card/60 rounded-xl border border-border/40 p-4 text-center">
                        <p className="text-xs text-muted-foreground mb-2">{SPREAD_NAMES[key] || key}</p>
                        <p className={`text-2xl font-bold font-data tracking-tight ${colorClass}`}>{bps > 0 ? '+' : ''}{bps}<span className="text-sm font-normal ml-0.5">bp</span></p>
                        <p className="text-sm text-muted-foreground mt-2 leading-snug">{SPREAD_INFO[key] || ''}</p>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
            {ratesDim && <DeepDiveSection dim={ratesDim} timeRange={fredTimeRange} />}
          </div>
        )}

        {selectedDim === 'inflation' && inflationDim && (
          <div className={`transition-all duration-300 ease-out ${isTransitioning ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'}`}>
            <DeepDiveSection dim={inflationDim} timeRange={fredTimeRange} />
          </div>
        )}

        {selectedDim === 'commodities' && (
          <div className={`space-y-6 transition-all duration-300 ease-out ${isTransitioning ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'}`}>
            <SectionHeader sectionName="commodities" title="大宗商品与美元详解" />
            <SectionExplainerBanner sectionName="commodities" />
            <div className="flex items-center gap-1">
              {['1M', '3M', '6M', '1Y', 'ALL'].map((range) => (
                <button key={range} type="button" onClick={() => setCommodityTimeRange(range)}
                  className={`px-3 py-1.5 text-xs font-data rounded-lg transition-colors ${commodityTimeRange === range ? 'bg-primary/15 text-primary font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}`}>
                  {range}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <CommodityPanel title="黄金 (Gold)" price={goldData?.price ?? null} changePercent={goldData?.changePercent ?? null} chartSymbol="GOLD" description="避险资产和抗通胀工具。金价与实际利率呈负相关 -- 实际利率下降时，持有黄金的机会成本降低。" timeRange={commodityTimeRange} />
              <CommodityPanel title="白银 (Silver)" price={silverData?.price ?? null} changePercent={silverData?.changePercent ?? null} chartSymbol="SILVER" description="兼具避险属性和工业属性（电子、太阳能）。金银比偏高时白银被低估，偏低时市场风险偏好较强。" timeRange={commodityTimeRange} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <CommodityPanel title="原油 (Brent)" price={oilData?.price ?? null} changePercent={oilData?.changePercent ?? null} chartSymbol="OIL" description="全球基准油价，直接影响运输和生产成本。油价飙升推高通胀，可能加速美联储加息。" timeRange={commodityTimeRange} />
              <CommodityPanel title="铜 (Dr. Copper)" price={copperData?.price ?? null} changePercent={copperData?.changePercent ?? null} chartSymbol="COPPER" description='被称为"铜博士"，因其广泛用于制造业，铜价是经济活动的领先指标。' timeRange={commodityTimeRange} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <CommodityPanel title="美元指数 (DXY)" price={tcData?.dollar?.price ?? null} changePercent={tcData?.dollar?.daily_change ?? null} chartSymbol="DXY" description="衡量美元对六种主要货币的强弱。美元走强压制大宗商品和海外收入占比高的美股。" timeRange={commodityTimeRange} />
            </div>
            {goldData?.price && oilData?.price && (() => {
              const goldOilRatio = goldData.price! / oilData.price!;
              const dxyChange = tcData?.dollar?.daily_change ?? 0;
              const dxyPositive = dxyChange >= 0;
              return (
                <section>
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-[0.15em] mb-3">跨市场信号</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-card/60 rounded-xl border border-border/40 p-4">
                      <p className="text-xs text-muted-foreground mb-2">金油比 (Gold/Oil)</p>
                      <p className="text-2xl font-bold font-data tracking-tight text-foreground">{goldOilRatio.toFixed(1)}</p>
                      <p className="text-sm text-muted-foreground mt-2 leading-snug">{interpretRatio(goldOilRatio, 25, 15, '偏高，市场偏向避险', '偏低，风险偏好较强', '处于正常区间')}</p>
                    </div>
                    {silverData?.price && (() => {
                      const goldSilverRatio = goldData.price! / silverData.price!;
                      return (
                        <div className="bg-card/60 rounded-xl border border-border/40 p-4">
                          <p className="text-xs text-muted-foreground mb-2">金银比 (Gold/Silver)</p>
                          <p className="text-2xl font-bold font-data tracking-tight text-foreground">{goldSilverRatio.toFixed(1)}</p>
                          <p className="text-sm text-muted-foreground mt-2 leading-snug">{interpretRatio(goldSilverRatio, 80, 60, '偏高，白银被低估或避险情绪浓', '偏低，市场偏好风险资产', '处于正常区间')}</p>
                        </div>
                      );
                    })()}
                    {copperData?.price && (
                      <div className="bg-card/60 rounded-xl border border-border/40 p-4">
                        <p className="text-xs text-muted-foreground mb-2">铜金比 (Cu/Au)</p>
                        <p className="text-2xl font-bold font-data tracking-tight text-foreground">{((copperData.price! / goldData.price!) * 1000).toFixed(2)}</p>
                        <p className="text-sm text-muted-foreground mt-2 leading-snug">上升反映经济乐观，下降反映避险升温</p>
                      </div>
                    )}
                    <div className="bg-card/60 rounded-xl border border-border/40 p-4">
                      <p className="text-xs text-muted-foreground mb-2">美元 vs 商品</p>
                      <div className="flex items-baseline gap-2">
                        <span className={`text-lg font-bold font-data ${dxyPositive ? 'text-emerald-500' : 'text-red-500'}`}>DXY {dxyPositive ? '+' : ''}{dxyChange.toFixed(2)}%</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-2 leading-snug">美元走强时商品价格承压</p>
                    </div>
                  </div>
                </section>
              );
            })()}
          </div>
        )}

        <section className="text-center py-4">
          <Link href="/macro" className="group inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors duration-200">
            <svg className="w-4 h-4 transition-transform duration-200 group-hover:-translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
            </svg>
            返回宏观总览
          </Link>
          <p className="text-xs text-muted-foreground/70 mt-3">
            数据来源{' '}<a href="https://fred.stlouisfed.org/" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80 transition-colors">FRED</a>
            {' '}&middot;{' '}<a href="https://financialmodelingprep.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80 transition-colors">FMP</a>
            {' '}&middot;{' '}图表{' '}<a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80 transition-colors">TradingView</a>
          </p>
        </section>
      </div>
    </main>
  );
}
