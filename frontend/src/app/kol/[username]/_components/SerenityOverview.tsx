'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  Archive,
  ArrowRight,
  BrainCircuit,
  CandlestickChart,
  CheckCircle2,
  ChevronRight,
  CircleSlash2,
  DatabaseZap,
  FileChartColumn,
  Layers,
  MessageCircleQuestion,
  Rss,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';

import {
  useKolCockpitHighConviction,
  useKolCockpitTickers,
} from '@/hooks/queries/use-kol-data';
import type {
  KolCockpitHighConvictionGroup,
  KolCockpitTickerSummary,
} from '@/lib/api';
import { formatStockPrice } from '@/lib/currency';

interface Props {
  username: string;
}

type Tone = 'emerald' | 'sky' | 'amber' | 'neutral';

const TONE_CLASS: Record<Tone, { card: string; icon: string; label: string }> = {
  emerald: {
    card: 'border-primary/25 bg-primary/[0.04]',
    icon: 'border-primary/25 bg-primary/[0.08] text-primary',
    label: 'text-primary',
  },
  sky: {
    card: 'border-sky-500/25 bg-sky-500/[0.04]',
    icon: 'border-sky-500/25 bg-sky-500/[0.08] text-sky-700 dark:text-sky-300',
    label: 'text-sky-700 dark:text-sky-300',
  },
  amber: {
    card: 'border-amber-500/25 bg-amber-500/[0.045]',
    icon: 'border-amber-500/25 bg-amber-500/[0.08] text-amber-700 dark:text-amber-300',
    label: 'text-amber-700 dark:text-amber-300',
  },
  neutral: {
    card: 'border-border/45 bg-card/25',
    icon: 'border-border/45 bg-background/60 text-muted-foreground',
    label: 'text-muted-foreground',
  },
};

const RESEARCH_ENTRIES: Array<{
  icon: LucideIcon;
  tone: Tone;
  title: string;
  eyebrow: string;
  href: (username: string) => string;
}> = [
  {
    icon: Layers,
    tone: 'emerald',
    title: '供应链地图',
    eyebrow: '瓶颈环节',
    href: (username) => `/kol/${username}/sectors`,
  },
  {
    icon: FileChartColumn,
    tone: 'sky',
    title: '个股档案',
    eyebrow: '高确信标的',
    href: (username) => `/kol/${username}/stocks`,
  },
  {
    icon: Rss,
    tone: 'neutral',
    title: '内容库',
    eyebrow: '原文证据',
    href: (username) => `/kol/${username}/latest`,
  },
  {
    icon: MessageCircleQuestion,
    tone: 'emerald',
    title: '研究助手',
    eyebrow: '可追问',
    href: (username) => `/research?agent=kol&persona=${encodeURIComponent(username)}`,
  },
];

const INSIDE_ROOM: Array<{
  icon: LucideIcon;
  tone: Tone;
  eyebrow: string;
  title: string;
  body: string;
}> = [
  {
    icon: Layers,
    tone: 'emerald',
    eyebrow: '供应链',
    title: '瓶颈地图',
    body: '把 Mag7 capex、neocloud、光通信、CPO 和衬底材料放进同一条传导链。',
  },
  {
    icon: FileChartColumn,
    tone: 'sky',
    eyebrow: '个股',
    title: '高确信档案',
    body: '按提及频次、覆盖度、公司解码和价格数据整理 Serenity 的核心标的。',
  },
  {
    icon: DatabaseZap,
    tone: 'amber',
    eyebrow: '证据',
    title: '原文内容库',
    body: '保留可检索的公开原文，不把碎片内容包装成没有来源的结论。',
  },
  {
    icon: BrainCircuit,
    tone: 'neutral',
    eyebrow: '助手',
    title: '专属研究助手',
    body: '带着她的供应链漏斗追问新闻、财报、公司 thesis 和风险边界。',
  },
];

