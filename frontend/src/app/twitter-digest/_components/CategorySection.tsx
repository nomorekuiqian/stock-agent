import Link from 'next/link';

import { CuratedTweetCard } from './CuratedTweetCard';
import type { CuratedTweet } from './types';

type GroupBy = 'none' | 'sector' | 'ticker';

interface Props {
  tweets: CuratedTweet[];
  emptyMessage: string;
  groupBy: GroupBy;
}

function tweetScore(t: CuratedTweet): number {
  // Prefer backend-computed composite score; fall back to raw engagement
  // for older digests written before quality_score was added.
  if (typeof t.quality_score === 'number' && t.quality_score > 0) {
    return t.quality_score;
  }
  return (t.like_count ?? 0) + (t.retweet_count ?? 0);
}

function groupKeyOf(t: CuratedTweet, by: GroupBy): string {
  if (by === 'sector') return (t.sector ?? '').trim() || '其他';
  if (by === 'ticker') return (t.primary_ticker ?? '').trim() || '其他';
  return '';
}

function groupTweets(tweets: CuratedTweet[], by: GroupBy): Array<[string, CuratedTweet[]]> {
  if (by === 'none') return [['', tweets]];

  const buckets = new Map<string, CuratedTweet[]>();
  for (const t of tweets) {
    const key = groupKeyOf(t, by);
    const arr = buckets.get(key) ?? [];
    arr.push(t);
    buckets.set(key, arr);
  }

  for (const arr of buckets.values()) {
    arr.sort((a, b) => tweetScore(b) - tweetScore(a));
  }

  const groupScore = new Map<string, number>();
  for (const [key, arr] of buckets) {
    groupScore.set(key, arr.reduce((acc, t) => acc + tweetScore(t), 0));
  }
  const entries = Array.from(buckets.entries());
  entries.sort(([a], [b]) => {
    if (a === '其他') return 1;
    if (b === '其他') return -1;
    return (groupScore.get(b) ?? 0) - (groupScore.get(a) ?? 0);
  });
  return entries;
}

export function CategorySection({ tweets, emptyMessage, groupBy }: Props) {
  if (tweets.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic py-6 text-center">
        — {emptyMessage}
      </p>
    );
  }

  const groups = groupTweets(tweets, groupBy);

  if (groupBy === 'none') {
    return (
      <ul className="divide-y divide-border/40 -my-5 md:-my-6">
        {tweets
          .slice()
          .sort((a, b) => tweetScore(b) - tweetScore(a))
          .map((t) => (
            <li key={t.tweet_id} className="py-5 md:py-6">
              <CuratedTweetCard tweet={t} />
            </li>
          ))}
      </ul>
    );
  }

  // If every group is a singleton, drop sub-header ceremony and render flat —
  // an H3 over a single card is chrome without payoff.
  const allSingletons = groups.every(([, arr]) => arr.length <= 1);
  if (allSingletons) {
    return (
      <ul className="divide-y divide-border/40 -my-5 md:-my-6">
        {tweets
          .slice()
          .sort((a, b) => tweetScore(b) - tweetScore(a))
          .map((t) => (
            <li key={t.tweet_id} className="py-5 md:py-6">
              <CuratedTweetCard tweet={t} groupBy={groupBy} />
            </li>
          ))}
      </ul>
    );
  }

  return (
    <div className="space-y-10">
      {groups.map(([groupKey, groupTweets]) => (
        <Group
          key={groupKey}
          groupKey={groupKey}
          groupBy={groupBy}
          tweets={groupTweets}
        />
      ))}
    </div>
  );
}

function Group({
  groupKey, groupBy, tweets,
}: {
  groupKey: string;
  groupBy: GroupBy;
  tweets: CuratedTweet[];
}) {
  const distinctKols = new Set(tweets.map((t) => t.username)).size;
  const isTicker = groupBy === 'ticker' && groupKey !== '其他';

  return (
    <section>
      {/* Sub-header — only rendered when group has ≥2 cards (sub-grouping earns its keep here) */}
      <header className="flex items-baseline justify-between gap-x-3 mb-4 pb-2 border-b border-border/40">
        {isTicker ? (
          <Link
            href={`/stock/${groupKey}`}
            className="inline-flex items-baseline gap-0.5 font-data text-base md:text-lg font-medium text-foreground hover:text-primary transition-colors tracking-tight"
          >
            <span className="text-primary/65">$</span>
            <span>{groupKey}</span>
          </Link>
        ) : (
          <h3 className="font-editorial text-base md:text-lg text-foreground/90 tracking-tight">
            {groupKey}
          </h3>
        )}

        <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
          {distinctKols > 1 && (
            <><span className="font-data text-foreground/70">{distinctKols}</span> 位 · </>
          )}
          <span className="font-data text-foreground/70">{tweets.length}</span> 条
        </span>
      </header>

      <ul className="divide-y divide-border/40">
        {tweets.map((t) => (
          <li key={t.tweet_id} className="py-5 first:pt-0 last:pb-0">
            <CuratedTweetCard tweet={t} groupBy={groupBy} />
          </li>
        ))}
      </ul>
    </section>
  );
}
