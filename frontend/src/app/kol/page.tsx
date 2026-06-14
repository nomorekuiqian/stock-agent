import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  BrainCircuit,
  CandlestickChart,
  FileChartColumn,
  Layers,
  MessageCircleQuestion,
  Rss,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';

export const metadata: Metadata = {
  title: '博主研究室',
  description: '选择 Qinbafrank 或 Serenity 研究室，进入对应资料库、个股档案和 AI 研究助手。',
};

type RoomTone = 'emerald' | 'sky';

interface RoomModule {
  label: string;
  href: string;
  icon: LucideIcon;
}

interface Room {
  tone: RoomTone;
  name: string;
  handle: string;
  href: string;
  avatar: string;
  focus: string;
  body: string;
  status: string;
  note: string;
  modules: RoomModule[];
  bestFor: string[];
}

const ROOM_TONE: Record<RoomTone, { card: string; chip: string; icon: string; cta: string }> = {
  emerald: {
    card: 'border-primary/25 bg-primary/[0.035]',
    chip: 'border-primary/25 bg-primary/10 text-primary',
    icon: 'border-primary/25 bg-primary/[0.08] text-primary',
    cta: 'bg-primary text-primary-foreground hover:bg-primary/90',
  },
  sky: {
    card: 'border-sky-500/25 bg-sky-500/[0.035]',
    chip: 'border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300',
    icon: 'border-sky-500/25 bg-sky-500/[0.08] text-sky-700 dark:text-sky-300',
    cta: 'bg-sky-700 text-white hover:bg-sky-800 dark:bg-sky-500 dark:text-sky-950 dark:hover:bg-sky-400',
  },
};

const ROOMS: Room[] = [
  {
    tone: 'emerald',
    name: 'Qinbafrank 研究室',
    handle: '@qinbafrank',
    href: '/kol/qinbafrank',
    avatar: '/kol-avatars/qinbafrank.png',
    focus: 'AI 大趋势 / 宏观传导 / 公司推荐档案',
    body: '偏宏观权重排序、AI 基础设施重定价和行情规律。适合从大主线、公司案例和历史原文里复盘判断链。',
    status: 'Ultra 资料包',
    note: '包含精华库、板块观点、个股档案、全量原文和专属研究助手。',
    modules: [
      { label: '精华', href: '/kol/qinbafrank/highlights', icon: FileChartColumn },
      { label: '板块', href: '/kol/qinbafrank/sectors', icon: Layers },
      { label: '个股', href: '/kol/qinbafrank/stocks', icon: CandlestickChart },
      { label: '全量库', href: '/kol/qinbafrank/latest', icon: Rss },
      { label: '追问', href: '/research?agent=kol&persona=qinbafrank', icon: MessageCircleQuestion },
    ],
    bestFor: [
      '想学习完整框架和历史判断的人',
      '想把公司放回宏观与产业主线复盘的人',
      '需要用资料库追踪旧观点验证的人',
    ],
  },
  {
    tone: 'sky',
    name: 'Serenity 研究室',
    handle: '@aleabitoreddit',
    href: '/kol/serenity',
    avatar: '/kol-avatars/aleabitoreddit.png',
    focus: 'AI 半导体供应链 / 光通信 CPO / small-cap 高确信清单',
    body: '偏 AI capex 漏斗、底层瓶颈迁移和小盘供应链标的。适合沿客户需求往上游拆，找少数公司绕不过去的位置。',
    status: '供应链工作台',
    note: '不设精华库，入口集中在供应链地图、个股档案、内容库和研究助手。',
    modules: [
      { label: '供应链', href: '/kol/serenity/sectors', icon: Layers },
      { label: '个股', href: '/kol/serenity/stocks', icon: CandlestickChart },
      { label: '内容库', href: '/kol/serenity/latest', icon: Rss },
      { label: '追问', href: '/research?agent=kol&persona=aleabitoreddit', icon: BrainCircuit },
    ],
    bestFor: [
      '想看 AI 硬件瓶颈如何轮动的人',
      '想理解冷门供应链和小盘标的的人',
      '需要用原文证据校准 thesis 的人',
    ],
  },
];

