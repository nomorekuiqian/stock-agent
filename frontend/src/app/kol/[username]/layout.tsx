'use client';

import { use } from 'react';
import { usePathname } from 'next/navigation';

import LoginGate from '@/components/LoginGate';
import PaywallGuard from '@/components/PaywallGuard';
import {
  useKolCockpitProfile,
  useKolCockpitTickers,
  useKolCockpitFeed,
  useKolCockpitSectors,
} from '@/hooks/queries/use-kol-data';
import type { KolCockpitTickerSummary } from '@/lib/api';
import PersonaHero from './_components/PersonaHero';
import SubNav from './_components/SubNav';
import { relativeTimeCN } from './_components/relativeTime';
import { HeroSkeleton, SubNavSkeleton } from './_components/Skeletons';

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ username: string }>;
}

export default function KolPersonaLayout({ children, params }: LayoutProps) {
  const { username } = use(params);
  const pathname = usePathname();

  // All three queries are cached + shared with sub-page hooks via TanStack
  // Query, so revisits and intra-cockpit navigation are instant. Layout uses
  // limit:3 to match the overview page's feed query — same cache key, one
  // HTTP request total instead of two (limit:1 + limit:3).
  const profileQ = useKolCockpitProfile(username);
  const tickersQ = useKolCockpitTickers(username);
  const feedQ = useKolCockpitFeed(username, { limit: 3 });
  const sectorsQ = useKolCockpitSectors(username);

  const errored = profileQ.isError || tickersQ.isError || feedQ.isError;
  const ready = profileQ.data && tickersQ.data && feedQ.data;
  // Frank + Serenity both use the full-bleed workspace layout across all
  // sub-pages so the topic tree / sector explorer / feed rails have room to
  // breathe. The loading shell must match — otherwise the page visibly jumps
  // from max-w-7xl to full bleed on every navigation / refresh.
  const u = username.toLowerCase();
  const isFrank = u === 'qinbafrank';
  const isFrankRoot =
    isFrank &&
    (pathname === `/kol/${username}` || pathname === `/kol/${username}/`);
  const isWideWorkspace = u === 'qinbafrank' || u === 'aleabitoreddit';
  const shellWidth = isWideWorkspace ? 'w-full max-w-none' : 'max-w-7xl';

  // qinbafrank sub-pages (sectors / highlights / stocks / latest / macro /
  // history / chat) require the paid Ultra pack. The persona root
  // (`/kol/qinbafrank`) stays public so cold traffic can inspect the product
  // before paying. qinbafrank pages use the same SubNav-first shell as the
  // sales root; page-level headers provide the content title.
  const isFrankSubpage =
    isFrank &&
    pathname !== `/kol/${username}` &&
    Boolean(pathname?.startsWith(`/kol/${username}/`));
  const gatedChildren = isFrankSubpage ? (
    <LoginGate
      title="登录后解锁 Qinbafrank 研究室 Ultra"
      description="先登录账户，再开通 Qinbafrank 投研资料包 + TheMarketBrew Max。"
    >
      <PaywallGuard
        requiredFeature="kol_pack_qinbafrank"
        checkoutProduct="ultra"
        lockTitle="解锁 Qinbafrank 研究室 Ultra"
        lockDescription="完整资料库、精选主题、个股档案、原文证据、AI 追问和 TheMarketBrew Max 投研能力。"
        lockCtaLabel="解锁 Ultra"
      >
        {children}
      </PaywallGuard>
    </LoginGate>
  ) : children;

  if (isFrank) {
    const frankTickerCount = tickersQ.data?.tickers.length ?? null;
    const frankTotalTweets = feedQ.data?.raw_total ?? feedQ.data?.total ?? null;
    const mainClassName = isFrankRoot
      ? 'min-w-0'
      : 'min-w-0 px-4 md:px-6 lg:pl-6 lg:pr-6';

    return (
      <div className="min-h-screen bg-background">
        <div className={`mx-auto lg:grid lg:grid-cols-[72px_minmax(0,1fr)] ${shellWidth}`}>
          <aside className="lg:border-r lg:border-border/60 lg:pr-2">
            <SubNav
              username={username}
              displayName="qinbafrank"
              avatarUrl="/kol-avatars/qinbafrank.png"
              kpis={{
                latestCount: frankTotalTweets,
                sectorCount: 5,
                tickerCount: frankTickerCount,
              }}
            />
          </aside>
          <main className={mainClassName}>
            {gatedChildren}
          </main>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="min-h-screen bg-background">
        <HeroSkeleton />
        <SubNavSkeleton />
        {errored ? (
          <div className={`mx-auto px-4 py-16 text-center text-sm text-muted-foreground md:px-6 ${shellWidth}`}>
            无法加载该博主的驾驶舱 · 请检查网络或稍后重试。
          </div>
        ) : (
          <div className={`mx-auto lg:grid lg:grid-cols-[72px_minmax(0,1fr)] ${shellWidth}`}>
            <aside className="hidden lg:block lg:border-r lg:border-border/60" aria-hidden />
            <main className="min-w-0 px-4 md:px-6 lg:pl-6 lg:pr-6">
              {gatedChildren}
            </main>
          </div>
        )}
      </div>
    );
  }

  const profile = profileQ.data;
  const avatarUrl = `/kol-avatars/${profile.persona.username}.png`;
  const heroDescription =
    username.toLowerCase() === 'qinbafrank'
      ? '基于 @qinbafrank 公开内容整理的专属投研页：框架、个股、原文证据和追问入口放在一起。'
      : username.toLowerCase() === 'aleabitoreddit'
        ? '基于 @aleabitoreddit (Serenity) 公开内容整理的 AI/半导体供应链投研页：供应链漏斗、个股解码、原文证据和追问入口放在一起。'
        : profile.core.bio || profile.persona.description;
  const tickerCount = tickersQ.data.tickers.length;
  const totalTweets = feedQ.data.raw_total ?? feedQ.data.total ?? null;
  const latestAt = feedQ.data.tweets[0]?.created_at ?? null;
  const lastUpdated = relativeTimeCN(latestAt);
  const sectorCount =
    username.toLowerCase() === 'qinbafrank'
      ? 5
      : sectorsQ.data?.sectors.filter((sector) => sector.layer === 'sector').length ??
        profile.sectors.length;

  return (
    <div className="min-h-screen bg-background">
      <PersonaHero
        username={profile.persona.username}
        displayName={profile.persona.display_name}
        description={heroDescription}
        lastUpdatedRelative={lastUpdated}
        totalCount={totalTweets}
        avatarUrl={avatarUrl}
      />
      {/* Body: mobile stacks (SubNav strip then main).
          lg+ becomes a 2-col grid with a slim persona sidebar + main content. */}
      <div className={`mx-auto lg:grid lg:grid-cols-[72px_minmax(0,1fr)] ${shellWidth}`}>
        <aside className="lg:border-r lg:border-border/60 lg:pr-2">
          <SubNav
            username={profile.persona.username}
            displayName={profile.persona.display_name}
            avatarUrl={avatarUrl}
            kpis={{
              latestCount: totalTweets,
              sectorCount,
              tickerCount,
            }}
          />
        </aside>
        <main className="min-w-0 px-4 md:px-6 lg:pl-6 lg:pr-6">
          {gatedChildren}
        </main>
      </div>
    </div>
  );
}

// Provide a fallback ticker summaries type import surface for child pages.
export type { KolCockpitTickerSummary };
