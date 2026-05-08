'use client';

import Link from 'next/link';

import { BriefRow } from './BriefRow';
import { CategorySection } from './CategorySection';
import { HotList } from './HotList';
import { OpeningSection } from './OpeningSection';
import { SoloVoiceCard } from './SoloVoiceCard';
import { TopicCard } from './TopicCard';
import { TrackedKolsSection } from './TrackedKolsSection';
import type { Brief, DailyDigest, Topic, TopicLayer } from './types';

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

function v3IsEmpty(d: DailyDigest): boolean {
  return d.topics.length === 0 && d.briefs.length === 0 && d.solo_voices.length === 0;
}

function v2IsEmpty(d: DailyDigest): boolean {
  return d.macro_picks.length === 0 && d.industry_picks.length === 0 && d.stock_picks.length === 0;
}

function isEmpty(d: DailyDigest): boolean {
  return d.schema_version === 'v3' ? v3IsEmpty(d) : v2IsEmpty(d);
}

// ---------------------------------------------------------------------------

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

  return (
    <main className="min-h-screen bg-background editorial-paper">
      <BackBar />
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-8 md:py-10 space-y-6">
        {digest.schema_version === 'v3'
          ? <V3Body date={date} digest={digest} />
          : <V2Body date={date} digest={digest} />}

        <TrackedKolsSection
          kols={digest.tracked_kols}
          inputTweetCount={digest.input_tweet_count}
        />

        <Footer digest={digest} />
      </div>
    </main>
  );
}

function BackBar() {
  return (
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
  );
}

function Footer({ digest }: { digest: DailyDigest }) {
  const stamp = new Date(digest.generated_at).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
  return (
    <footer className="pt-2 pb-2 text-center">
      <p className="text-xs text-muted-foreground" title={`模型 ${digest.model_version}`}>
        本期生成于 <span className="font-data tabular-nums">{stamp}</span>
        <span className="mx-2 text-muted-foreground/50">·</span>
        <span className="font-data uppercase tracking-wider">{digest.schema_version}</span>
      </p>
    </footer>
  );
}

// ===========================================================================
// V3 body
// ===========================================================================

function V3Body({ date, digest }: { date: string; digest: DailyDigest }) {
  const empty = isEmpty(digest);

  return (
    <>
      <OpeningSection
        date={date}
        headline={digest.headline}
        intro={digest.intro}
        takeaway={digest.takeaway}
        windowHours={digest.window_hours}
        trackedKolCount={digest.tracked_kols.length}
      />

      {empty ? (
        <p className="text-sm text-muted-foreground italic py-12 text-center">
          — 今天 KOL 圈子整体偏静,没有达到收录标准的话题。
        </p>
      ) : (
        <>
          <HotList
            sectors={digest.hot_sectors ?? []}
            tickers={digest.hot_tickers ?? []}
            events={digest.hot_events ?? []}
          />
          {digest.topics.length > 0 && (
            <TopicsSection topics={digest.topics} />
          )}
          {digest.briefs.length > 0 && (
            <BriefsSection briefs={digest.briefs} />
          )}
          {digest.solo_voices.length > 0 && (
            <SoloVoicesSection voices={digest.solo_voices} />
          )}
        </>
      )}
    </>
  );
}

// Group topics by layer; layer order: macro -> industry -> stock.
function TopicsSection({ topics }: { topics: Topic[] }) {
  const layers: TopicLayer[] = ['macro', 'industry', 'stock'];
  const labels: Record<TopicLayer, { title: string; sub: string }> = {
    macro: { title: '宏观事件', sub: '跨指数 / 跨资产 / 宏观政策' },
    industry: { title: '行业话题', sub: '赛道级机会与风险 · 含加密资产' },
    stock: { title: '个股话题', sub: '允许同 ticker 多个事件' },
  };

  // Topic index across the whole list anchors `#topic-N`. We compute it
  // once so anchors stay stable as the reader scrolls between layer groups.
  let cursor = 0;

  return (
    <section className="space-y-6" id="hot-topics" aria-label="热门话题">
      {layers.map((layer) => {
        const items = topics.filter((t) => t.layer === layer);
        if (items.length === 0) return null;
        const renderedItems = items.map((t) => {
          const idx = cursor++;
          return <TopicCard key={`${t.title}-${idx}`} topic={t} index={idx} />;
        });
        return (
          <SectionPanel
            key={layer}
            title={labels[layer].title}
            subtitle={labels[layer].sub}
            count={items.length}
          >
            <div className="space-y-4">{renderedItems}</div>
          </SectionPanel>
        );
      })}
    </section>
  );
}

