'use client';

import { Heart, ExternalLink } from 'lucide-react';

import type { KolCockpitTweet } from '@/lib/api';

export default function TweetCard({ tweet }: { tweet: KolCockpitTweet }) {
  const date = (tweet.created_at || '').slice(0, 10);
  return (
    <div className="rounded-lg border border-border/60 bg-background p-3">
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-3">
          <span className="font-data">{date}</span>
          {tweet.like_count > 0 && (
            <span className="inline-flex items-center gap-1">
              <Heart className="h-3 w-3" /> {tweet.like_count}
            </span>
          )}
          {tweet.tweet_type && tweet.tweet_type !== 'original' && (
            <span className="rounded bg-muted px-1.5 py-0.5">{tweet.tweet_type}</span>
          )}
        </span>
        {tweet.url && (
          <a
            href={tweet.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-primary transition-colors hover:text-primary/80"
          >
            原文 <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{tweet.text}</p>
    </div>
  );
}
