'use client';

/**
 * Shared components and constants for the Economy dimension.
 *
 * Used by:
 *  - macro/economy/page.tsx  (standalone full page)
 *  - research/_components/EconomyView.tsx  (research panel tab)
 */

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import type { SubDimension, RiskIndicator } from '@/lib/api';
import { TrendingUp, Users, Landmark, type LucideIcon } from 'lucide-react';

// ---------------------------------------------------------------------------
// Dynamic chart imports
// ---------------------------------------------------------------------------

export const TradingViewWidget = dynamic(
  () => import('@/components/TradingViewWidget').then(mod => mod.TradingViewWidget),
  { ssr: false, loading: () => <div className="h-[400px] bg-card animate-pulse rounded-lg" /> },
);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const FRED_SYMBOLS: Record<string, string> = {
  gdp_growth: 'FRED:A191RL1Q225SBEA',
  recession_prob: 'FRED:RECPROUSM156N',
  cfnai: 'FRED:CFNAI',
  consumer_sentiment: 'FRED:UMCSENT',
  retail_sales: 'FRED:RSAFS',
  industrial_production: 'FRED:INDPRO',
  unemployment: 'FRED:UNRATE',
  nonfarm_payrolls: 'FRED:PAYEMS',
  initial_claims: 'FRED:ICSA',
  continued_claims: 'FRED:CCSA',
  sahm_rule: 'FRED:SAHMREALTIME',
  hy_oas: 'FRED:BAMLH0A0HYM2',
  bbb_spread: 'FRED:BAMLC0A4CBBB',
  cre_delinquency: 'FRED:DRCRELEXFACBS',
  business_delinquency: 'FRED:DRBLACBS',
  yield_curve: 'FRED:T10Y2Y',
  lei: 'FRED:USSLIND',
};

export const SERIES_TO_CHART: Record<string, string> = {
  A191RL1Q225SBEA: 'gdp_growth',
  RECPROUSM156N: 'recession_prob',
  CFNAI: 'cfnai',
  UMCSENT: 'consumer_sentiment',
  RSAFS: 'retail_sales',
  USSLIND: 'lei',
  INDPRO: 'industrial_production',
  UNRATE: 'unemployment',
  PAYEMS: 'nonfarm_payrolls',
  ICSA: 'initial_claims',
  CCSA: 'continued_claims',
  SAHMREALTIME: 'sahm_rule',
  BAMLH0A0HYM2: 'hy_oas',
  BAMLC0A4CBBB: 'bbb_spread',
  DRCRELEXFACBS: 'cre_delinquency',
  DRBLACBS: 'business_delinquency',
  T10Y2Y: 'yield_curve',
};

export const HERO_CONFIG: Record<string, {
  primary: string;
  secondary: string;
  label: string;
  format: (ind: RiskIndicator) => string;
  interpret: (ind: RiskIndicator) => { color: string };
}> = {
  growth: {
    primary: 'A191RL1Q225SBEA',
    secondary: 'RECPROUSM156N',
    label: 'GDP 季度年化增长率',
    format: (ind) => ind.value != null ? `${ind.value.toFixed(1)}%` : 'N/A',
    interpret: (ind) => {
      const v = ind.value;
      if (v == null) return { color: 'amber' };
      if (v >= 2) return { color: 'emerald' };
      if (v >= 0) return { color: 'amber' };
      return { color: 'red' };
    },
  },
  employment: {
    primary: 'UNRATE',
    secondary: 'PAYEMS',
    label: '失业率',
    format: (ind) => ind.value != null ? `${ind.value.toFixed(1)}%` : 'N/A',
    interpret: (ind) => {
      const v = ind.value;
      if (v == null) return { color: 'amber' };
      if (v < 4) return { color: 'emerald' };
      if (v < 5) return { color: 'amber' };
      return { color: 'red' };
    },
  },
  credit: {
    primary: 'T10Y2Y',
    secondary: 'BAMLH0A0HYM2',
    label: '10Y-2Y 收益率曲线',
    format: (ind) => {
      const v = ind.value;
      if (v == null) return 'N/A';
      return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
    },
    interpret: (ind) => {
      const v = ind.value;
      if (v == null) return { color: 'amber' };
      if (v > 0.5) return { color: 'emerald' };
      if (v >= 0) return { color: 'amber' };
      return { color: 'red' };
    },
  },
};

export const SECONDARY_FORMAT: Record<string, {
  label: string;
  format: (ind: RiskIndicator) => string;
}> = {
  RECPROUSM156N: {
    label: '衰退概率',
    format: (ind) => ind.value != null ? `${ind.value.toFixed(0)}%` : 'N/A',
  },
  PAYEMS: {
    label: '非农就业',
    format: (ind) => ind.change != null ? `${ind.change >= 0 ? '+' : ''}${ind.change.toFixed(1)}% MoM` : 'N/A',
  },
  BAMLH0A0HYM2: {
    label: '高收益债利差',
    format: (ind) => ind.value != null ? `${(ind.value * 100).toFixed(0)}bps` : 'N/A',
  },
};

