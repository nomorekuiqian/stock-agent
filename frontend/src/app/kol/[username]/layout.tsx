'use client';

import { use } from 'react';

import {
  useKolCockpitProfile,
  useKolCockpitTickers,
  useKolCockpitFeed,
  useKolCockpitSectors,
} from '@/hooks/queries/use-kol-data';
import type { KolCockpitTickerSummary } from '@/lib/api';
import PersonaHero from './_components/PersonaHero';
import SubNav from './_components/SubNav';
import TransparencyNote from './_components/TransparencyNote';
import { relativeTimeCN } from './_components/relativeTime';
import { HeroSkeleton, SubNavSkeleton } from './_components/Skeletons';

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ username: string }>;
}

export default function KolPersonaLayout({ children, params }: LayoutProps) {
  const { username } = use(params);

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
  // Sectors API failure is non-fatal (sectorCount falls back to a default),
  // but we want a console trace so oncall can spot it without staring at the
  // network tab.
  if (sectorsQ.isError && sectorsQ.error) {
    console.warn('useKolCockpitSectors failed; sector KPI fell back to default', sectorsQ.error);
  }

  if (!ready) {
    return (
      <div className="min-h-screen bg-background">
        <HeroSkeleton />
        <SubNavSkeleton />
        {errored ? (
          <div className="mx-auto max-w-7xl px-4 py-16 text-center text-sm text-muted-foreground md:px-6">
            无法加载该博主的驾驶舱 · 请检查网络或稍后重试。
          </div>
        ) : (
          <div className="mx-auto max-w-7xl px-4 py-8 md:px-6">
            {children}
          </div>
        )}
      </div>
    );
  }

  const profile = profileQ.data;
  const avatarUrl = `/kol-avatars/${profile.persona.username}.png`;
  const heroDescription = profile.core.bio || profile.persona.description;
  const tickerCount = tickersQ.data.tickers.length;
  const totalTweets = feedQ.data.total ?? null;
  const latestAt = feedQ.data.tweets[0]?.created_at ?? null;
  const lastUpdated = relativeTimeCN(latestAt);
  const sectorCount =
    sectorsQ.data?.sectors.filter((sector) => sector.layer === 'sector').length ??
    (username.toLowerCase() === 'qinbafrank' ? 4 : profile.sectors.length);
  // qinbafrank uses the full-bleed workspace layout across all sub-pages so the
  // topic tree / sector explorer / feed rails have room to breathe.
  const isWideWorkspace = username.toLowerCase() === 'qinbafrank';

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
      <div
        className={`mx-auto lg:grid lg:grid-cols-[72px_minmax(0,1fr)] ${
          isWideWorkspace ? 'w-full max-w-none' : 'max-w-7xl'
        }`}
      >
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
          {children}
          <TransparencyNote username={profile.persona.username} />
        </main>
      </div>
    </div>
  );
}

// Provide a fallback ticker summaries type import surface for child pages.
export type { KolCockpitTickerSummary };
