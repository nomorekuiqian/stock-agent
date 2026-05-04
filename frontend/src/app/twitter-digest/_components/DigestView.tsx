'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import { CategorySection } from './CategorySection';
import { TrackedKolsSection } from './TrackedKolsSection';
import type { DailyDigest } from './types';

interface Props {
  date: string;
  digest: DailyDigest | null;
}

const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

function formatHeaderDate(date: string): string {
  try {
    const [y, m, d] = date.split('-').map(Number);
    const dt = new Date(`${date}T08:00:00+08:00`);
    return `${y} 年 ${m} 月 ${d} 日 · ${WEEKDAYS[dt.getDay()]}`;
  } catch {
    return date;
  }
}

function totalCount(digest: DailyDigest): number {
  return digest.macro_picks.length + digest.industry_picks.length + digest.stock_picks.length;
}

export function DigestView({ date, digest }: Props) {
  if (!digest) {
    return (
      <main className="min-h-screen bg-background">
        <div className="max-w-4xl mx-auto px-4 md:px-6 py-24 text-center">
          <h1 className="font-editorial text-2xl text-foreground/85">该日期暂无日报</h1>
          <p className="text-muted-foreground mt-3 text-sm">{formatHeaderDate(date)}</p>
          <p className="text-muted-foreground mt-2 text-sm max-w-sm mx-auto">
            可能是当天 KOL 产出未达收录标准。
          </p>
          <Link
            href="/twitter-digest"
            className="mt-8 inline-block text-sm text-primary hover:underline underline-offset-4"
          >
            查看最新一期
          </Link>
        </div>
      </main>
    );
  }

  const empty = totalCount(digest) === 0;

  return (
    <main className="min-h-screen bg-background editorial-paper">
      {/* Back link */}
      <div className="border-b border-border/40">
        <div className="max-w-4xl mx-auto px-4 md:px-6 py-3">
          <Link
            href="/today"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            返回日报
          </Link>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 md:px-6 py-8 md:py-10 space-y-6">
        <Header date={date} digest={digest} />

        {digest.takeaway.length > 0 && <TakeawayPanel lines={digest.takeaway} />}

        <ContributorBar
          kols={digest.tracked_kols}
          inputTweetCount={digest.input_tweet_count}
          macroCount={digest.macro_picks.length}
          industryCount={digest.industry_picks.length}
          stockCount={digest.stock_picks.length}
          empty={empty}
        />

        <SectionPanel
          id="section-macro"
          title="大盘走势"
          subtitle="跨指数 / 跨资产 / 宏观政策视角"
          count={digest.macro_picks.length}
        >
          <CategorySection
            tweets={digest.macro_picks}
            emptyMessage="今日没有大盘层面的判断。"
            groupBy="none"
          />
        </SectionPanel>

        <SectionPanel
          id="section-industry"
          title="行业判断"
          subtitle="赛道级机会与风险 · 含加密资产作为类别"
          count={digest.industry_picks.length}
        >
          <CategorySection
            tweets={digest.industry_picks}
            emptyMessage="今日没有值得关注的行业判断。"
            groupBy="sector"
          />
        </SectionPanel>

        <SectionPanel
          id="section-stock"
          title="个股判断"
          subtitle="单一标的视角"
          count={digest.stock_picks.length}
        >
          <CategorySection
            tweets={digest.stock_picks}
            emptyMessage="今日没有具体个股判断。"
            groupBy="ticker"
          />
        </SectionPanel>

        <TrackedKolsSection
          kols={digest.tracked_kols}
          inputTweetCount={digest.input_tweet_count}
        />

        <Footer digest={digest} />
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------

function Header({ date, digest }: { date: string; digest: DailyDigest }) {
  return (
    <section className="text-center space-y-3 py-2 animate-fade-in-up">
      <p className="text-sm text-muted-foreground tabular-nums">
        {formatHeaderDate(date)}
      </p>
      <h1 className="font-editorial text-3xl md:text-4xl text-foreground tracking-tight">
        KOL 观点日报
      </h1>
      <div className="space-y-1 max-w-xl mx-auto">
        <p className="text-sm text-muted-foreground">
          过去 <span className="font-data tabular-nums text-foreground/80">{digest.window_hours}</span> 小时，
          <span className="font-data tabular-nums text-foreground/80">{digest.tracked_kols.length}</span> 位金融博主的关键观点。
        </p>
        <p className="text-xs text-muted-foreground/80">
          只保留带数据 · 推理 · 可证伪结论的发声。
        </p>
      </div>
    </section>
  );
}

function TakeawayPanel({ lines }: { lines: string[] }) {
  return (
    <section
      aria-labelledby="takeaway-eyebrow"
      className="py-4 md:py-6 space-y-5 animate-fade-in-up"
      style={{ animationDelay: '60ms' }}
    >
      <div className="editorial-ornament">
        <h2
          id="takeaway-eyebrow"
          className="text-xs font-medium tracking-[0.35em] uppercase text-foreground/70"
        >
          今日要点
        </h2>
      </div>

      <ol className="max-w-2xl mx-auto space-y-3">
        {lines.map((line, i) => (
          <li
            key={i}
            className="font-editorial text-base md:text-lg leading-relaxed text-foreground/90 text-center px-2"
          >
            {line}
          </li>
        ))}
      </ol>

      <div className="editorial-ornament" aria-hidden>
        <span className="text-xs tracking-[0.25em] uppercase text-muted-foreground/70">
          30 秒读完
        </span>
      </div>
    </section>
  );
}

function ContributorBar({
  kols, inputTweetCount, macroCount, industryCount, stockCount, empty,
}: {
  kols: string[];
  inputTweetCount: number;
  macroCount: number;
  industryCount: number;
  stockCount: number;
  empty: boolean;
}) {
  // Scroll-spy: highlight the nav link for the section currently in view.
  // The rootMargin band makes "in view" mean "section header is in upper third
  // of the viewport," which feels right for an editorial reading flow.
  const [active, setActive] = useState<string>('');

  useEffect(() => {
    if (empty) return;
    const ids = ['section-macro', 'section-industry', 'section-stock'];
    const targets = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (targets.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length === 0) return;
        visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        setActive(visible[0].target.id);
      },
      { rootMargin: '-20% 0px -60% 0px', threshold: 0 },
    );
    targets.forEach((t) => observer.observe(t));
    return () => observer.disconnect();
  }, [empty]);

  return (
    <section
      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-6 py-3 border-y border-border/40 animate-fade-in-up"
      style={{ animationDelay: '120ms' }}
    >
      <p className="text-xs text-muted-foreground tabular-nums">
        <span className="font-data text-foreground/80">{kols.length}</span> 位博主 ·{' '}
        <span className="font-data text-foreground/80">{inputTweetCount}</span> 条候选
      </p>

      {!empty && (
        <nav className="flex items-center gap-1 text-xs">
          {[
            { id: 'section-macro', label: '大盘', count: macroCount },
            { id: 'section-industry', label: '行业', count: industryCount },
            { id: 'section-stock', label: '个股', count: stockCount },
          ].map((p) => {
            const isActive = active === p.id;
            return (
              <a
                key={p.id}
                href={`#${p.id}`}
                aria-current={isActive ? 'location' : undefined}
                className={
                  'px-3 py-1.5 rounded-md transition-colors inline-flex items-center gap-1.5 ' +
                  (isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-foreground/75 hover:bg-muted/50 hover:text-primary')
                }
              >
                <span>{p.label}</span>
                <span
                  className={
                    'font-data tabular-nums ' +
                    (isActive ? 'text-primary/80' : 'text-muted-foreground/80')
                  }
                >
                  {p.count}
                </span>
              </a>
            );
          })}
        </nav>
      )}
    </section>
  );
}

function SectionPanel({
  id, title, subtitle, count, children,
}: {
  id: string;
  title: string;
  subtitle: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-20 rounded-xl border border-border/60 bg-card/30 overflow-hidden animate-fade-in-up"
      style={{ animationDelay: '180ms' }}
    >
      {/* Section header — strong visual boundary */}
      <header className="px-5 md:px-6 py-4 border-b border-border/60 bg-card/50">
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3">
          <span className="block w-1 h-5 rounded-sm bg-primary" aria-hidden />
          <h2 className="text-base md:text-lg font-medium text-foreground tracking-tight">
            {title}
          </h2>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            <span className="font-data tabular-nums text-foreground/80">{count}</span> 条
          </span>
        </div>
        <p className="ml-4 mt-1 text-xs text-muted-foreground">
          {subtitle}
        </p>
      </header>

      {/* Section body */}
      <div className="px-5 md:px-6 py-5 md:py-6">
        {children}
      </div>
    </section>
  );
}

function Footer({ digest }: { digest: DailyDigest }) {
  const stamp = new Date(digest.generated_at).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
  // Model name is implementation detail; leave it in title attribute for
  // power users who want it without surfacing on screen.
  return (
    <footer className="pt-2 pb-2 text-center">
      <p
        className="text-xs text-muted-foreground"
        title={`模型 ${digest.model_version}`}
      >
        本期生成于 <span className="font-data tabular-nums">{stamp}</span>
      </p>
    </footer>
  );
}