export default function KolStudiosPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="border-b border-border/35 bg-[linear-gradient(135deg,rgba(16,185,129,0.045),transparent_46%,rgba(14,165,233,0.04))]">
        <div className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-16 lg:py-20">
          <div className="max-w-3xl">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-primary/80">
              博主研究室
            </p>
            <h1 className="mt-3 text-balance font-editorial text-4xl leading-tight md:text-5xl lg:text-6xl">
              选择一个研究视角
            </h1>
            <p className="mt-5 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground md:text-lg">
              每个研究室都把公开内容整理成可浏览、可追问、可持续跟踪的投研工作台。
            </p>
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            {ROOMS.map((room) => (
              <RoomCard key={room.name} room={room} />
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-14">
        <div className="grid gap-7 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)]">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-primary/80">
              怎么选择
            </p>
            <h2 className="mt-3 text-balance font-editorial text-3xl leading-tight md:text-4xl">
              先按问题选博主，再进入对应工具
            </h2>
            <p className="mt-4 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground">
              两个研究室共用同一套左侧导航和研究助手入口，但内容组织围绕各自方法论展开。
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <ChoiceCard
              title="想复盘大主线和公司案例"
              body="进入 Qinbafrank，看 AI、宏观、美股调整规律和公司推荐如何串成一条判断链。"
              href="/kol/qinbafrank"
            />
            <ChoiceCard
              title="想拆 AI 供应链瓶颈"
              body="进入 Serenity，看 capex 如何传到光通信、CPO、衬底材料和小盘供应链公司。"
              href="/kol/serenity"
            />
            <ChoiceCard
              title="想直接问一只股票"
              body="先选研究室，再用对应助手追问新闻、财报、估值位置和原文依据。"
              href="/research?agent=kol&persona=qinbafrank"
            />
            <ChoiceCard
              title="想看公开原文证据"
              body="两个研究室都保留内容库入口，回答只在命中原文时才标记为原文支持。"
              href="/kol/serenity/latest"
            />
          </div>
        </div>
      </section>

      <section className="border-y border-border/35 bg-card/[0.055]">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 md:grid-cols-[320px_minmax(0,1fr)] md:px-6 md:py-12">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-primary/80">
              使用边界
            </p>
            <h2 className="mt-3 text-balance font-editorial text-3xl leading-tight md:text-4xl">
              研究室不是本人发言
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              '基于公开内容整理',
              '研究助手不代表博主本人观点',
              '所有内容均不构成投资建议',
            ].map((item) => (
              <div
                key={item}
                className="flex min-h-[72px] items-center gap-3 rounded-lg border border-border/40 bg-background/55 px-4 py-3 text-sm leading-relaxed text-foreground"
              >
                <ShieldCheck className="h-4 w-4 shrink-0 text-primary/75" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

function RoomCard({ room }: { room: Room }) {
  const tone = ROOM_TONE[room.tone];

  return (
    <article className={`rounded-lg border p-5 shadow-sm shadow-black/5 ${tone.card}`}>
      <div className="flex items-start gap-4">
        <Image
          src={room.avatar}
          alt={`${room.name} 头像`}
          width={68}
          height={68}
          className="h-[68px] w-[68px] rounded-lg border border-border/45 bg-background/60 object-cover"
          priority
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-editorial text-2xl font-semibold leading-tight text-foreground">
              {room.name}
            </h2>
            <span className={`rounded-md border px-2 py-1 text-xs font-medium ${tone.chip}`}>
              {room.status}
            </span>
          </div>
          <p className="mt-1 font-data text-xs text-muted-foreground">{room.handle}</p>
          <p className="mt-3 text-sm font-medium leading-relaxed text-foreground">
            {room.focus}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {room.body}
          </p>
        </div>
      </div>

      <div className={`mt-5 grid gap-2 ${room.modules.length >= 5 ? 'sm:grid-cols-5' : 'sm:grid-cols-4'}`}>
        {room.modules.map((module) => (
          <Link
            key={module.label}
            href={module.href}
            className="group flex min-h-[58px] items-center gap-2 rounded-lg border border-border/40 bg-background/45 px-3 py-2 text-sm font-medium text-foreground transition hover:-translate-y-0.5 hover:border-primary/35 hover:bg-primary/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 motion-reduce:transform-none sm:flex-col sm:items-start sm:justify-center"
          >
            <module.icon className="h-4 w-4 text-muted-foreground transition group-hover:text-primary" strokeWidth={1.7} />
            <span>{module.label}</span>
          </Link>
        ))}
      </div>

      <div className="mt-5 grid gap-2 border-t border-border/35 pt-4">
        {room.bestFor.map((item) => (
          <div key={item} className="flex gap-2 text-sm leading-relaxed text-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary/75" />
            <span>{item}</span>
          </div>
        ))}
      </div>

      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        {room.note}
      </p>

      <Link
        href={room.href}
        className={`mt-5 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-medium transition active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 motion-reduce:transform-none ${tone.cta}`}
      >
        进入研究室
        <ArrowRight className="h-4 w-4" />
      </Link>
    </article>
  );
}

function ChoiceCard({
  title,
  body,
  href,
}: {
  title: string;
  body: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-lg border border-border/45 bg-card/25 p-4 transition hover:-translate-y-0.5 hover:border-primary/30 hover:bg-primary/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 motion-reduce:transform-none"
    >
      <h3 className="font-editorial text-xl font-semibold leading-snug text-foreground">
        {title}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {body}
      </p>
      <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
        查看
        <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5 motion-reduce:transform-none" />
      </span>
    </Link>
  );
}
