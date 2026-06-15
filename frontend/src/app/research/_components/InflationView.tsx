'use client';

import { useEffect, useState } from 'react';
import { useInflationRates, useCpiBreakdown, useTreasuryCommodities } from '@/hooks/queries/use-macro-data';
import type { CpiComponent } from '@/lib/api';
import {
  SPREAD_NAMES,
  SPREAD_INFO,
  getSpreadColor,
  interpretRatio,
  SectionHeader,
  SectionExplainerBanner,
  DeepDiveSection,
  CommodityPanel,
  YieldCurveChart,
} from '@/app/macro/inflation-rates/components';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InflationContextPayload {
  type: 'macro_inflation';
  overall_score: number;
  overall_level: string;
  overall_headline: string;
  dimensions: { name_zh: string; score: number; risk_level: string; headline: string }[];
  cpi_components: { name_zh: string; yoy_pct: number | null; mom_pct: number | null }[];
}

interface InflationViewProps {
  embedded?: boolean;
  onContextReady?: (payload: InflationContextPayload) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RISK_COLORS: Record<string, string> = { low: 'bg-emerald-500', medium: 'bg-amber-400', high: 'bg-red-500' };
const RISK_TEXT_COLORS: Record<string, string> = { low: 'text-emerald-500', medium: 'text-amber-400', high: 'text-red-500' };
const RISK_LABELS: Record<string, string> = { low: '低风险', medium: '中等', high: '高风险' };

const DIM_TABS: { key: string; label: string }[] = [
  { key: 'inflation', label: '通胀' },
  { key: 'rates', label: '利率' },
  { key: 'commodities', label: '大宗商品' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function InflationView({ embedded, onContextReady }: InflationViewProps) {
  const { data: inflResponse, isLoading: inflLoading, error: inflError } = useInflationRates();
  const { data: cpiResponse } = useCpiBreakdown();
  const { data: tcResponse } = useTreasuryCommodities();

  const inflation = inflResponse?.success ? inflResponse.data : null;
  const cpiComponents: CpiComponent[] = cpiResponse?.success ? cpiResponse.components : [];
  const tcData = tcResponse?.success ? tcResponse : null;
  const [selectedDim, setSelectedDim] = useState('inflation');
  const [fredTimeRange, setFredTimeRange] = useState('1Y');
  const [commodityTimeRange, setCommodityTimeRange] = useState('1Y');

  useEffect(() => {
    if (!onContextReady || !inflation) return;
    onContextReady({
      type: 'macro_inflation',
      overall_score: inflation.overall_score,
      overall_level: inflation.overall_level,
      overall_headline: inflation.overall_headline,
      dimensions: inflation.sub_dimensions.map((d) => ({
        name_zh: d.name_zh, score: d.score, risk_level: d.risk_level, headline: d.headline,
      })),
      cpi_components: (cpiComponents || []).map((c) => ({
        name_zh: c.name_zh, yoy_pct: c.yoy_pct, mom_pct: c.mom_pct,
      })),
    });
  }, [inflation, cpiComponents, onContextReady]);

  if (inflLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 rounded-full border border-primary/20" />
          <div className="absolute inset-0 rounded-full border-t border-primary animate-spin" />
        </div>
        <span className="text-xs text-muted-foreground">加载通胀数据</span>
      </div>
    );
  }

  if (inflError || !inflation) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
        <p className="text-sm text-muted-foreground">无法加载通胀与利率数据</p>
      </div>
    );
  }

  const inflationDim = inflation.sub_dimensions.find((d) => d.name === 'inflation');
  const ratesDim = inflation.sub_dimensions.find((d) => d.name === 'rates');
  const goldData = tcData?.commodities?.Gold;
  const oilData = tcData?.commodities?.Oil;
  const silverData = tcData?.commodities?.Silver;
  const copperData = tcData?.commodities?.Copper;

