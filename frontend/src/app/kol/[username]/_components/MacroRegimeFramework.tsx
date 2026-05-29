'use client';

import Link from 'next/link';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Gauge,
  GitBranch,
  LineChart,
  Search,
  ShieldAlert,
} from 'lucide-react';
import type { ReactNode } from 'react';

import type {
  EconomicFundamentalsResponse,
  GlobalLiquidityMetrics,
  KolSectorV3Detail,
  LiquidityMetric,
  LiquidityMetrics,
  RiskIndicator,
} from '@/lib/api';
import { useLiquidityMetrics, useGlobalLiquidity } from '@/hooks/queries/use-liquidity-data';
import {
  useEconomicFundamentals,
  useInflationRates,
  useMarketSentiment,
  useTreasuryCommodities,
} from '@/hooks/queries/use-macro-data';
import { formatLiquidityValue } from '@/app/macro/liquidity/liquidity-metrics';
import ExpandableRule from './ExpandableRule';
import TweetFeedCard from './TweetFeedCard';

interface Props {
  detail: KolSectorV3Detail;
  username: string;
}

type Tone = 'supportive' | 'watch' | 'stress' | 'neutral';

interface IndicatorCardData {
  key: string;
  label: string;
  value: string;
  date?: string | null;
  tone: Tone;
  status: string;
  frankRead: string;
  source: string;
  change?: string | null;
}

interface IndicatorGroup {
  id: string;
  title: string;
  description: string;
  items: IndicatorCardData[];
}

interface RegimeSummary {
  label: string;
  body: string;
  tone: Tone;
}

const FOCUS_INDICATOR_KEYS = ['net-liquidity', 'sofr-effr', '10y', 'hy-oas', 'vix', 'usdjpy'];

const toneText: Record<Tone, string> = {
  supportive: 'text-primary',
  watch: 'text-amber-500',
  stress: 'text-destructive',
  neutral: 'text-muted-foreground',
};

const toneBg: Record<Tone, string> = {
  supportive: 'bg-primary/10 border-primary/25',
  watch: 'bg-amber-500/10 border-amber-500/25',
  stress: 'bg-destructive/10 border-destructive/25',
  neutral: 'bg-muted/30 border-border/50',
};

const toneDot: Record<Tone, string> = {
  supportive: 'bg-primary',
  watch: 'bg-amber-500',
  stress: 'bg-destructive',
  neutral: 'bg-muted-foreground',
};