export const INDICATOR_INFO: Record<string, { title: string; description: string }> = {
  gdp_growth: { title: 'GDP 实际增长率', description: '美国实际GDP季度环比年化增长率。2%以上为健康增长，0-2%增长低迷，连续两个季度负增长是技术性衰退的定义。' },
  recession_prob: { title: '平滑衰退概率', description: 'Piger & Chauvet 基于非农就业、工业产出、实际收入和实际销售的平滑衰退概率模型。超过30%的读数与 NBER 衰退期吻合。' },
  cfnai: { title: '芝加哥联储国家活动指数', description: '85项月度经济指标的加权平均。低于-0.70表明衰退可能性上升。正值表示经济增长高于趋势水平。' },
  consumer_sentiment: { title: '消费者信心指数', description: '密歇根大学消费者信心指数。信心大幅下降通常预示消费支出减少。低于60的读数与衰退期吻合。' },
  retail_sales: { title: '零售销售', description: '预估零售销售月度数据，消费支出占GDP约70%。环比负增长通常预示经济放缓，持续下滑可能触发衰退。' },
  industrial_production: { title: '工业产出指数', description: '衡量制造业、采矿业和公用事业的实际产出。连续下滑是经济衰退的同步指标，领先于GDP数据发布。' },
  unemployment: { title: '失业率', description: '失业率从周期低点持续上升0.5个百分点以上是可靠的衰退信号。周期低点的背景比绝对水平更重要。' },
  nonfarm_payrolls: { title: '非农就业', description: '最受关注的月度就业指标。环比负增长通常只在衰退期出现。趋势比单月数据更重要。' },
  initial_claims: { title: '初请失业金人数', description: '最及时的劳动力市场指标。持续突破25万通常表明劳动力市场恶化，领先失业率上升2-4个月。' },
  continued_claims: { title: '续请失业金人数', description: '反映失业者重新就业的难度。持续上升意味着找工作变难，超过200万人表明就业市场显著恶化。' },
  sahm_rule: { title: 'Sahm 规则指标', description: '失业率3个月移动平均值比过去12个月低点上升0.50个百分点时触发。自1970年以来准确识别每一次衰退，无误报。' },
  hy_oas: { title: '高收益债利差', description: '高收益企业债相对国债的期权调整利差。超过500bps表明显著压力；超过800bps为危机级别。最敏感的实时压力指标之一。' },
  bbb_spread: { title: 'BBB 公司债利差', description: 'BBB是最低投资级评级。利差扩大意味着潜在的降级风险，以及企业部门融资条件收紧。' },
  cre_delinquency: { title: '商业地产贷款违约率', description: '违约率上升可能预示更广泛的银行体系压力，因为商业地产贷款在区域性银行资产负债表中占相当大比例。' },
  business_delinquency: { title: '商业贷款违约率', description: '工商业贷款违约率。上升表明企业偿债困难，通常因收入下降或信贷条件收紧所致。' },
  yield_curve: { title: '10Y-2Y 收益率曲线', description: '倒挂（负值）自1970年以来预测了每一次美国经济衰退。曲线通常在衰退实际开始前恢复正常。' },
  lei: { title: 'LEI 领先经济指标', description: '综合10项经济指标的领先指数，专门用来预测未来6-12个月的经济走向。连续几个月下降通常预示经济将放缓或衰退。' },
};

export const CHANGE_PERIOD: Record<string, string> = {
  gdp_growth: '较上季度', recession_prob: '较上月', cfnai: '较上月',
  consumer_sentiment: '较上月', retail_sales: '较上月', industrial_production: '较上月',
  unemployment: '较上月', nonfarm_payrolls: '较上月', initial_claims: '较上周',
  continued_claims: '较上周', sahm_rule: '较上月', hy_oas: '较前日',
  bbb_spread: '较前日', cre_delinquency: '较上季度', business_delinquency: '较上季度',
  yield_curve: '较前日', lei: '较上月',
};

export const SUB_DIM_NAMES: Record<string, string> = {
  growth: '增长', employment: '就业', credit: '信用',
};

export const SECTION_META: Record<string, { number: string; subtitle: string }> = {
  growth: { number: '01', subtitle: 'GDP / 衰退概率 / CFNAI / 零售销售 / 工业产出 / 消费者信心 / LEI' },
  employment: { number: '02', subtitle: '失业率 / 非农 / 初请 / 续请 / Sahm 规则' },
  credit: { number: '03', subtitle: '高收益利差 / BBB 利差 / 地产违约 / 商贷违约 / 收益率曲线' },
};

