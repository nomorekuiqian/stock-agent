// Frontend mirror of backend twitter_digest/models.py.
// Kept in sync manually; can later be generated from OpenAPI.

// ---------------------------------------------------------------------------
// V2 (legacy) — single-tweet picks. Kept for backward read compat with rows
// written before the V3 cutover.
// ---------------------------------------------------------------------------

export type CuratedCategory = 'macro' | 'industry' | 'stock';
export type CuratedDepth = 'deep' | 'flash';

export interface CuratedTweet {
  tweet_id: string;
  username: string;
  display_name: string;
  text_en: string;
  text_zh: string;
  created_at: string;
  tweet_type: string;
  url: string;
  category: CuratedCategory;
  primary_ticker: string;
  sector: string;
  depth: CuratedDepth;
  interpretation_zh: string;
  tldr_zh?: string;
  like_count?: number;
  retweet_count?: number;
  view_count?: number;
  reply_count?: number;
  quality_score?: number;
}

// ---------------------------------------------------------------------------
// V3 — aggregated topics + briefs + solo voices
// ---------------------------------------------------------------------------

export type TopicLayer = 'macro' | 'industry' | 'stock';
export type ArgStance = 'bullish' | 'bearish' | 'neutral';

export interface KeyArgument {
  tweet_id: string;
  username: string;
  display_name: string;
  stance: ArgStance;
  tldr_zh: string;
  tweet_url: string;
}

export interface Topic {
  title: string;
  layer: TopicLayer;
  primary_ticker: string;
  sector: string;
  event: string;
  participating_kols: string[];
  stance_distribution: string;
  synthesis_zh: string;
  key_arguments: KeyArgument[];
}

export interface Brief {
  layer: TopicLayer;
  label: string;
  one_liner_zh: string;
  why_it_matters_zh?: string;
  username: string;
  display_name: string;
  tweet_id: string;
  tweet_url: string;
}

export type SoloTweetType = 'thread' | 'article';

export interface SoloVoice {
  title: string;
  username: string;
  display_name: string;
  primary_ticker: string;
  tweet_type: SoloTweetType;
  tldr_zh: string;
  interpretation_zh: string;
  tweet_id: string;
  tweet_url: string;
}

// ---------------------------------------------------------------------------
// V3.1 — backend-computed hot lists (frequency tallies)
// ---------------------------------------------------------------------------

export interface HotItem {
  label: string;
  count: number;
}

// ---------------------------------------------------------------------------
// DailyDigest — combined V2 + V3 fields. `schema_version` selects render path.
// ---------------------------------------------------------------------------

export type SchemaVersion = 'v2' | 'v3';

export interface DailyDigest {
  // Meta
  generated_at: string;
  window_hours: number;
  input_tweet_count: number;
  tracked_kols: string[];
  model_version: string;
  schema_version: SchemaVersion;

  // Shared
  takeaway: string[];

  // V2 (legacy)
  macro_picks: CuratedTweet[];
  industry_picks: CuratedTweet[];
  stock_picks: CuratedTweet[];

  // V3
  headline: string;
  intro: string;
  topics: Topic[];
  briefs: Brief[];
  solo_voices: SoloVoice[];
  crosscut: string;
  watch_next: string[];

  // V3.1
  hot_sectors?: HotItem[];
  hot_tickers?: HotItem[];
  hot_events?: HotItem[];
}