export default function MacroRegimeFramework({ detail, username }: Props) {
  const { data: liquidityRes, isLoading: liquidityLoading } = useLiquidityMetrics();
  const { data: globalLiquidityRes, isLoading: globalLoading } = useGlobalLiquidity();
  const { data: economyRes, isLoading: economyLoading } = useEconomicFundamentals();
  const { data: inflationRes, isLoading: inflationLoading } = useInflationRates();
  const { data: sentimentRes, isLoading: sentimentLoading } = useMarketSentiment();
  const { data: treasuryRes, isLoading: treasuryLoading } = useTreasuryCommodities();

  const metrics = liquidityRes?.success ? liquidityRes.metrics : null;
  const globalMetrics = globalLiquidityRes?.success ? globalLiquidityRes.data : null;
  const economy = economyRes?.success ? economyRes : null;
  const inflation = inflationRes?.success ? inflationRes : null;
  const sentiment = sentimentRes?.success ? sentimentRes : null;
  const treasury = treasuryRes?.success ? treasuryRes : null;
  const loading =
    liquidityLoading ||
    globalLoading ||
    economyLoading ||
    inflationLoading ||
    sentimentLoading ||
    treasuryLoading;

  const indicatorGroups = buildIndicatorGroups({
    metrics,
    globalMetrics,
    economy,
    inflation,
    sentiment,
    tenYear: treasury?.treasury.rates['10Y']?.rate ?? null,
  });
  const focusIndicators = pickFocusIndicators(indicatorGroups);
  const regimeSummary = summarizeRegime(focusIndicators);
  const indicatorsLoading =
    loading && focusIndicators.every((indicator) => indicator.value === 'N/A');

  const chatHref =
    `/research?agent=kol&persona=${encodeURIComponent(username)}` +
    `&q=${encodeURIComponent('按 Frank 的宏观框架，现在阵眼在哪里？哪些指标最需要盯？')}`;

  return (
    <div className="pb-10">
      <header className="rounded-lg border border-border/50 bg-card/30">
        <div className="grid gap-6 p-5 md:p-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 max-w-3xl">
            <p className="font-data text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {detail.eyebrow}
            </p>
            <h2 className="mt-2 font-editorial text-3xl tracking-tight text-foreground md:text-4xl">
              宏观视角
            </h2>
            <p className="mt-3 text-base leading-relaxed text-foreground">
              这不是完整宏观仪表盘，而是 Frank 用来判断风险级别的一张工作台：先找阵眼，再确认它有没有升级成系统性冲击。
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <FrameworkTag label="找主导变量" />
              <FrameworkTag label="只看硬证据" />
              <FrameworkTag label="不把利空直接等同减仓" />
            </div>
          </div>

          <div className="border-t border-border/40 pt-5 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
            <div>
              <p className="text-sm font-medium text-muted-foreground">当前框架读数</p>
              <p className={`mt-2 text-2xl font-semibold tracking-tight ${toneText[regimeSummary.tone]}`}>
                {regimeSummary.label}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {regimeSummary.body}
              </p>
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href={chatHref}
                className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm font-medium text-primary transition hover:border-primary hover:bg-primary/15"
              >
                问现在阵眼
                <ArrowUpRight className="h-4 w-4" />
              </Link>
              <Link
                href="/macro"
                className="inline-flex items-center gap-1.5 rounded-md border border-border/50 px-3 py-2 text-sm font-medium text-muted-foreground transition hover:border-primary/40 hover:text-primary"
              >
                完整 Macro
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </header>

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)]">
        <DecisionPathRail />
        <IndicatorFocusTable items={focusIndicators} loading={indicatorsLoading} />
      </div>

      <section className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <FrameworkSummary
          title="什么时候会转向乐观"
          icon={<CheckCircle2 className="h-4 w-4" />}
          items={detail.bull_conditions.map((item) => item.text)}
          tone="supportive"
        />
        <FrameworkSummary
          title="最容易误读的地方"
          icon={<AlertTriangle className="h-4 w-4" />}
          items={detail.misreadings.map((item) => item.text)}
          tone="watch"
        />
      </section>

      <EvidenceSections detail={detail} username={username} />
    </div>
  );
}

function FrameworkTag({ label }: { label: string }) {
  return (
    <span className="rounded-md border border-primary/25 bg-primary/10 px-2.5 py-1 text-sm font-medium text-primary">
      {label}
    </span>
  );
}

