// Frontend mirror of backend twitter_digest/models.py.

// ---------------------------------------------------------------------------
// Hot lists — backend-computed frequency tallies (kept candidate tweets)
// ---------------------------------------------------------------------------

export interface HotItem {
  label: string;
  count: number;
  /** Distinct KOL authors mentioning this label. <= count. */
  kols?: number;
}

// ---------------------------------------------------------------------------
// Argument direction — decision-input classification
//   - 'buy':         论据支持考虑买入/加仓
//   - 'sell':        论据支持考虑卖出/回避
//   - 'observation': 客观信息,不直接指向买卖
// ---------------------------------------------------------------------------

export type Direction = 'buy' | 'sell' | 'observation';

export interface Argument {
  kol: string;
  point_zh: string;
  direction: Direction;
  tweet_url: string;
}

export type TickerSide = 'disputed' | 'bull' | 'bear';

export interface TickerThesis {
  ticker: string;          // "NVDA" (no $ prefix)
  /** Aggregate stance computed by the backend. Legacy rows default to 'bull'. */
  side?: TickerSide;
  primary_kols: string[];
  tweet_count: number;
  /** 10-25 字 nuanced one-liner ("多空在估值上打架, 长线派坚守 2030 目标"). Empty for legacy rows. */
  stance_summary?: string;
  /** 30-80 字 plain-language gist of what people are saying. */
  synthesis_zh: string;
  buy_arguments: Argument[];
  sell_arguments: Argument[];
  observation_arguments: Argument[];
  /** Argument counts preserved when the lists are stripped for non-Max users. */
  buy_count?: number;
  sell_count?: number;
  observation_count?: number;
}

export interface MacroThread {
  title: string;
  layer: 'macro' | 'industry';
  primary_kols: string[];
  synthesis_zh: string;
  key_points: Argument[];
  /** Count preserved when `key_points` is stripped for non-Max users. */
  key_points_count?: number;
}

export interface OtherTickerMention {
  ticker: string;
  mentions: number;
  kols: number;
}

export interface WatchpointItem {
  title: string;
  date_hint: string;
  why_it_matters_zh: string;
  related_tickers: string[];
  /** Source tweet citations (2-5 evidence Arguments). */
  evidence?: Argument[];
  /** Count preserved when `evidence` is stripped for non-Max users. */
  evidence_count?: number;
  kols_watching: string[];
}

// ---------------------------------------------------------------------------
// DailyDigest — persisted in kol_daily_digests, returned by the API.
// ---------------------------------------------------------------------------

export interface DailyDigest {
  // Meta
  /** BJT business date (YYYY-MM-DD). Empty string for legacy rows pre-2026-05. */
  date: string;
  generated_at: string;
  window_hours: number;
  input_tweet_count: number;
  tracked_kols: string[];
  model_version: string;

  // Editorial
  headline: string;
  intro: string;

  // Hot lists
  hot_sectors: HotItem[];
  hot_tickers: HotItem[];
  hot_events: HotItem[];

  // Main content
  ticker_theses: TickerThesis[];
  macro_threads: MacroThread[];
  watchpoints: WatchpointItem[];

  // Transparency tail
  other_tickers: OtherTickerMention[];

  /**
   * Paywall flag. True when the heavy paid content (synthesis paragraphs,
   * KOL arguments, evidence, why-it-matters write-ups) has been stripped
   * by the backend because the caller lacks the `twitter_digest`
   * entitlement. The structural skeleton (headline / hot lists / per-section
   * titles + KOL lists + counts) is still populated, so the same DigestView
   * component can render a locked skeleton in place of paid content.
   */
  is_locked?: boolean;
}
