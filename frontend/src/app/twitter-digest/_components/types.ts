// Frontend mirror of backend twitter_digest/models.py.
// Kept in sync manually for V2; can later be generated from OpenAPI.

export type CuratedCategory = 'macro' | 'industry' | 'stock';

export interface CuratedTweet {
  tweet_id: string;
  username: string;
  display_name: string;
  text_en: string;
  text_zh: string;
  created_at: string;
  tweet_type: string;          // original / quote / reply / thread / article
  url: string;
  category: CuratedCategory;
  primary_ticker: string;       // required for category='stock', else ''
  sector: string;               // required for category='industry', else ''
  interpretation_zh: string;    // headline — punchy non-obvious angle, ≤120 chars
  tldr_zh?: string;             // 3-5 sentences, 200-400 chars; richer summary
  // Engagement signals — backend backfills from source tweet, default 0.
  like_count?: number;
  retweet_count?: number;
  view_count?: number;
}

export interface DailyDigest {
  generated_at: string;
  window_hours: number;
  input_tweet_count: number;
  tracked_kols: string[];
  takeaway: string[];
  macro_picks: CuratedTweet[];
  industry_picks: CuratedTweet[];
  stock_picks: CuratedTweet[];
  model_version: string;
}
