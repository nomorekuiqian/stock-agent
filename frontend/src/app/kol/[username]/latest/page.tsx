'use client';

import { use, useState } from 'react';

import type { KolCockpitTickerSummary } from '@/lib/api';
import { useKolCockpitTickers, useKolCockpitTopics } from '@/hooks/queries/use-kol-data';
import KolPanelHeader from '../_components/KolPanelHeader';
import LiveFeed from '../_components/LiveFeed';
import TickerRailList from '../_components/TickerRailList';
import TopicTree from '../_components/TopicTree';

export default function LatestPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = use(params);
  const isFrank = username.toLowerCase() === 'qinbafrank';
  const { data: tickersData } = useKolCockpitTickers(username);
  const tickers = tickersData?.tickers ?? [];

  return (
    <div className="pt-4 md:pt-6">
      <KolPanelHeader
        title={isFrank ? '全量内容库' : '内容库'}
        meta={isFrank ? '主题筛选 / 时间倒序 / 原文逐字' : '时间倒序 · 含 reply / quote · 原文逐字'}
      />
      {isFrank ? (
        <FrankLayout username={username} tickers={tickers} />
      ) : (
        <LiveFeed username={username} tickers={tickers} />
      )}
    </div>
  );
}

function FrankLayout({
  username,
  tickers,
}: {
  username: string;
  tickers: KolCockpitTickerSummary[];
}) {
  const [topic, setTopic] = useState<string | null>(null);
  const [ticker, setTicker] = useState<string | null>(null);
  const topicsQ = useKolCockpitTopics(username);
  const tree = topicsQ.data?.tree ?? [];
  const total = topicsQ.data?.total ?? 0;

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <aside className="lg:w-56 lg:shrink-0">
        <div className="space-y-5 rounded-lg border border-border/40 bg-card/20 p-3 lg:sticky lg:top-32 lg:max-h-[calc(100vh-9rem)] lg:overflow-y-auto">
          <section>
            <p className="px-2 pb-2 font-data text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              主题
            </p>
            {topicsQ.isLoading ? (
              <div className="space-y-1.5 px-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-7 animate-pulse rounded bg-muted/30" />
                ))}
              </div>
            ) : (
              <TopicTree tree={tree} total={total} value={topic} onChange={setTopic} />
            )}
          </section>
          <section>
            <p className="px-2 pb-2 font-data text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              个股
            </p>
            <TickerRailList tickers={tickers} value={ticker} onChange={setTicker} />
          </section>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <LiveFeed
          username={username}
          tickers={tickers}
          topic={topic}
          ticker={ticker}
          hideFilterBar
          hideTickerRail
          onClearFilter={() => {
            setTopic(null);
            setTicker(null);
          }}
        />
      </div>
    </div>
  );
}