const FIT_SECTIONS: Array<{
  icon: LucideIcon;
  itemIcon: LucideIcon;
  tone: Tone;
  title: string;
  items: string[];
}> = [
  {
    icon: Archive,
    itemIcon: CheckCircle2,
    tone: 'emerald',
    title: '你会得到什么',
    items: [
      'Serenity 的 AI 半导体供应链研究工作台。',
      '供应链环节、核心公司、原文证据和研究助手。',
      '从 capex 需求往上游瓶颈拆解的阅读路径。',
      '不设精华库，重点保留可验证的内容入口。',
    ],
  },
  {
    icon: CandlestickChart,
    itemIcon: CheckCircle2,
    tone: 'sky',
    title: '适合谁',
    items: [
      '想理解 AI 硬件供应链瓶颈迁移的人。',
      '关注光通信、CPO、衬底材料和小盘 niche 公司的人。',
      '需要用公开原文校准单只股票 thesis 的人。',
    ],
  },
  {
    icon: CircleSlash2,
    itemIcon: CircleSlash2,
    tone: 'neutral',
    title: '不适合谁',
    items: [
      '想要确定买卖点的人。',
      '想要短线交易信号的人。',
      '想把研究助手当成 Serenity 本人观点的人。',
      '不愿意回到原文证据验证的人。',
    ],
  },
];

const EXAMPLES = [
  '按 Serenity 的供应链漏斗，现在瓶颈卡在哪一环？',
  'AXTI 的 thesis 应该看哪些验证变量？',
  '光通信和 CPO 的机会如何从 capex 传导过来？',
  '她高确信的小盘标的里，哪些风险最容易被忽略？',
  '这条财报新闻会改变原来的供应链判断吗？',
];

const FUNNEL_LAYERS: { key: string; label: string; sectorKey: string }[] = [
  { key: 'mag7', label: 'Mag7 资本开支', sectorKey: 'ai-infrastructure-mag7' },
  { key: 'neocloud', label: 'Neocloud', sectorKey: 'neocloud' },
  { key: 'optics', label: '光通信', sectorKey: 'optical-transceivers' },
  { key: 'photonics', label: '光子学 / CPO', sectorKey: 'photonics-and-cpo' },
  { key: 'substrates', label: '衬底材料', sectorKey: 'substrates' },
];

const FUNNEL_VIEWPOINTS = [
  '先判断 Mag7 / neocloud capex 是否继续兑现，再沿链路向上游找瓶颈。',
  '当 GPU 供给不再是唯一约束时，重点转向光通信、CPO、HBM 和衬底材料。',
  '小盘标的必须回到客户量产、订单节奏、RPO 和机构流向验证。',
];

