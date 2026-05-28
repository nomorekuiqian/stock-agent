'use client';

import { use, useEffect, useState } from 'react';

import { api, type KolCockpitProfile, type KolCockpitTickerSummary } from '@/lib/api';
import PersonaHero from './_components/PersonaHero';
import SubNav from './_components/SubNav';
import TransparencyFooter from './_components/TransparencyFooter';
import { relativeTimeCN } from './_components/relativeTime';

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ username: string }>;
}

interface ShellData {
  profile: KolCockpitProfile;
  tickerCount: number;
  totalTweets: number | null;
  latestAt: string | null;
}

export default function KolPersonaLayout({ children, params }: LayoutProps) {
  const { username } = use(params);
  const [data, setData] = useState<ShellData | null>(null);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setErrored(false);
    Promise.all([
      api.kolResearch.cockpitProfile(username),
      api.kolResearch.cockpitTickers(username),
      api.kolResearch.cockpitFeed(username, { limit: 1 }),
    ])
      .then(([profile, tickersResp, feed]) => {
        if (cancelled) return;
        const latestAt = feed.tweets[0]?.created_at ?? null;
        setData({
          profile,
          tickerCount: tickersResp.tickers.length,
          totalTweets: feed.total,
          latestAt,
        });
      })
      .catch(() => {
        if (!cancelled) setErrored(true);
      });
    return () => {
      cancelled = true;
    };
  }, [username]);

  // Initial render before profile loads — keep the same chrome height so
  // there's no layout shift when data arrives.
  if (!data) {
    return (
      <div className="min-h-screen bg-background">
        {/* Hero placeholder */}
        <div className="border-b border-border/60 bg-background">
          <div className="mx-auto h-[108px] max-w-7xl px-4 md:px-6" />
        </div>
        {/* SubNav placeholder — h-16 mobile / h-20 md horizontal / hidden lg
            (lg uses grid sidebar which has no fixed strip height) */}
        <div className="border-b border-border/60 bg-background lg:hidden">
          <div className="mx-auto h-16 max-w-7xl md:h-20" />
        </div>
        {errored ? (
          <div className="mx-auto max-w-7xl px-4 py-16 text-center text-sm text-muted-foreground md:px-6">
            无法加载该博主的驾驶舱 · 请检查网络或稍后重试。
          </div>
        ) : (
          <div className="mx-auto max-w-7xl px-4 py-16 text-center font-data text-xs uppercase tracking-[0.18em] text-muted-foreground md:px-6">
            <span className="thinking-dot" />
            <span className="thinking-dot ml-1" />
            <span className="thinking-dot ml-1" />
          </div>
        )}
      </div>
    );
  }

  const lastUpdated = relativeTimeCN(data.latestAt);

  return (
    <div className="min-h-screen bg-background">
      <PersonaHero
        username={data.profile.persona.username}
        displayName={data.profile.persona.display_name}
        description={data.profile.core.bio || data.profile.persona.description}
        lastUpdatedRelative={lastUpdated}
        totalCount={data.totalTweets}
        avatarUrl={`/kol-avatars/${data.profile.persona.username}.png`}
      />
      {/* Body: mobile stacks (SubNav strip then main).
          lg+ becomes a 2-col grid with a slim 60px icon-only sidebar +
          main content. Frees ~150px of horizontal room so split-layout pages
          (stocks, sectors) don't feel crowded. */}
      <div className="mx-auto max-w-7xl lg:grid lg:grid-cols-[60px_minmax(0,1fr)]">
        <aside className="lg:border-r lg:border-border/60">
          <SubNav
            username={data.profile.persona.username}
            displayName={data.profile.persona.display_name}
            kpis={{
              latestCount: data.totalTweets,
              sectorCount: data.profile.sectors.length,
              tickerCount: data.tickerCount,
            }}
          />
        </aside>
        <main className="min-w-0 px-4 md:px-6 lg:pl-6 lg:pr-6">{children}</main>
      </div>
      <TransparencyFooter username={data.profile.persona.username} />
    </div>
  );
}

// Provide a fallback ticker summaries type import surface for child pages.
export type { KolCockpitTickerSummary };
