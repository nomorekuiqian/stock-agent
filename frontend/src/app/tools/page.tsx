import Link from 'next/link';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Macro Dashboard - TheMarketBrew',
  description:
    'Monitor liquidity, economic fundamentals, inflation, and market sentiment in one place.',
};

const sections = [
  {
    id: 'liquidity',
    number: '01',
    name: 'Liquidity',
    nameZh: '流动性环境',
    question: '市场上的钱是多了还是少了?',
    description:
      '美联储资产负债表、TGA、逆回购和净流动性实时监控',
    detail: 'WALCL / TGA / RRP / NFCI',
    href: '/tools/liquidity',
    available: true,
  },
  {
    id: 'economy',
    number: '02',
    name: 'Economic Fundamentals',
    nameZh: '经济基本面',
    question: '经济是在变好还是变差?',
    description:
      'GDP 增长、就业市场和信用状况三大子维度综合评估',
    detail: 'GDP / Unemployment / Yield Curve',
    href: '/tools/macro-risk/economy',
    available: true,
  },
  {
    id: 'inflation',
    number: '03',
    name: 'Inflation & Rates',
    nameZh: '通胀与利率',
    question: '物价压力如何? 美联储会怎么做?',
    description:
      'CPI、核心 PCE、盈亏平衡通胀率、联邦基金利率和国债收益率',
    detail: 'CPI / PCE / Fed Funds / Treasury',
    href: '/tools/macro-risk/inflation',
    available: false,
  },
  {
    id: 'sentiment',
    number: '04',
    name: 'Market Sentiment',
    nameZh: '市场情绪',
    question: '市场参与者现在是贪婪还是恐惧?',
    description:
      'VIX 波动率、Put/Call Ratio、市场宽度和信用利差变化',
    detail: 'VIX / Put-Call / Breadth / Spreads',
    href: '/tools/macro-risk/sentiment',
    available: false,
  },
];

export default function MacroPage() {
  return (
    <main className="min-h-screen bg-background">
      {/* ── Header ── */}
      <header className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/[0.03] to-transparent pointer-events-none" />

        <div className="relative max-w-6xl mx-auto px-4 md:px-6 pt-5 pb-6">
          <nav className="flex items-center gap-2 text-xs tracking-[0.15em] uppercase mb-5">
            <span className="text-emerald-500 font-medium">Macro</span>
          </nav>

          <div className="border-l-2 border-emerald-500/70 pl-5 md:pl-6">
            <h1 className="font-editorial text-3xl md:text-4xl text-foreground leading-[1.15] tracking-tight">
              宏观环境
            </h1>
            <p className="font-editorial text-base md:text-lg text-muted-foreground mt-1 italic">
              30 秒看懂宏观，5 分钟做出判断
            </p>
          </div>
        </div>

        <div className="h-px bg-gradient-to-r from-emerald-500/40 via-border/50 to-transparent" />
      </header>

      {/* ── Content ── */}
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-8 space-y-10">
        {/* ── Risk Dashboard Hero Card ── */}
        <section className="animate-fade-in-up">
          <Link href="/tools/macro-risk" className="group block cursor-pointer">
            <div className="relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.07] via-card to-card p-6 md:p-8 hover-glow transition-all duration-500">
              <div className="absolute inset-0 bg-dot-pattern opacity-30 pointer-events-none" />

              <div className="relative flex items-center justify-between gap-6">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse-glow" />
                    <span className="text-xs font-medium uppercase tracking-[0.15em] text-emerald-500">
                      Live Dashboard
                    </span>
                  </div>

                  <h2 className="font-editorial text-2xl md:text-3xl text-foreground mb-2">
                    综合风险仪表盘
                  </h2>
                  <p className="text-base text-muted-foreground max-w-lg leading-relaxed">
                    经济恶化、信用压力、就业市场和 AI
                    板块四大维度，一个仪表盘看清系统性风险全貌
                  </p>
                </div>

                <div className="hidden md:flex items-center gap-2 text-emerald-500 group-hover:text-emerald-400 shrink-0 transition-colors duration-300">
                  <span className="text-base font-medium">进入</span>
                  <svg
                    className="w-5 h-5 transition-transform duration-300 group-hover:translate-x-1"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              </div>
            </div>
          </Link>
        </section>

        {/* ── Four Dimensions ── */}
        <section>
          <h2 className="text-xs font-medium text-muted-foreground tracking-[0.2em] uppercase mb-6 animate-fade-in-up delay-100">
            四大板块
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {sections.map((section, i) => {
              const delayClass = [
                'delay-150',
                'delay-200',
                'delay-300',
                'delay-400',
              ][i];

              return section.available ? (
                <Link
                  key={section.id}
                  href={section.href}
                  className={`group block h-full animate-fade-in-up ${delayClass}`}
                >
                  <div className="relative h-full rounded-2xl bg-card/60 border border-border/40 p-6 cursor-pointer hover:border-emerald-500/30 hover:bg-card transition-all duration-500">
                    {/* Top row: number + status */}
                    <div className="flex items-start justify-between mb-5">
                      <span className="text-[2rem] font-data font-bold leading-none text-emerald-500/30 tracking-tighter select-none group-hover:text-emerald-500/50 transition-colors duration-500">
                        {section.number}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-xs font-medium text-emerald-500 uppercase tracking-wider">
                          Live
                        </span>
                      </div>
                    </div>

                    {/* Title */}
                    <h3 className="font-editorial text-xl text-foreground mb-1.5 group-hover:text-emerald-400 transition-colors duration-300">
                      {section.nameZh}
                    </h3>

                    {/* Question */}
                    <p className="font-editorial text-base text-emerald-500 italic mb-3">
                      {section.question}
                    </p>

                    {/* Description */}
                    <p className="text-sm text-muted-foreground leading-relaxed mb-5">
                      {section.description}
                    </p>

                    {/* Footer: data tags + arrow */}
                    <div className="flex items-center justify-between">
                      <span className="font-data text-xs text-muted-foreground/70 tracking-wider">
                        {section.detail}
                      </span>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground group-hover:text-emerald-400 transition-colors duration-300">
                        <span>查看详情</span>
                        <svg
                          className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                      </div>
                    </div>
                  </div>
                </Link>
              ) : (
                <div
                  key={section.id}
                  className={`h-full animate-fade-in-up ${delayClass}`}
                >
                  <div className="relative h-full rounded-2xl bg-card/40 border border-border/30 p-6">
                    {/* Top row: number + status */}
                    <div className="flex items-start justify-between mb-5">
                      <span className="text-[2rem] font-data font-bold leading-none text-muted-foreground/20 tracking-tighter select-none">
                        {section.number}
                      </span>
                      <span className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider border border-border/40 rounded-full px-2.5 py-0.5">
                        Soon
                      </span>
                    </div>

                    {/* Title */}
                    <h3 className="font-editorial text-xl text-muted-foreground/70 mb-1.5">
                      {section.nameZh}
                    </h3>

                    {/* Question */}
                    <p className="font-editorial text-base text-muted-foreground/50 italic mb-3">
                      {section.question}
                    </p>

                    {/* Description */}
                    <p className="text-sm text-muted-foreground/50 leading-relaxed mb-5">
                      {section.description}
                    </p>

                    {/* Footer: data tags */}
                    <span className="font-data text-xs text-muted-foreground/40 tracking-wider">
                      {section.detail}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