export default function SerenityOverview({ username }: Props) {
  const hcQ = useKolCockpitHighConviction(username);
  const tickersQ = useKolCockpitTickers(username);
  const tickers = tickersQ.data?.tickers ?? [];
  const groups = hcQ.data?.groups ?? [];
  const topTickers = tickers.slice(0, 6);

  return (
    <div className="min-h-screen bg-background font-reading text-foreground">
      <section className="relative overflow-hidden border-b border-border/35 bg-[linear-gradient(135deg,rgba(16,185,129,0.045),transparent_46%,rgba(14,165,233,0.045))]">
        <div className="mx-auto grid max-w-6xl gap-9 px-4 py-12 md:grid-cols-[minmax(0,1fr)_390px] md:px-6 md:py-16 lg:py-20">
          <div className="flex flex-col justify-center">
            <Link
              href="/kol"
              className="mb-4 inline-flex min-h-[36px] w-fit items-center gap-2 rounded-lg border border-border/45 bg-card/25 px-3 text-sm font-medium text-muted-foreground transition hover:border-primary/30 hover:bg-primary/[0.035] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
            >
              所有博主研究室
              <ArrowRight className="h-4 w-4" />
            </Link>
            <h1 className="max-w-3xl text-balance font-editorial text-4xl leading-tight text-foreground md:text-5xl lg:text-6xl">
              Serenity 研究室
            </h1>
            <p className="mt-5 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground md:text-lg">
              AI 半导体供应链、光通信/CPO、衬底材料和 small-cap 个股档案，放进同一个可追问的研究工作台。
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href={`/kol/${username}/sectors`}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-primary/90 px-5 py-3 text-sm font-medium text-primary-foreground transition hover:bg-primary active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 motion-reduce:transform-none"
              >
                进入供应链地图
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href={`/research?agent=kol&persona=${encodeURIComponent(username)}`}
                className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-border/50 bg-card/20 px-5 py-3 text-sm font-medium text-foreground transition hover:border-primary/25 hover:bg-primary/[0.035] active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 motion-reduce:transform-none"
              >
                打开研究助手
              </Link>
            </div>

            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary/75" />
                基于公开内容整理
              </span>
              <span className="inline-flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary/75" />
                研究助手不代表本人观点
              </span>
              <span className="inline-flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary/75" />
                非投资建议
              </span>
            </div>
          </div>

          <SerenitySignalCard
            username={username}
            groups={groups}
            groupsLoading={hcQ.isLoading}
            tickers={topTickers}
            tickersLoading={tickersQ.isLoading}
          />

          <section
            id="serenity-lab-nav"
            aria-labelledby="serenity-lab-nav-title"
            className="order-2 scroll-mt-24 border-t border-border/35 pt-6 md:order-3 md:col-span-2"
          >
            <div className="flex items-end justify-between gap-4">
              <h2 id="serenity-lab-nav-title" className="font-editorial text-2xl leading-snug text-foreground md:text-3xl">
                研究室入口
              </h2>
              <p className="hidden text-sm leading-relaxed text-muted-foreground md:block">
                不设精华库，先从供应链和个股进入。
              </p>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {RESEARCH_ENTRIES.map((item) => (
                <ResearchEntryLink key={item.title} item={item} username={username} />
              ))}
            </div>
          </section>
        </div>
      </section>

      <section className="mx-auto max-w-6xl scroll-mt-24 px-4 py-12 md:px-6 md:py-14">
        <div className="grid gap-7 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-primary/80">
              研究室内容
            </p>
            <h2 className="mt-3 max-w-xl text-balance font-editorial text-3xl leading-tight md:text-4xl">
              这里不是单个聊天框，而是一套供应链研究路径
            </h2>
            <p className="mt-4 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground">
              Serenity 的优势在于把 AI 需求往硬件瓶颈拆。首页先给路径，再给证据和追问入口。
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {INSIDE_ROOM.map((item) => (
              <CapabilityCard key={item.title} item={item} />
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-border/35 bg-card/[0.055]">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 md:grid-cols-[320px_minmax(0,1fr)] md:px-6 md:py-12">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-primary/80">
              供应链漏斗
            </p>
            <h2 className="mt-3 text-balance font-editorial text-3xl leading-tight md:text-4xl">
              钱从 AI 需求流向上游瓶颈
            </h2>
          </div>
          <div className="rounded-lg border border-border/45 bg-background/55 p-4 md:p-5">
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
              {FUNNEL_LAYERS.map((layer, i) => (
                <span key={layer.key} className="flex items-center gap-1.5">
                  <Link
                    href={`/kol/${username}/sectors?key=${encodeURIComponent(layer.sectorKey)}`}
                    className="rounded-lg border border-primary/25 bg-primary/[0.06] px-3 py-2 text-sm font-medium text-foreground transition hover:border-primary/55 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
                  >
                    {layer.label}
                  </Link>
                  {i < FUNNEL_LAYERS.length - 1 && (
                    <ChevronRight className="h-4 w-4 text-muted-foreground/70" aria-hidden />
                  )}
                </span>
              ))}
            </div>
            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              这条链路解释 Serenity 的核心交互：不是先问某只票贵不贵，而是先判断当前 AI capex 的真实瓶颈在哪里。
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {FUNNEL_VIEWPOINTS.map((question) => (
                <p
                  key={question}
                  className="rounded-lg border border-border/40 bg-card/25 px-3 py-2 text-sm leading-relaxed text-foreground"
                >
                  {question}
                </p>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-border/35 bg-background">
        <div className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-14">
          <div className="max-w-3xl">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-primary/80">
              适合与不适合
            </p>
            <h2 className="mt-3 text-balance font-editorial text-3xl leading-tight md:text-4xl">
              先说清楚它能做什么，也说清楚边界
            </h2>
            <p className="mt-4 text-pretty text-base leading-relaxed text-muted-foreground">
              这是一个围绕 Serenity 公开研究脉络整理的学习与研究工具，不是荐股服务、交易信号或收益承诺。
            </p>
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {FIT_SECTIONS.map((section) => (
              <FitSectionCard key={section.title} section={section} />
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-14">
        <div className="grid gap-6 md:grid-cols-[320px_minmax(0,1fr)]">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-primary/80">
              示例问题
            </p>
            <h2 className="mt-3 text-balance font-editorial text-3xl leading-tight md:text-4xl">
              直接问真实问题
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {EXAMPLES.map((question, index) => (
              <Link
                key={question}
                href={`/research?agent=kol&persona=${encodeURIComponent(username)}&q=${encodeURIComponent(question)}`}
                className="group flex min-h-[74px] items-center gap-3 rounded-lg border border-border/40 bg-card/25 px-4 py-3 transition hover:border-primary/30 hover:bg-primary/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
              >
                <span className="font-data text-xs text-primary/80">{String(index + 1).padStart(2, '0')}</span>
                <p className="flex-1 text-sm leading-relaxed text-foreground">{question}</p>
                <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary motion-reduce:transform-none" />
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function SerenitySignalCard({
  username,
  groups,
  groupsLoading,
  tickers,
  tickersLoading,
}: {
  username: string;
  groups: KolCockpitHighConvictionGroup[];
  groupsLoading: boolean;
  tickers: KolCockpitTickerSummary[];
  tickersLoading: boolean;
}) {
  const leadGroup = groups[0];
  const leadTicker = leadGroup?.tickers[0];

  return (
    <aside className="self-start rounded-lg border border-primary/25 bg-primary/[0.035] p-5 shadow-sm shadow-black/5">
      <div className="flex items-start gap-4">
        <Image
          src="/kol-avatars/aleabitoreddit.png"
          alt="Serenity"
          width={58}
          height={58}
          className="rounded-lg border border-border/45 bg-background/50"
          priority
        />
        <div>
          <p className="text-lg font-semibold text-foreground">Serenity研究室</p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            供应链工作台 + AI研究助手
          </p>
        </div>
      </div>

      <div className="mt-5 rounded-lg border border-border/35 bg-background/45 p-4">
        <p className="text-xs font-medium text-primary">当前高确信线索</p>
        {groupsLoading ? (
          <div className="mt-3">
            <MiniLoading rows={3} />
          </div>
        ) : leadGroup && leadTicker ? (
          <div className="mt-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-data text-2xl font-bold tabular-nums text-foreground">
                ${leadTicker.ticker}
              </span>
              <span className="rounded-md border border-primary/25 bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                {leadGroup.sector_label}
              </span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {leadTicker.thesis || leadGroup.sector_short}
            </p>
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">暂无高确信线索</p>
        )}
      </div>

      <div className="mt-5 grid gap-2">
        {tickersLoading ? (
          <MiniLoading rows={3} />
        ) : tickers.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无个股数据</p>
        ) : (
          tickers.slice(0, 4).map((ticker) => (
            <Link
              key={ticker.ticker}
              href={`/kol/${username}/stocks?ticker=${encodeURIComponent(ticker.ticker)}`}
              className="flex items-center justify-between gap-3 rounded-lg border border-border/35 bg-background/45 px-3 py-2 transition hover:border-primary/30 hover:bg-primary/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
            >
              <span className="min-w-0">
                <span className="block font-data text-sm font-semibold tabular-nums text-foreground">
                  ${ticker.ticker}
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {ticker.count} 次提及
                </span>
              </span>
              <PriceMini ticker={ticker.ticker} price={ticker.price} change={ticker.daily_change} />
            </Link>
          ))
        )}
      </div>
    </aside>
  );
}

function ResearchEntryLink({
  item,
  username,
}: {
  item: {
    icon: LucideIcon;
    tone: Tone;
    title: string;
    eyebrow: string;
    href: (username: string) => string;
  };
  username: string;
}) {
  const tone = TONE_CLASS[item.tone];

  return (
    <Link
      href={item.href(username)}
      className={`group flex min-h-[76px] items-center gap-3 rounded-lg border p-3 transition hover:-translate-y-0.5 hover:border-primary/35 hover:bg-primary/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 motion-reduce:transform-none ${tone.card}`}
    >
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${tone.icon}`}>
        <item.icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-semibold leading-tight text-foreground">
          {item.title}
        </span>
        <span className={`mt-1 block truncate text-xs font-medium ${tone.label}`}>
          {item.eyebrow}
        </span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary motion-reduce:transform-none" />
    </Link>
  );
}

function FitSectionCard({
  section,
}: {
  section: {
    icon: LucideIcon;
    itemIcon: LucideIcon;
    tone: Tone;
    title: string;
    items: string[];
  };
}) {
  const tone = TONE_CLASS[section.tone];

  return (
    <article className={`rounded-lg border p-5 ${tone.card}`}>
      <div className="flex items-center gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${tone.icon}`}>
          <section.icon className="h-4 w-4" />
        </div>
        <h3 className="font-editorial text-xl font-semibold text-foreground">{section.title}</h3>
      </div>

      <ul className="mt-5 grid gap-3">
        {section.items.map((item) => (
          <li key={item} className="flex gap-3 text-sm leading-relaxed text-foreground">
            <section.itemIcon className={`mt-0.5 h-4 w-4 shrink-0 ${tone.label}`} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

function CapabilityCard({
  item,
}: {
  item: {
    icon: LucideIcon;
    tone: Tone;
    eyebrow: string;
    title: string;
    body: string;
  };
}) {
  const tone = TONE_CLASS[item.tone];

  return (
    <article className={`rounded-lg border p-4 ${tone.card}`}>
      <div className="flex items-start gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${tone.icon}`}>
          <item.icon className="h-4 w-4" />
        </div>
        <div>
          <p className={`text-xs font-medium ${tone.label}`}>
            {item.eyebrow}
          </p>
          <h3 className="mt-1 font-editorial text-lg font-semibold text-foreground">{item.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
        </div>
      </div>
    </article>
  );
}

function MiniLoading({ rows }: { rows: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="space-y-2">
          <div className="h-3 w-1/3 rounded bg-muted/50" />
          <div className="h-4 w-[90%] rounded bg-muted/40" />
        </div>
      ))}
    </div>
  );
}

function PriceMini({
  ticker,
  price,
  change,
}: {
  ticker: string;
  price: number | null;
  change: number | null;
}) {
  if (price == null) return null;
  const hasChange = change != null;
  const up = (change ?? 0) > 0;
  const color = !hasChange
    ? 'text-muted-foreground'
    : up
      ? 'text-primary'
      : (change ?? 0) === 0
        ? 'text-muted-foreground'
        : 'text-destructive';
  const ChangeIcon =
    hasChange && (change ?? 0) !== 0 ? (up ? TrendingUp : TrendingDown) : null;
  return (
    <div className={`shrink-0 text-right font-data text-xs tabular-nums ${color}`}>
      <div>{formatStockPrice(price, ticker, undefined, { compactPrice: true })}</div>
      {hasChange && ChangeIcon ? (
        <div className="flex items-center justify-end gap-0.5">
          <ChangeIcon className="h-3 w-3" />
          {Math.abs(change!).toFixed(2)}%
        </div>
      ) : null}
    </div>
  );
}
