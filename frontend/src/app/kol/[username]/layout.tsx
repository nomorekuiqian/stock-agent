'use client';

import { use } from 'react';

import {
  useKolCockpitProfile,
  useKolCockpitTickers,
  useKolCockpitFeed,
} from '@/hooks/queries/use-kol-data';
import type { KolCockpitTickerSummary } from '@/lib/api';
import PersonaHero from './_components/PersonaHero';
import SubNav from './_components/SubNav';
import TransparencyFooter from './_components/TransparencyFooter';
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

  const errored = profileQ.isError || tickersQ.isError || feedQ.isError;
  const ready = profileQ.data && tickersQ.data && feedQ.data;

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
  const tickerCount = tickersQ.data.tickers.length;
  const totalTweets = feedQ.data.total ?? null;
  const latestAt = feedQ.data.tweets[0]?.created_at ?? null;
  const lastUpdated = relativeTimeCN(latestAt);

  return (
    <div className="min-h-screen bg-background">
      <PersonaHero
        username={profile.persona.username}
        displayName={profile.persona.display_name}
        description={profile.core.bio || profile.persona.description}
        lastUpdatedRelative={lastUpdated}
        totalCount={totalTweets}
        avatarUrl={`/kol-avatars/${profile.persona.username}.png`}
      />
      {/* Body: mobile stacks (SubNav strip then main).
          lg+ becomes a 2-col grid with a slim 60px icon-only sidebar +
          main content. */}
      <div className="mx-auto max-w-7xl lg:grid lg:grid-cols-[60px_minmax(0,1fr)]">
        <aside className="lg:border-r lg:border-border/60">
          <SubNav
            username={profile.persona.username}
            displayName={profile.persona.display_name}
            kpis={{
              latestCount: totalTweets,
              sectorCount: profile.sectors.length,
              tickerCount,
            }}
          />
        </aside>
        <main className="min-w-0 px-4 md:px-6 lg:pl-6 lg:pr-6">{children}</main>
      </div>
      <TransparencyFooter username={profile.persona.username} />
    </div>
  );
}

// Provide a fallback ticker summaries type import surface for child pages.
export type { KolCockpitTickerSummary };