  return (
    <div className={embedded ? '' : 'h-full overflow-y-auto'}>
      {!embedded && (
        <>
          <div className="px-5 pt-4 pb-4">
            <span className="text-primary text-xs font-semibold tracking-[0.25em] uppercase">INFLATION & RATES</span>
            <h2 className="mt-1 text-xl font-semibold leading-tight text-foreground">通胀与利率</h2>
            <p className="text-sm text-muted-foreground mt-1">CPI、利率、商品信号</p>
          </div>
          <div className="border-b border-border/30" />
        </>
      )}

      <div className="px-5 py-5 space-y-6">
        {/* Overall */}
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary/70" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">综合评估</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${RISK_COLORS[inflation.overall_level] || 'bg-muted'}`} />
              <span className={`text-xs font-medium ${RISK_TEXT_COLORS[inflation.overall_level] || ''}`}>
                {RISK_LABELS[inflation.overall_level] || inflation.overall_level}
              </span>
            </div>
          </div>
          <p className="text-sm text-foreground leading-relaxed">{inflation.overall_headline}</p>
        </div>

        {/* Dimension Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {DIM_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setSelectedDim(t.key)}
              className={`shrink-0 flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors cursor-pointer ${
                selectedDim === t.key
                  ? 'border-primary/40 bg-primary/10 text-foreground'
                  : 'border-border/60 bg-card text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* CPI Breakdown (inflation tab) */}
        {selectedDim === 'inflation' && cpiComponents.length > 0 && (
          <section>
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-[0.15em] mb-3">CPI 通胀细分</h3>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
              {cpiComponents.map((comp) => {
                const yoy = comp.yoy_pct;
                const yoyColor = yoy == null ? 'text-muted-foreground' : yoy <= 2.0 ? 'text-emerald-500' : yoy <= 3.5 ? 'text-amber-400' : 'text-red-500';
                return (
                  <div key={comp.series_id} className="bg-card/60 rounded-xl border border-border/40 p-3 text-center">
                    <p className="text-xs text-muted-foreground mb-1.5">{comp.name_zh}</p>
                    <p className={`text-xl font-bold font-data tracking-tight ${yoyColor}`}>{yoy != null ? `${yoy.toFixed(1)}%` : '--'}</p>
                    <p className="text-micro text-muted-foreground mt-0.5">YoY</p>
                    {comp.mom_pct != null && (
                      <p className={`text-xs font-data mt-0.5 ${comp.mom_pct >= 0 ? 'text-red-400/70' : 'text-emerald-400/70'}`}>
                        {comp.mom_pct >= 0 ? '+' : ''}{comp.mom_pct.toFixed(2)}% MoM
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Time range for inflation/rates */}
        {(selectedDim === 'inflation' || selectedDim === 'rates') && (
          <div className="flex items-center gap-1">
            {['1Y', '2Y', '5Y', 'ALL'].map((range) => (
              <button key={range} type="button" onClick={() => setFredTimeRange(range)}
                className={`px-3 py-1.5 text-xs font-data rounded-lg transition-colors ${fredTimeRange === range ? 'bg-primary/15 text-primary font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}`}>
                {range}
              </button>
            ))}
          </div>
        )}

        {/* Inflation deep dive */}
        {selectedDim === 'inflation' && inflationDim && (
          <DeepDiveSection dim={inflationDim} timeRange={fredTimeRange} />
        )}

        {/* Rates deep dive */}
        {selectedDim === 'rates' && (
          <div className="space-y-6">
            {tcData?.treasury?.rates && Object.keys(tcData.treasury.rates).length > 0 && (
              <YieldCurveChart rates={tcData.treasury.rates} shape={tcData.treasury.yield_curve_shape} date={tcData.treasury.date} />
            )}
            {tcData?.treasury?.spreads && Object.keys(tcData.treasury.spreads).length > 0 && (
              <section>
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-[0.15em] mb-3">关键利差</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {Object.entries(tcData.treasury.spreads).map(([key, value]) => {
                    const bps = Math.round(value * 100);
                    return (
                      <div key={key} className="bg-card/60 rounded-xl border border-border/40 p-3 text-center">
                        <p className="text-xs text-muted-foreground mb-1.5">{SPREAD_NAMES[key] || key}</p>
                        <p className={`text-xl font-bold font-data tracking-tight ${getSpreadColor(key, value)}`}>{bps > 0 ? '+' : ''}{bps}<span className="text-sm font-normal ml-0.5">bp</span></p>
                        <p className="text-sm text-muted-foreground mt-1.5 leading-snug">{SPREAD_INFO[key] || ''}</p>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
            {ratesDim && <DeepDiveSection dim={ratesDim} timeRange={fredTimeRange} />}
          </div>
        )}

        {/* Commodities deep dive */}
        {selectedDim === 'commodities' && (
          <div className="space-y-6">
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
            <div className="grid grid-cols-1 gap-4">
              <CommodityPanel title="黄金 (Gold)" price={goldData?.price ?? null} changePercent={goldData?.changePercent ?? null} chartSymbol="GOLD" description="避险资产和抗通胀工具。金价与实际利率呈负相关。" timeRange={commodityTimeRange} />
              <CommodityPanel title="白银 (Silver)" price={silverData?.price ?? null} changePercent={silverData?.changePercent ?? null} chartSymbol="SILVER" description="兼具避险属性和工业属性。" timeRange={commodityTimeRange} />
              <CommodityPanel title="原油 (Brent)" price={oilData?.price ?? null} changePercent={oilData?.changePercent ?? null} chartSymbol="OIL" description="全球基准油价，直接影响运输和生产成本。" timeRange={commodityTimeRange} />
              <CommodityPanel title="铜 (Dr. Copper)" price={copperData?.price ?? null} changePercent={copperData?.changePercent ?? null} chartSymbol="COPPER" description="铜价是经济活动的领先指标。" timeRange={commodityTimeRange} />
              <CommodityPanel title="美元指数 (DXY)" price={tcData?.dollar?.price ?? null} changePercent={tcData?.dollar?.daily_change ?? null} chartSymbol="DXY" description="美元走强压制大宗商品和海外收入占比高的美股。" timeRange={commodityTimeRange} />
            </div>
            {goldData?.price && oilData?.price && (() => {
              const goldOilRatio = goldData.price! / oilData.price!;
              const dxyChange = tcData?.dollar?.daily_change ?? 0;
              return (
                <section>
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-[0.15em] mb-3">跨市场信号</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-card/60 rounded-xl border border-border/40 p-3">
                      <p className="text-xs text-muted-foreground mb-1.5">金油比</p>
                      <p className="text-xl font-bold font-data tracking-tight text-foreground">{goldOilRatio.toFixed(1)}</p>
                      <p className="text-sm text-muted-foreground mt-1">{interpretRatio(goldOilRatio, 25, 15, '偏高，避险', '偏低，风险偏好强', '正常区间')}</p>
                    </div>
                    {silverData?.price && (() => {
                      const gsr = goldData.price! / silverData.price!;
                      return (
                        <div className="bg-card/60 rounded-xl border border-border/40 p-3">
                          <p className="text-xs text-muted-foreground mb-1.5">金银比</p>
                          <p className="text-xl font-bold font-data tracking-tight text-foreground">{gsr.toFixed(1)}</p>
                          <p className="text-sm text-muted-foreground mt-1">{interpretRatio(gsr, 80, 60, '白银被低估', '风险偏好强', '正常区间')}</p>
                        </div>
                      );
                    })()}
                    {copperData?.price && (
                      <div className="bg-card/60 rounded-xl border border-border/40 p-3">
                        <p className="text-xs text-muted-foreground mb-1.5">铜金比</p>
                        <p className="text-xl font-bold font-data tracking-tight text-foreground">{((copperData.price! / goldData.price!) * 1000).toFixed(2)}</p>
                        <p className="text-sm text-muted-foreground mt-1">上升=经济乐观，下降=避险升温</p>
                      </div>
                    )}
                    <div className="bg-card/60 rounded-xl border border-border/40 p-3">
                      <p className="text-xs text-muted-foreground mb-1.5">美元 vs 商品</p>
                      <span className={`text-lg font-bold font-data ${dxyChange >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>DXY {dxyChange >= 0 ? '+' : ''}{dxyChange.toFixed(2)}%</span>
                      <p className="text-sm text-muted-foreground mt-1">美元走强时商品价格承压</p>
                    </div>
                  </div>
                </section>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