export const CHANGE_AS_PRIMARY = new Set(['retail_sales', 'industrial_production']);

export const SECTION_EXPLAINER: Record<string, {
  icon: LucideIcon;
  title: string;
  paragraphs: string[];
  items?: { label: string; text: string }[];
}> = {
  growth: {
    icon: TrendingUp,
    title: '经济增长如何影响股市?',
    paragraphs: ['企业利润来自经济活动。经济增长，企业营收增加，股价上涨；经济衰退，企业利润下滑，股价下跌。但股市通常会提前 6-9 个月反映经济变化 -- 所以当这些增长指标刚开始走弱时，股市可能就已经在跌了。'],
    items: [
      { label: 'GDP 增长率', text: '经济总量的增长速度。高于 2% 是健康增长，利好股市；连续两个季度为负就是技术性衰退，股市通常大幅下跌。' },
      { label: '衰退概率 / CFNAI', text: '预警指标。衰退概率超过 30% 或 CFNAI 低于 -0.7 时，历史上每次都出现了经济衰退。一旦触发，防御性板块（公用事业、医疗）表现更好。' },
      { label: '零售销售 / 工业产出', text: '消费占美国 GDP 的 70%，零售销售下降意味着消费者在缩减开支，直接影响消费类股票。工业产出下降则影响制造业和周期性股票。' },
    ],
  },
  employment: {
    icon: Users,
    title: '就业如何影响股市?',
    paragraphs: ['就业好 = 人们有收入 = 消费强劲 = 企业利润好 = 股市上涨。反过来，失业率快速上升往往是经济衰退的信号，对股市非常不利。同时，就业也是美联储决定是否降息的关键因素 -- 就业恶化时美联储更可能降息救市。关注的重点不是绝对水平，而是变化方向。'],
    items: [
      { label: '失业率 / Sahm 规则', text: '失业率本身不可怕，可怕的是上升趋势。失业率从低点上升 0.5 个百分点触发 Sahm 规则，自 1970 年以来每次触发都伴随衰退和股市下跌。' },
      { label: '非农就业', text: '每月第一个周五发布，是当月最重要的经济数据。非农增长强劲利好股市；转为负增长通常只在衰退期出现。' },
      { label: '初请 / 续请失业金', text: '每周发布，是最及时的就业数据。初请突破 25 万意味着裁员增加，通常领先失业率上升 2-4 个月，是提前预警信号。' },
    ],
  },
  credit: {
    icon: Landmark,
    title: '信用市场如何影响股市?',
    paragraphs: ['企业需要借钱来运营和扩张。当借钱成本上升（利差扩大）或贷款违约增加时，说明金融环境在恶化，企业经营压力加大。历史上，信用利差急剧扩大往往领先于股市大跌 -- 因为债券投资者通常比股票投资者更早感知到风险。'],
    items: [
      { label: '高收益债利差', text: '高风险企业债相对国债的额外收益率。低于 350bps 说明市场乐观；超过 500bps 说明恐慌情绪上升；超过 800bps 是危机级别（如 2008、2020 年初）。' },
      { label: '收益率曲线 (10Y-2Y)', text: '正常情况下长期利率高于短期利率。一旦倒挂（变为负值），意味着市场预期未来经济将恶化。自 1970 年以来，倒挂预测了每一次衰退。' },
      { label: '贷款违约率', text: '商业地产和企业贷款的违约率上升，意味着企业还不起钱，银行将收紧放贷，经济会进一步恶化，形成恶性循环。' },
    ],
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function useInView(threshold = 0.1) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const reducedMotion = useRef(false);

  useEffect(() => {
    reducedMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (reducedMotion.current) {
      requestAnimationFrame(() => setIsVisible(true));
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(el);
        }
      },
      { threshold, rootMargin: '0px 0px -40px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return { ref, isVisible };
}

export function findIndicator(dim: SubDimension, seriesId: string): RiskIndicator | undefined {
  return dim.indicators.find((ind) => ind.series_id === seriesId);
}

export function formatRiskValue(value: number | null | undefined, units: string): string {
  if (value === null || value === undefined) return 'N/A';
  if (units.toLowerCase().includes('percent')) return `${value.toFixed(2)}%`;
  const absVal = Math.abs(value);
  if (absVal >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (absVal >= 10_000) return `${(value / 1_000).toFixed(0)}K`;
  if (absVal >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(2);
}

export function getColorClass(color: string) {
  if (color === 'emerald') return 'text-emerald-400';
  if (color === 'amber') return 'text-amber-400';
  return 'text-red-400';
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

export function MetricPanel({
  indicator,
  chartKey,
  theme,
  interval,
}: {
  indicator: RiskIndicator;
  chartKey: string;
  theme: 'light' | 'dark';
  interval: string;
}) {
  const { ref, isVisible } = useInView(0.05);
  const info = INDICATOR_INFO[chartKey];
  const symbol = FRED_SYMBOLS[chartKey];
  const period = CHANGE_PERIOD[chartKey];

  if (!info || !symbol) return null;

  const isIndexSeries = CHANGE_AS_PRIMARY.has(chartKey);
  const hasChange = indicator.change != null;
  const isPositive = hasChange && indicator.change! >= 0;

  let primaryDisplay: string;
  let secondaryDisplay: string | null = null;

  if (isIndexSeries && hasChange) {
    primaryDisplay = `${isPositive ? '+' : ''}${indicator.change!.toFixed(2)}%`;
    secondaryDisplay = formatRiskValue(indicator.value, indicator.units);
  } else {
    primaryDisplay = formatRiskValue(indicator.value, indicator.units);
  }

  return (
    <div
      ref={ref}
      className={`h-full flex flex-col bg-card/60 rounded-xl border border-border/40 overflow-hidden transition-all duration-500 ease-out ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
      }`}
    >
      <div className="flex-1 px-4 pt-4 pb-3">
        <div className="flex items-baseline justify-between gap-3">
          <h4 className="text-sm font-medium text-foreground truncate">{info.title}</h4>
          <div className="flex items-baseline gap-2 shrink-0">
            <span className={`text-xl font-bold font-data tracking-tight ${
              isIndexSeries && hasChange
                ? isPositive ? 'text-emerald-500' : 'text-red-500'
                : 'text-foreground'
            }`}>
              {primaryDisplay}
            </span>
            {isIndexSeries ? (
              secondaryDisplay && (
                <span className="text-xs font-data text-muted-foreground">
                  {period} / {secondaryDisplay}
                </span>
              )
            ) : (
              hasChange && (
                <span className={`text-xs font-data font-medium ${isPositive ? 'text-emerald-500' : 'text-red-500'}`}>
                  {period} {isPositive ? '+' : ''}{indicator.change!.toFixed(2)}%
                </span>
              )
            )}
          </div>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed mt-2">
          {info.description}
        </p>
      </div>

      <div className="border-t border-border/30">
        <TradingViewWidget symbol={symbol} height={300} interval={interval} theme={theme} />
      </div>
    </div>
  );
}

export function DeepDiveSection({
  dim,
  theme,
  interval,
}: {
  dim: SubDimension;
  theme: 'light' | 'dark';
  interval: string;
}) {
  const { ref, isVisible } = useInView();
  const meta = SECTION_META[dim.name];

  const metricPanels = dim.indicators
    .map((ind) => {
      const chartKey = SERIES_TO_CHART[ind.series_id];
      return chartKey ? { indicator: ind, chartKey } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return (
    <section className="relative">
      <div
        ref={ref}
        className={`relative transition-all duration-700 ease-out ${
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}
      >
        {/* Section header */}
        <div className="flex items-start gap-3 min-w-0 mb-5">
          <span className="text-3xl font-data font-bold leading-none text-foreground tracking-tighter select-none">
            {meta?.number || '00'}
          </span>
          <div className="pt-0.5 min-w-0">
            <h2 className="text-lg font-editorial text-foreground tracking-tight mb-0.5">
              {dim.name_zh}详解
            </h2>
            <p className="text-xs text-muted-foreground tracking-wide">
              {meta?.subtitle}
            </p>
          </div>
        </div>

        {/* Section explainer banner */}
        {SECTION_EXPLAINER[dim.name] && (
          <div className="bg-muted/30 rounded-xl border border-border/40 p-5 mb-5">
            <div className="flex items-start gap-3">
              {(() => { const Icon = SECTION_EXPLAINER[dim.name].icon; return (
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Icon className="w-4 h-4 text-primary" strokeWidth={1.5} />
              </div>
              ); })()}
              <div>
                <h3 className="text-base font-medium text-foreground mb-2">
                  {SECTION_EXPLAINER[dim.name].title}
                </h3>
                {SECTION_EXPLAINER[dim.name].paragraphs.map((p, i) => (
                  <p key={i} className="text-sm text-muted-foreground leading-relaxed mt-2 first:mt-0">
                    {p}
                  </p>
                ))}
                {SECTION_EXPLAINER[dim.name].items && (
                  <ul className="text-sm text-muted-foreground leading-relaxed mt-3 space-y-1.5 list-none">
                    {SECTION_EXPLAINER[dim.name].items!.map((item, i) => (
                      <li key={i}>
                        <span className="text-primary font-medium">{item.label}</span>
                        {' '}&mdash; {item.text}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Metric panels */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {metricPanels.map(({ indicator, chartKey }) => (
            <MetricPanel
              key={chartKey}
              indicator={indicator}
              chartKey={chartKey}
              theme={theme}
              interval={interval}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