function BriefsSection({ briefs }: { briefs: Brief[] }) {
  const layers: TopicLayer[] = ['macro', 'industry', 'stock'];
  const labels: Record<TopicLayer, string> = {
    macro: '宏观快讯',
    industry: '行业快讯',
    stock: '个股快讯',
  };

  return (
    <section className="space-y-4" id="briefs" aria-label="快讯">
      <div className="flex items-baseline gap-3 px-2">
        <h2 className="text-base md:text-lg font-medium text-foreground tracking-tight">
          快讯
        </h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          <span className="font-data text-foreground/70">{briefs.length}</span> 条
        </span>
      </div>
      <div className="rounded-xl border border-border/60 bg-card/30 divide-y divide-border/40">
        {layers.map((layer) => {
          const items = briefs.filter((b) => b.layer === layer);
          if (items.length === 0) return null;
          return (
            <div key={layer} className="px-5 md:px-6 py-3">
              <h3 className="text-xs uppercase tracking-[0.2em] text-muted-foreground/70 mb-2">
                {labels[layer]}
              </h3>
              <ul className="divide-y divide-border/30">
                {items.map((b) => (
                  <li key={b.tweet_id}>
                    <BriefRow brief={b} />
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SoloVoicesSection({ voices }: { voices: NonNullable<DailyDigest['solo_voices']> }) {
  return (
    <section className="space-y-4" id="solo-voices" aria-label="独家声音">
      <div className="flex items-baseline gap-3 px-2">
        <h2 className="text-base md:text-lg font-medium text-foreground tracking-tight">
          独家声音
        </h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          <span className="font-data text-foreground/70">{voices.length}</span> 篇
        </span>
      </div>
      <div className="space-y-4">
        {voices.map((v) => (
          <SoloVoiceCard key={v.tweet_id} voice={v} />
        ))}
      </div>
    </section>
  );
}

function SectionPanel({
  title, subtitle, count, children,
}: {
  title: string;
  subtitle: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border/60 bg-card/30 overflow-hidden">
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
        <p className="ml-4 mt-1 text-xs text-muted-foreground">{subtitle}</p>
      </header>
      <div className="px-5 md:px-6 py-5 md:py-6">{children}</div>
    </section>
  );
}

// ===========================================================================
// V2 body — backward-compat for digests written before the V3 cutover.
// Mirrors the prior layout: Header + TakeawayPanel + 3 CategorySection panels.
// ===========================================================================

function V2Body({ date, digest }: { date: string; digest: DailyDigest }) {
  return (
    <>
      <V2Header date={date} digest={digest} />
      {digest.takeaway.length > 0 && <V2TakeawayPanel lines={digest.takeaway} />}
      <V2SectionPanel
        title="大盘走势"
        subtitle="跨指数 / 跨资产 / 宏观政策视角"
        count={digest.macro_picks.length}
      >
        <CategorySection
          tweets={digest.macro_picks}
          emptyMessage="今日没有大盘层面的判断。"
          groupBy="none"
        />
      </V2SectionPanel>
      <V2SectionPanel
        title="行业判断"
        subtitle="赛道级机会与风险 · 含加密资产作为类别"
        count={digest.industry_picks.length}
      >
        <CategorySection
          tweets={digest.industry_picks}
          emptyMessage="今日没有值得关注的行业判断。"
          groupBy="sector"
        />
      </V2SectionPanel>
      <V2SectionPanel
        title="个股判断"
        subtitle="单一标的视角"
        count={digest.stock_picks.length}
      >
        <CategorySection
          tweets={digest.stock_picks}
          emptyMessage="今日没有具体个股判断。"
          groupBy="ticker"
        />
      </V2SectionPanel>
    </>
  );
}

function V2Header({ date, digest }: { date: string; digest: DailyDigest }) {
  return (
    <section className="text-center space-y-3 py-2 animate-fade-in-up">
      <p className="text-sm text-muted-foreground tabular-nums">
        {formatHeaderDate(date)}
      </p>
      <h1 className="font-editorial text-3xl md:text-4xl text-foreground tracking-tight">
        KOL 观点日报
      </h1>
      <p className="text-sm text-muted-foreground max-w-xl mx-auto">
        过去 <span className="font-data tabular-nums text-foreground/80">{digest.window_hours}</span> 小时,
        <span className="font-data tabular-nums text-foreground/80">{digest.tracked_kols.length}</span> 位金融博主的关键观点。
      </p>
    </section>
  );
}

function V2TakeawayPanel({ lines }: { lines: string[] }) {
  return (
    <section className="py-4 md:py-6 space-y-5 animate-fade-in-up">
      <div className="editorial-ornament">
        <h2 className="text-xs font-medium tracking-[0.35em] uppercase text-foreground/70">
          今日要点
        </h2>
      </div>
      <ol className="max-w-2xl mx-auto space-y-3">
        {lines.map((line, i) => (
          <li key={i} className="font-editorial text-base md:text-lg leading-relaxed text-foreground/90 text-center px-2">
            {line}
          </li>
        ))}
      </ol>
    </section>
  );
}

function V2SectionPanel({
  title, subtitle, count, children,
}: {
  title: string;
  subtitle: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border/60 bg-card/30 overflow-hidden animate-fade-in-up">
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
        <p className="ml-4 mt-1 text-xs text-muted-foreground">{subtitle}</p>
      </header>
      <div className="px-5 md:px-6 py-5 md:py-6">{children}</div>
    </section>
  );
}