function DecisionPathRail() {
  const steps = [
    {
      number: '01',
      icon: <Search className="h-4 w-4" />,
      title: '先找阵眼',
      body: '流动性、政策、地缘、产业基本面，先判断哪个变量在主导。',
    },
    {
      number: '02',
      icon: <GitBranch className="h-4 w-4" />,
      title: '再定级别',
      body: '小调整、中级调整、大级别冲击分开处理，不把所有回撤都当大顶。',
    },
    {
      number: '03',
      icon: <Gauge className="h-4 w-4" />,
      title: '只认硬证据',
      body: '准备金、TGA、RRP、SOFR、信用利差和 VIX 必须给出信号。',
    },
    {
      number: '04',
      icon: <LineChart className="h-4 w-4" />,
      title: '最后做判断',
      body: '基本面没破时，宏观逆风更多是杀估值；杀到位才可能变机会。',
    },
  ];

  return (
    <section className="rounded-lg border border-border/45 bg-card/20 p-4 md:p-5">
      <div>
        <p className="font-data text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Decision Path
        </p>
        <h3 className="mt-1 text-xl font-semibold tracking-tight text-foreground">
          四步就够
        </h3>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          这页只保留判断顺序，不展开成完整教程。
        </p>
      </div>
      <ol className="mt-5 space-y-4">
        {steps.map((step) => (
          <li key={step.number} className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-3">
            <div className="flex flex-col items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-md border border-primary/20 bg-primary/10 text-primary">
                {step.icon}
              </span>
              {step.number !== '04' ? <span className="h-full w-px bg-border/50" /> : null}
            </div>
            <div className="pb-1">
              <p className="font-data text-xs uppercase tracking-[0.15em] text-muted-foreground">
                {step.number}
              </p>
              <h4 className="mt-1 text-base font-semibold text-foreground">{step.title}</h4>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function IndicatorFocusTable({
  items,
  loading,
}: {
  items: IndicatorCardData[];
  loading: boolean;
}) {
  return (
    <section className="rounded-lg border border-border/45 bg-card/20 p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-data text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Key Signals
          </p>
          <h3 className="mt-1 text-xl font-semibold tracking-tight text-foreground">
            只看 6 个读数
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            先看是否从杀估值升级成融资或信用风险；其余证据放在下方折叠区。
          </p>
        </div>
        <Link
          href="/macro"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition hover:text-primary"
        >
          完整仪表盘
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>
      {loading ? (
        <div className="mt-6 rounded-md border border-border/40 bg-background/35 p-6 text-center text-sm text-muted-foreground">
          正在读取宏观指标...
        </div>
      ) : (
        <div className="mt-5 divide-y divide-border/40">
          {items.map((item) => (
            <IndicatorFocusRow key={item.key} item={item} />
          ))}
        </div>
      )}
    </section>
  );
}

function IndicatorFocusRow({ item }: { item: IndicatorCardData }) {
  return (
    <div className="grid gap-3 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-foreground">{item.label}</p>
          <span className="font-data text-xs uppercase tracking-[0.12em] text-muted-foreground">
            {item.source}
          </span>
        </div>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.frankRead}</p>
      </div>
      <div className="flex items-center justify-between gap-3 md:justify-end">
        <p className="font-data text-xl font-semibold tabular-nums text-foreground">
          {item.value}
        </p>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border border-current/20 px-2 py-1 text-xs font-medium ${toneText[item.tone]}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${toneDot[item.tone]}`} />
          {item.status}
        </span>
      </div>
      {item.change || item.date ? (
        <p className="font-data text-xs uppercase tracking-[0.12em] text-muted-foreground md:col-span-2">
          {item.change ?? (item.date ? formatDate(item.date) : '')}
        </p>
      ) : null}
    </div>
  );
}

function FrameworkSummary({
  title,
  icon,
  items,
  tone,
}: {
  title: string;
  icon: ReactNode;
  items: string[];
  tone: 'supportive' | 'watch';
}) {
  const fallback = tone === 'supportive' ? '等待救市动作、估值回落和基本面确认。' : '不要把单点消息直接翻译成仓位动作。';
  return (
    <section className="rounded-lg border border-border/45 bg-card/20 p-4">
      <div className="flex items-center gap-2">
        <span className={`grid h-8 w-8 place-items-center rounded-md ${toneBg[tone]} ${toneText[tone]}`}>
          {icon}
        </span>
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
      </div>
      <ul className="mt-3 space-y-2">
        {(items.length > 0 ? items : [fallback]).slice(0, 3).map((item, index) => (
          <li key={index} className="flex gap-2 text-sm leading-relaxed text-foreground/85">
            <span className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${toneDot[tone]}`} />
            <span>{stripLeadingMarker(item)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function EvidenceSections({ detail, username }: Props) {
  return (
    <section className="mt-6 rounded-lg border border-border/45 bg-card/20 p-4 md:p-5">
      <div>
        <p className="font-data text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Research Trail
        </p>
        <h3 className="mt-1 text-xl font-semibold tracking-tight text-foreground">
          证据留在这里，不挤占首屏
        </h3>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          需要追溯原文、完整指标清单或框架边界时再展开。
        </p>
      </div>

      <div className="mt-4 divide-y divide-border/40">
        {detail.core_questions.length > 0 ? (
          <EvidenceDisclosure
            eyebrow="Framework Questions"
            title="进入宏观判断前先问什么"
            help={`${detail.core_questions.length} 个核心问题`}
          >
            <ol className="space-y-1">
              {detail.core_questions.map((q, i) => (
                <ExpandableRule
                  key={i}
                  text={q.text}
                  evidence={q.evidence}
                  askPrefix="详细聊聊他在追问的问题："
                  username={username}
                  leftAdorn={
                    <span className="grid h-6 w-6 place-items-center rounded-full border border-primary/35 bg-primary/10 font-data text-xs tabular-nums text-primary">
                      {i + 1}
                    </span>
                  }
                />
              ))}
            </ol>
          </EvidenceDisclosure>
        ) : null}

        {detail.signals.length > 0 ? (
          <EvidenceDisclosure
            eyebrow="Evidence Map"
            title="原框架里列出的硬指标"
            help={`${detail.signals.length} 条完整指标清单`}
          >
            <ul className="grid gap-1 lg:grid-cols-2">
              {detail.signals.map((s, i) => (
                <ExpandableRule
                  key={i}
                  text={s.text}
                  evidence={s.evidence}
                  askPrefix="他追踪的这个数据现在什么状态："
                  username={username}
                  leftAdorn={<Search className="mt-1 h-4 w-4 text-primary/70" />}
                />
              ))}
            </ul>
          </EvidenceDisclosure>
        ) : null}

        {(detail.veto.length > 0 || detail.misreadings.length > 0) ? (
          <EvidenceDisclosure
            eyebrow="Guardrails"
            title="使用这套框架时最容易踩的坑"
            help="边界条件和常见误读"
          >
            <div className="grid gap-4 lg:grid-cols-2">
              {detail.veto.length > 0 ? (
                <RuleColumn
                  title="他不会这样下注"
                  items={detail.veto}
                  askPrefix="他为什么不碰这条："
                  username={username}
                />
              ) : null}
              {detail.misreadings.length > 0 ? (
                <RuleColumn
                  title="常见误读"
                  items={detail.misreadings}
                  askPrefix="他纠正这个常见误解："
                  username={username}
                  destructive
                />
              ) : null}
            </div>
          </EvidenceDisclosure>
        ) : null}

        {detail.rep_tweets.length > 0 ? (
          <EvidenceDisclosure
            eyebrow="Original Tweets"
            title="代表观点"
            help={`共 ${detail.rep_tweets.length} 条原文，默认显示前 4 条`}
          >
            <div className="divide-y divide-border/40">
              {detail.rep_tweets.slice(0, 4).map((tweet) => (
                <TweetFeedCard
                  key={tweet.id}
                  item={{
                    id: tweet.id,
                    text: tweet.text,
                    created_at: tweet.created_at,
                    url: tweet.url,
                    like_count: tweet.like_count,
                    retweet_count: tweet.retweet_count,
                    reply_count: tweet.reply_count,
                    tweet_type: tweet.tweet_type,
                    tickers: tweet.tickers,
                    sectors: [],
                    reply_kind: tweet.reply_kind ?? null,
                  }}
                />
              ))}
            </div>
          </EvidenceDisclosure>
        ) : null}

        {detail.full_body ? (
          <EvidenceDisclosure
            eyebrow="Full Framework"
            title="完整框架原文"
            help="保留原始蒸馏文本，便于审计"
          >
            <pre className="mt-4 whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-foreground/85">
              {detail.full_body}
            </pre>
          </EvidenceDisclosure>
        ) : null}
      </div>
    </section>
  );
}

function EvidenceDisclosure({
  eyebrow,
  title,
  help,
  children,
}: {
  eyebrow: string;
  title: string;
  help?: string;
  children: ReactNode;
}) {
  return (
    <details className="group py-4">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4 transition hover:text-primary [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="font-data text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {eyebrow}
          </span>
          <span className="mt-1 block text-base font-semibold tracking-tight text-foreground">
            {title}
          </span>
          {help ? <span className="mt-1 block text-sm text-muted-foreground">{help}</span> : null}
        </span>
        <span className="shrink-0 rounded-md border border-border/50 px-2 py-1 text-xs font-medium text-muted-foreground transition group-open:border-primary/30 group-open:text-primary">
          <span className="group-open:hidden">展开</span>
          <span className="hidden group-open:inline">收起</span>
        </span>
      </summary>
      <div className="mt-4">{children}</div>
    </details>
  );
}

function RuleColumn({
  title,
  items,
  askPrefix,
  username,
  destructive,
}: {
  title: string;
  items: { text: string; evidence: KolSectorV3Detail['veto'][number]['evidence'] }[];
  askPrefix: string;
  username: string;
  destructive?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border/45 bg-background/45 p-3">
      <p className="mb-2 text-sm font-medium text-foreground">{title}</p>
      <ul className="space-y-1">
        {items.map((item, index) => (
          <ExpandableRule
            key={index}
            text={stripLeadingMarker(item.text)}
            evidence={item.evidence}
            askPrefix={askPrefix}
            username={username}
            variant={destructive ? 'destructive' : 'default'}
            leftAdorn={
              destructive ? (
                <AlertTriangle className="mt-1 h-4 w-4 text-destructive/70" />
              ) : (
                <ShieldAlert className="mt-1 h-4 w-4 text-muted-foreground" />
              )
            }
          />
        ))}
      </ul>
    </div>
  );
}

function pickFocusIndicators(groups: IndicatorGroup[]): IndicatorCardData[] {
  const byKey = new Map<string, IndicatorCardData>();
  groups.forEach((group) => {
    group.items.forEach((item) => {
      byKey.set(item.key, item);
    });
  });
  return FOCUS_INDICATOR_KEYS.map((key) => byKey.get(key)).filter(
    (item): item is IndicatorCardData => Boolean(item),
  );
}

function summarizeRegime(items: IndicatorCardData[]): RegimeSummary {
  const available = items.filter((item) => item.value !== 'N/A');
  const stressCount = available.filter((item) => item.tone === 'stress').length;
  const watchCount = available.filter((item) => item.tone === 'watch').length;
  const supportiveCount = available.filter((item) => item.tone === 'supportive').length;

  if (available.length < 3) {
    return {
      label: '数据仍不完整',
      body: '先别急着下宏观结论。Frank 的框架要求至少看到流动性、融资和信用三类信号同时给出方向。',
      tone: 'neutral',
    };
  }

  if (stressCount >= 2) {
    return {
      label: '系统性压力升温',
      body: '多个关键读数进入压力区，重点看融资压力和信用利差是否继续扩散。',
      tone: 'stress',
    };
  }

  if (stressCount >= 1 || watchCount >= 2) {
    return {
      label: '宏观逆风，需要验证',
      body: '有压力信号，但还不能直接翻译成减仓。下一步看它是否从杀估值升级成杀逻辑。',
      tone: 'watch',
    };
  }

  if (supportiveCount >= 2) {
    return {
      label: '压力可控',
      body: '当前更像估值和情绪层面的扰动。只要信用和融资没有共振恶化，仍要回到基本面判断。',
      tone: 'supportive',
    };
  }

  return {
    label: '中性观察',
    body: '读数没有给出单边结论，适合保持框架跟踪，不用把单条宏观新闻直接变成仓位动作。',
    tone: 'neutral',
  };
}

function buildIndicatorGroups({
  metrics,
  globalMetrics,
  economy,
  inflation,
  sentiment,
  tenYear,
}: {
  metrics: LiquidityMetrics | null;
  globalMetrics: GlobalLiquidityMetrics | null;
  economy: EconomicFundamentalsResponse | null;
  inflation: EconomicFundamentalsResponse | null;
  sentiment: EconomicFundamentalsResponse | null;
  tenYear: number | null;
}): IndicatorGroup[] {
  const hyOas = findIndicator(economy, 'BAMLH0A0HYM2');
  const yieldCurve = findIndicator(economy, 'T10Y2Y');
  const cpi = findIndicator(inflation, 'CPIAUCSL');
  const corePce = findIndicator(inflation, 'PCEPILFE');
  const vix = findIndicator(sentiment, 'VIX');
  const fearGreed = sentiment?.data.sub_dimensions.find((dim) => dim.name === 'cnn_indicators')?.score;

  return [
    {
      id: 'liquidity-core',
      title: '阵眼一：市场里的水位',
      description: 'Frank 会先看流动性是不是从“紧”升级到“钱荒”。',
      items: [
        reservesCard(metrics?.reserves ?? null),
        tgaCard(metrics?.tga ?? null),
        rrpCard(metrics?.rrp ?? null),
        netLiquidityCard(metrics?.net_liquidity ?? null),
      ],
    },
    {
      id: 'funding-stress',
      title: '阵眼二：融资压力有没有失控',
      description: '单个宏观利空不够，短端融资压力才是升级信号。',
      items: [
        fundingSpreadCard(metrics?.sofr ?? null, metrics?.effr ?? null),
        nfciCard(metrics?.nfci ?? null),
      ],
    },
    {
      id: 'valuation-policy',
      title: '阵眼三：是杀估值还是杀逻辑',
      description: '通胀和利率决定估值压力，但不必然推翻产业逻辑。',
      items: [
        tenYearCard(tenYear),
        inflationCard(cpi, corePce),
        yieldCurveCard(yieldCurve),
      ],
    },
    {
      id: 'systemic-risk',
      title: '阵眼四：有没有系统性冲击',
      description: '只有信用、情绪和全球流动性一起恶化，风险级别才会抬升。',
      items: [
        creditCard(hyOas),
        vixCard(vix),
        fearGreedCard(fearGreed ?? null),
        globalLiquidityCard(globalMetrics?.global_liquidity.value ?? null, globalMetrics?.global_liquidity.date ?? null),
        usdJpyCard(globalMetrics?.fx_rates?.usdjpy ?? null),
      ],
    },
  ];
}

function reservesCard(metric: LiquidityMetric | null): IndicatorCardData {
  const value = valueToBillions(metric);
  let tone: Tone = 'neutral';
  let status = '无数据';
  if (value != null) {
    if (value >= 3200) {
      tone = 'supportive';
      status = '充裕';
    } else if (value >= 3000) {
      tone = 'watch';
      status = '临界';
    } else {
      tone = 'stress';
      status = '紧张';
    }
  }
  return {
    key: 'reserves',
    label: '银行准备金',
    value: metric ? formatLiquidityValue(metric.value, metric.units) : 'N/A',
    date: metric?.date,
    tone,
    status,
    source: 'WRESBAL',
    change: formatMetricChange(metric),
    frankRead: '3.0T 附近是充裕到紧张的分界；重新回到 3.2T 以上，才更像过剩流动性。',
  };
}

function tgaCard(metric: LiquidityMetric | null): IndicatorCardData {
  const value = valueToBillions(metric);
  let tone: Tone = 'neutral';
  let status = '无数据';
  if (value != null) {
    if (value >= 1000) {
      tone = 'stress';
      status = '抽水';
    } else if (value >= 700) {
      tone = 'watch';
      status = '偏高';
    } else {
      tone = 'supportive';
      status = '释放';
    }
  }
  return {
    key: 'tga',
    label: 'TGA 财政部账户',
    value: metric ? formatLiquidityValue(metric.value, metric.units) : 'N/A',
    date: metric?.date,
    tone,
    status,
    source: 'WDTGAL',
    change: formatMetricChange(metric),
    frankRead: 'TGA 上升相当于财政部从市场抽水；下降则把现金重新释放回银行体系。',
  };
}

function rrpCard(metric: LiquidityMetric | null): IndicatorCardData {
  const value = valueToBillions(metric);
  let tone: Tone = 'neutral';
  let status = '无数据';
  if (value != null) {
    if (value < 50) {
      tone = 'stress';
      status = '缓冲少';
    } else if (value < 250) {
      tone = 'watch';
      status = '接近耗尽';
    } else {
      tone = 'supportive';
      status = '有缓冲';
    }
  }
  return {
    key: 'rrp',
    label: 'ON RRP 缓冲垫',
    value: metric ? formatLiquidityValue(metric.value, metric.units) : 'N/A',
    date: metric?.date,
    tone,
    status,
    source: 'RRPONTSYD',
    change: formatMetricChange(metric),
    frankRead: 'RRP 接近 0 说明 QT 的缓冲垫被消耗，之后准备金压力会更直接地传导。',
  };
}

function netLiquidityCard(metric: LiquidityMetric | null): IndicatorCardData {
  const change = metric?.change;
  let tone: Tone = 'neutral';
  let status = '无数据';
  if (change != null) {
    if (change > 0) {
      tone = 'supportive';
      status = '回升';
    } else if (change > -1) {
      tone = 'watch';
      status = '走平';
    } else {
      tone = 'stress';
      status = '收缩';
    }
  }
  return {
    key: 'net-liquidity',
    label: '净流动性',
    value: metric ? formatLiquidityValue(metric.value, metric.units) : 'N/A',
    date: metric?.date,
    tone,
    status,
    source: 'WALCL - TGA - RRP',
    change: formatMetricChange(metric),
    frankRead: '这是宏观水位的总账。趋势比单点更重要，连续回升会削弱宏观逆风。',
  };
}

function fundingSpreadCard(sofr: LiquidityMetric | null, effr: LiquidityMetric | null): IndicatorCardData {
  const spreadBps = sofr?.value != null && effr?.value != null ? (sofr.value - effr.value) * 100 : null;
  let tone: Tone = 'neutral';
  let status = '无数据';
  if (spreadBps != null) {
    if (spreadBps > 25) {
      tone = 'stress';
      status = '警报';
    } else if (spreadBps > 10) {
      tone = 'watch';
      status = '走阔';
    } else {
      tone = 'supportive';
      status = '稳定';
    }
  }
  return {
    key: 'sofr-effr',
    label: 'SOFR - EFFR',
    value: spreadBps != null ? `${signed(spreadBps, 0)} bps` : 'N/A',
    date: sofr?.date ?? effr?.date,
    tone,
    status,
    source: 'SOFR / EFFR',
    frankRead: '利差扩大代表回购市场融资成本上行；突破走廊才接近钱荒级别。',
  };
}

function nfciCard(metric: LiquidityMetric | null): IndicatorCardData {
  const value = metric?.value;
  let tone: Tone = 'neutral';
  let status = '无数据';
  if (value != null) {
    if (value > 0.5) {
      tone = 'stress';
      status = '收紧';
    } else if (value > 0) {
      tone = 'watch';
      status = '偏紧';
    } else {
      tone = 'supportive';
      status = '宽松';
    }
  }
  return {
    key: 'nfci',
    label: 'NFCI 金融状况',
    value: value != null ? value.toFixed(2) : 'N/A',
    date: metric?.date,
    tone,
    status,
    source: 'NFCI',
    change: formatMetricChange(metric),
    frankRead: 'NFCI 为正说明金融条件开始收紧；如果和短端融资压力共振，需要提高风险级别。',
  };
}

function tenYearCard(value: number | null): IndicatorCardData {
  let tone: Tone = 'neutral';
  let status = '无数据';
  if (value != null) {
    if (value >= 5) {
      tone = 'stress';
      status = '压估值';
    } else if (value >= 4.5) {
      tone = 'watch';
      status = '偏高';
    } else {
      tone = 'neutral';
      status = '观察';
    }
  }
  return {
    key: '10y',
    label: '10Y 美债收益率',
    value: value != null ? `${value.toFixed(2)}%` : 'N/A',
    tone,
    status,
    source: 'DGS10',
    frankRead: '长端利率主要影响估值折现率；它更像杀估值变量，不等于产业逻辑破裂。',
  };
}

function inflationCard(cpi: RiskIndicator | null, corePce: RiskIndicator | null): IndicatorCardData {
  const value = cpi?.value ?? null;
  let tone: Tone = 'neutral';
  let status = '无数据';
  if (value != null) {
    if (value > 3.5) {
      tone = 'stress';
      status = '限制';
    } else if (value > 2.5) {
      tone = 'watch';
      status = '偏高';
    } else {
      tone = 'supportive';
      status = '降温';
    }
  }
  return {
    key: 'inflation',
    label: 'CPI / 核心 PCE',
    value: value != null ? `${value.toFixed(1)}%` : 'N/A',
    date: cpi?.date ?? corePce?.date,
    tone,
    status,
    source: 'CPIAUCSL / PCEPILFE',
    change: cpi?.change != null ? `CPI ${signed(cpi.change, 2)}` : null,
    frankRead: '通胀决定联储是否有宽松空间；但 Frank 不会单靠“要降息”去预测大顶大底。',
  };
}

function yieldCurveCard(indicator: RiskIndicator | null): IndicatorCardData {
  const value = indicator?.value ?? null;
  let tone: Tone = 'neutral';
  let status = '无数据';
  if (value != null) {
    if (value < 0) {
      tone = 'watch';
      status = '倒挂';
    } else if (value < 0.5) {
      tone = 'neutral';
      status = '平坦';
    } else {
      tone = 'supportive';
      status = '正常';
    }
  }
  return {
    key: 'yield-curve',
    label: '10Y - 2Y 利差',
    value: value != null ? `${signed(value, 2)}%` : 'N/A',
    date: indicator?.date,
    tone,
    status,
    source: 'T10Y2Y',
    change: indicator?.change != null ? signed(indicator.change, 2) : null,
    frankRead: '收益率曲线帮助识别经济周期压力，但需要和信用、就业一起看，不能单独下结论。',
  };
}

function creditCard(indicator: RiskIndicator | null): IndicatorCardData {
  const value = indicator?.value ?? null;
  let tone: Tone = 'neutral';
  let status = '无数据';
  if (value != null) {
    if (value >= 8) {
      tone = 'stress';
      status = '危机';
    } else if (value >= 5) {
      tone = 'watch';
      status = '承压';
    } else {
      tone = 'supportive';
      status = '可控';
    }
  }
  return {
    key: 'hy-oas',
    label: '高收益债利差',
    value: value != null ? `${(value * 100).toFixed(0)} bps` : 'N/A',
    date: indicator?.date,
    tone,
    status,
    source: 'BAMLH0A0HYM2',
    change: indicator?.change != null ? `${signed(indicator.change * 100, 0)} bps` : null,
    frankRead: '信用利差是真风险的温度计。只有信用压力扩散，宏观叙事才更像系统性风险。',
  };
}

function vixCard(indicator: RiskIndicator | null): IndicatorCardData {
  const value = indicator?.value ?? null;
  let tone: Tone = 'neutral';
  let status = '无数据';
  if (value != null) {
    if (value >= 30) {
      tone = 'stress';
      status = '恐慌';
    } else if (value >= 20) {
      tone = 'watch';
      status = '升温';
    } else {
      tone = 'supportive';
      status = '平静';
    }
  }
  return {
    key: 'vix',
    label: 'VIX 波动率',
    value: value != null ? value.toFixed(1) : 'N/A',
    date: indicator?.date,
    tone,
    status,
    source: 'VIX',
    change: indicator?.change != null ? signed(indicator.change, 2) : null,
    frankRead: 'VIX 是恐慌温度，不是结论。恐慌若没有杀逻辑，反而可能制造上车窗口。',
  };
}

function fearGreedCard(scoreRaw: number | null): IndicatorCardData {
  const score = scoreRaw != null ? scoreRaw * 10 : null;
  let tone: Tone = 'neutral';
  let status = '无数据';
  if (score != null) {
    if (score <= 25) {
      tone = 'stress';
      status = '极恐';
    } else if (score <= 45) {
      tone = 'watch';
      status = '恐慌';
    } else if (score <= 75) {
      tone = 'neutral';
      status = '中性';
    } else {
      tone = 'watch';
      status = '贪婪';
    }
  }
  return {
    key: 'fear-greed',
    label: '恐惧贪婪指数',
    value: score != null ? `${score.toFixed(0)}/100` : 'N/A',
    tone,
    status,
    source: 'CNN Composite',
    frankRead: '情绪极端只说明定价拥挤。Frank 会继续追问：是情绪踩踏，还是基本面真的变了？',
  };
}

function globalLiquidityCard(value: number | null, date: string | null): IndicatorCardData {
  return {
    key: 'global-liquidity',
    label: '全球流动性指数',
    value: value != null ? formatCompactCurrencyFromBillions(value) : 'N/A',
    date,
    tone: 'neutral',
    status: '总账',
    source: 'Fed + ECB + BOJ - TGA - RRP',
    frankRead: '全球央行资产负债表决定外部水位，适合和美元、日元套利压力一起观察。',
  };
}

function usdJpyCard(value: number | null): IndicatorCardData {
  return {
    key: 'usdjpy',
    label: 'USD/JPY',
    value: value != null ? value.toFixed(2) : 'N/A',
    tone: 'neutral',
    status: '套利',
    source: 'FX',
    frankRead: '日元快速升值可能触发套利交易平仓；单点汇率不下结论，要看速度和风险资产共振。',
  };
}

function findIndicator(response: EconomicFundamentalsResponse | null, seriesId: string): RiskIndicator | null {
  if (!response?.success) return null;
  for (const dim of response.data.sub_dimensions) {
    const found = dim.indicators.find((indicator) => indicator.series_id === seriesId);
    if (found) return found;
  }
  return null;
}

function valueToBillions(metric: LiquidityMetric | null): number | null {
  if (!metric || metric.value == null) return null;
  const units = metric.units.toLowerCase();
  if (units.includes('million')) return metric.value / 1000;
  if (units.includes('billion')) return metric.value;
  return metric.value;
}

function formatMetricChange(metric: LiquidityMetric | null): string | null {
  if (!metric || metric.change == null) return null;
  return `周${signed(metric.change, 1)}%`;
}

function signed(value: number, digits: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`;
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
  });
}

function formatCompactCurrencyFromBillions(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1000) return `$${(value / 1000).toFixed(2)}T`;
  if (abs >= 1) return `$${value.toFixed(0)}B`;
  return `$${(value * 1000).toFixed(0)}M`;
}

function stripLeadingMarker(s: string): string {
  return s.replace(/^[\u274c\u2705\u26a0\ufe0f\s]+/, '').trim();
}
