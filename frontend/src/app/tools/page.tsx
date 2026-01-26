import Link from 'next/link';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Tools - TheMarketBrew',
  description: 'Market monitoring tools and dashboards for smart investors.',
};

const tools = [
  {
    id: 'liquidity',
    name: 'Liquidity Monitor',
    nameZh: '流动性监控',
    description: 'Track Fed balance sheet, TGA, RRP, and net liquidity in real-time.',
    descriptionZh: '实时追踪美联储资产负债表、TGA、RRP 和净流动性指标',
    href: '/tools/liquidity',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    available: true,
  },
  {
    id: 'calendar',
    name: 'Economic Calendar',
    nameZh: '经济日历',
    description: 'Upcoming economic events, Fed meetings, and earnings releases.',
    descriptionZh: '重要经济事件、美联储会议和财报发布日程',
    href: '/tools/calendar',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
    available: false,
  },
  {
    id: 'earnings',
    name: 'Earnings Tracker',
    nameZh: '财报追踪',
    description: 'Track upcoming earnings and historical results for your watchlist.',
    descriptionZh: '追踪关注列表中股票的财报日期和历史业绩',
    href: '/tools/earnings',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    ),
    available: false,
  },
];

export default function ToolsPage() {
  return (
    <main className="min-h-screen bg-background">
      {/* Page Header */}
      <section className="border-b border-border/50">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 md:py-12">
          <div className="space-y-3">
            {/* Section Label */}
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-primary to-transparent" />
              <span className="text-primary text-xs font-medium tracking-[0.2em] uppercase">DATA TOOLS</span>
            </div>

            {/* Main Title */}
            <h1 className="text-3xl md:text-4xl font-editorial text-foreground tracking-tight">
              数据工具
            </h1>

            {/* Subtitle */}
            <p className="text-muted-foreground text-sm md:text-base max-w-lg">
              实时监控市场关键指标，助力投资决策
            </p>
          </div>
        </div>
      </section>

      {/* Tools Grid */}
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tools.map((tool) => (
            <div key={tool.id} className="relative">
              {tool.available ? (
                <Link
                  href={tool.href}
                  className="group block terminal-card p-6 h-full hover:border-emerald-500/30 transition-all"
                >
                  {/* Icon */}
                  <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-4 group-hover:bg-emerald-500/20 transition-colors">
                    {tool.icon}
                  </div>

                  {/* Content */}
                  <h3 className="text-lg font-medium text-foreground mb-2 group-hover:text-emerald-400 transition-colors">
                    {tool.nameZh}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    {tool.descriptionZh}
                  </p>

                  {/* Link indicator */}
                  <div className="flex items-center gap-1 text-sm text-emerald-400">
                    <span>进入</span>
                    <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </Link>
              ) : (
                <div className="terminal-card p-6 h-full opacity-60">
                  {/* Icon */}
                  <div className="w-12 h-12 rounded-xl bg-card border border-border/50 flex items-center justify-center text-muted-foreground mb-4">
                    {tool.icon}
                  </div>

                  {/* Content */}
                  <h3 className="text-lg font-medium text-foreground mb-2">
                    {tool.nameZh}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    {tool.descriptionZh}
                  </p>

                  {/* Coming soon badge */}
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-card border border-border/50 text-muted-foreground">
                    Coming Soon
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
