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

export interface StanceCounts {
  bullish: number;
  bearish: number;
  neutral: number;
}

export interface HotItem {
  label: string;
  count: number;
  /** Distinct KOL authors mentioning this label. <= count. */
  kols?: number;
  /**
   * Topic-level stance distribution, projected from topics whose
   * primary_ticker matches this label. Only present for tickers with at
   * least one topic-level stance signal; otherwise UI hides the bar.
   */
  stance?: StanceCounts | null;
}

// ---------------------------------------------------------------------------
// V4 types — ticker-as-topic + 论据指向
// ---------------------------------------------------------------------------

/**
 * 论据指向. Decision-input direction of an argument:
 *   - 'buy':         论据支持考虑买入/加仓 (利好催化、估值便宜、基本面改善...)
 *   - 'sell':        论据支持考虑卖出/回避 (利空、估值过高、风险暴露...)
 *   - 'observation': 客观信息,不直接指向买卖 (数据/研究/财报数据/新闻)
 */
export type Direction = 'buy' | 'sell' | 'observation';

export interface Argument {
  kol: string;
  point_zh: string;
  direction: Direction;
  tweet_url: string;
}

export interface TickerThesis {
  ticker: string;          // "NVDA" (no $ prefix)
  primary_kols: string[];
  tweet_count: number;
  synthesis_zh: string;
  buy_arguments: Argument[];
  sell_arguments: Argument[];
  observation_arguments: Argument[];
}

export interface MacroThread {
  title: string;
  layer: 'macro' | 'industry';
  primary_kols: string[];
  synthesis_zh: string;
  key_points: Argument[];
}

// V4.1 — 其他热议 (transparency tail)
export interface OtherTickerMention {
  ticker: string;
  mentions: number;
  kols: number;
}

export interface NotableTweet {
  kol: string;
  summary_zh: string;
  tweet_url: string;
  engagement: number;
  tickers: string[];
}

// V4.2 — 短期未来注意点
export interface WatchpointItem {
  title: string;
  date_hint: string;
  why_it_matters_zh: string;
  related_tickers: string[];
  /** V4.3: source tweet citations (2-5 evidence Arguments). */
  evidence?: Argument[];
  kols_watching: string[];
}

// ---------------------------------------------------------------------------
// DailyDigest — combined V2 + V3 + V4 fields. `schema_version` selects render path.
// ---------------------------------------------------------------------------

export type SchemaVersion = 'v2' | 'v3' | 'v4';

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

  // V4
  ticker_theses?: TickerThesis[];
  macro_threads?: MacroThread[];

  // V4.1
  other_tickers?: OtherTickerMention[];
  notable_tweets?: NotableTweet[];

  // V4.2
  watchpoints?: WatchpointItem[];
}
