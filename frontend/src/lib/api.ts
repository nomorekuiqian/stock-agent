import { getAccessTokenAsync as getAccessToken, refreshSession } from '@/contexts/AuthContext';
import type { DailyDigest } from '@/app/twitter-digest/_components/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}


export interface MarketIndex {
  name: string;
  value: number;
  previous_value?: number;
  change_percent?: number;
}

export interface EconomicEvent {
  date: string;
  event: string;
  previous?: string | number | null;
  estimate?: string | number | null;
  is_key_event?: boolean;
}

export interface EarningsEvent {
  symbol: string;
  date: string;
  epsEstimated?: number | null;
  revenueEstimated?: number | null;
  is_ai_related?: boolean;
}

export interface CalendarEvent {
  date: string;
  event: string;
  analysis: string;
}

export interface HeadlineNews {
  title: string;
  fact_summary: string;
  deep_analysis: string;
  url: string;
  published_at?: string;
}

export interface BriefNews {
  title: string;
  summary: string;
  analysis: string;
  url: string;
  published_at?: string;
}

export interface NewsSection {
  headlines: HeadlineNews[];
  briefs: BriefNews[];
}

export interface SummarySection {
  title: string;
  content: string;
}

// MarketData from backend API - matches database schema (snake_case)
export interface MarketData {
  report_id?: string;
  report_date?: string;
  indices: MarketIndex[];
  timestamp: string;
  title?: string;
  summary?: string;
  intro?: string;
  news?: NewsSection;
  report_summary?: SummarySection[] | string;
  calendar?: CalendarEvent[];
  market_data?: unknown;
  from_cache?: boolean;
}

export interface SendEmailResponse {
  success: boolean;
  message: string;
  email_id?: string;
  sent_to?: string;
}

// PersonalDigest Types

export interface StockAnalysis {
  symbol: string;
  name: string;
  price: number;
  daily_change: string;
  week_change?: string;
  status: string;
  quick_take: string;
}

export interface DigestHeadlineNews {
  title: string;
  related_symbols: string[];
  fact_summary: string;
  deep_analysis: string;
  url: string;
  published_at?: string;
}

export interface DigestBriefNews {
  title: string;
  related_symbols: string[];
  summary: string;
  analysis: string;
  url: string;
  published_at?: string;
}

export interface DigestNewsSection {
  headlines: DigestHeadlineNews[];
  briefs: DigestBriefNews[];
}

export interface DigestEvent {
  date: string;
  event: string;
  related_symbols: string[];
  why_important: string;
}

export interface DigestSummary {
  content: string;
}

export interface DigestResponse {
  success: boolean;
  timestamp: string;
  symbols_used: string[];

  // Header
  greeting: string;
  one_line_summary: string;

  // Section 1: Portfolio Overview
  stocks: StockAnalysis[];

  // Section 2: News (Headline + Brief structure)
  news: DigestNewsSection;

  // Section 3: Upcoming Events
  events: DigestEvent[];

  // Section 4: Summary (replaces macro_impact + bottom_line)
  summary: DigestSummary;

  // Cache indicator
  from_cache?: boolean;

  // Error handling
  error?: string;

  action_items?: Array<{
    label: string;
    target: string;
    reason: string;
    priority: 1 | 2 | 3;
  }>;
}

export interface SubscribeResponse {
  success: boolean;
  message: string;
  email: string;
  contact_id?: string;
}

export interface UnsubscribeResponse {
  success: boolean;
  message: string;
  email: string;
}

// Subscription Management Types
export type SubscriptionChannel = 'daily_report' | 'personal_digest' | 'weekly_report';

export interface SubscriptionResponse {
  success: boolean;
  channel: string;
  email: string;
  contact_id?: string;
  metadata?: Record<string, unknown>;
  error?: string;
}

export interface SubscriptionStatusResponse {
  success: boolean;
  channel: string;
  subscribed: boolean;
  email: string;
  metadata: Record<string, unknown>;
  error?: string;
}

export interface SubscribeData {
  email: string;
  first_name?: string;
  user_id?: string;
  symbols?: string[];
}

export interface UpdateSubscriptionData {
  email: string;
  first_name?: string;
}

export interface SyncedChannelInfo {
  channel: string;
  subscribed: boolean;
  metadata: Record<string, unknown>;
}

export interface SyncUserResponse {
  success: boolean;
  email: string;
  user_id: string;
  synced_channels: SyncedChannelInfo[];
  errors: string[];
}

export interface EmailPreferences {
  morning_report: boolean;
  daily_report: boolean;
  weekly_report: boolean;
  personal_digest: boolean;
  twitter_digest: boolean;
}

export interface PreferencesResponse {
  success: boolean;
  preferences: EmailPreferences;
}

export interface EmailPreviewResponse {
  success: boolean;
  html: string;
  report_id: string;
  report_date: string;
}

export interface DigestPreviewResponse {
  success: boolean;
  html: string;
  digest_id: string;
  digest_date: string;
  user_id: string;
  symbols: string[];
}

export interface WeeklyPreviewResponse {
  success: boolean;
  html: string;
  week_label: string;
  title: string;
  report_id: string;
  generated_at: string;
}

// Liquidity Monitor Types
export interface LiquidityMetric {
  series_id: string;
  title: string;
  value: number | null;
  date: string | null;
  units: string;
  change: number | null;
  previous_date?: string | null;
  formula?: string;
  error?: string;
}

export interface LiquidityMetrics {
  fed_assets: LiquidityMetric;
  tga: LiquidityMetric;
  rrp: LiquidityMetric;
  reserves: LiquidityMetric;
  sofr: LiquidityMetric;
  effr: LiquidityMetric;
  nfci: LiquidityMetric;
  net_liquidity: LiquidityMetric;
}

export interface LiquidityMetricsResponse {
  success: boolean;
  timestamp: string;
  metrics: LiquidityMetrics;
}

export interface LiquidityHistoryObservation {
  time: string;
  value: number;
  fed_assets: number;
  tga: number;
  rrp: number;
  reserves?: number;
  sofr?: number;
  effr?: number;
  nfci?: number;
}

export interface LiquidityHistoryData {
  series_id: string;
  title: string;
  units: string;
  formula: string;
  observations: LiquidityHistoryObservation[];
  metrics?: LiquidityMetrics;
}

export interface LiquidityHistoryResponse {
  success: boolean;
  timestamp: string;
  data: LiquidityHistoryData;
}

// Global Liquidity Types
export interface GlobalLiquidityMetric {
  series_id: string;
  title: string;
  value: number | null;
  raw_value?: number | null;
  date: string | null;
  units: string;
  change: number | null;
  previous_date?: string | null;
  components_available?: number;
  components_total?: number;
  partial?: boolean;
}

export interface GlobalLiquidityIndex {
  series_id: string;
  title: string;
  value: number | null;
  date: string | null;
  units: string;
  formula: string;
}

export interface GlobalLiquidityMetrics {
  global_liquidity: GlobalLiquidityIndex;
  fed_assets: GlobalLiquidityMetric;
  us_m2: GlobalLiquidityMetric;
  ecb_assets: GlobalLiquidityMetric;
  boj_assets: GlobalLiquidityMetric;
  fx_rates?: {
    eurusd: number | null;
    usdjpy: number | null;
  };
}

export interface GlobalLiquidityResponse {
  success: boolean;
  timestamp: string;
  data: GlobalLiquidityMetrics;
}

export interface GlobalLiquidityHistoryObservation {
  time: string;
  value: number | null;
}

export interface GlobalLiquidityHistoryData {
  series_id: string;
  title: string;
  units: string;
  observations: GlobalLiquidityHistoryObservation[];
}

export interface GlobalLiquidityHistoryResponse {
  success: boolean;
  timestamp: string;
  data: GlobalLiquidityHistoryData;
}

// Stock Search Types
export interface StockSearchResult {
  symbol: string;
  name: string;
  type: string;
  exchange: string;
}

export interface StockSearchResponse {
  stocks: StockSearchResult[];
}

// Stock Quote Types
export interface StockQuote {
  symbol: string;
  name: string;
  price: number;
  daily_change: number;
}

export interface StockQuotesResponse {
  success: boolean;
  quotes: StockQuote[];
}

// Macro Risk Dashboard Types
export interface RiskIndicator {
  series_id: string;
  name: string;
  value: number | null;
  date: string | null;
  units: string;
  change: number | null;
  previous_value: number | null;
  source: string;
}

export interface CategoryRiskScore {
  category_id: number;
  category_name: string;
  risk_score: number;
  risk_level: string;
  headline: string;
  indicators: RiskIndicator[];
}

export interface AIStockInfo {
  symbol: string;
  price: number | null;
  daily_change: number | null;
  name: string;
}

export interface MacroRiskDashboardResponse {
  success: boolean;
  timestamp: string;
  composite_score: number;
  composite_level: string;
  categories: CategoryRiskScore[];
  ai_stocks: AIStockInfo[];
  liquidity_summary: {
    nfci: { value: number | null; date: string | null; change: number | null };
    net_liquidity: { value: number | null; date: string | null; units: string; change: number | null };
  } | null;
}

// Economic Fundamentals Types
export interface SubDimension {
  name: string;
  name_zh: string;
  score: number;
  risk_level: string;
  weight: number;
  headline: string;
  indicators: RiskIndicator[];
}

export interface EconomicFundamentals {
  timestamp: string;
  overall_score: number;
  overall_level: string;
  overall_headline: string;
  sub_dimensions: SubDimension[];
}

export interface EconomicFundamentalsResponse {
  success: boolean;
  timestamp: string;
  data: EconomicFundamentals;
}

// CPI Breakdown Types
export interface CpiComponent {
  series_id: string;
  name: string;
  name_zh: string;
  value: number | null;
  date: string | null;
  yoy_pct: number | null;
  mom_pct: number | null;
}

export interface CpiBreakdownResponse {
  success: boolean;
  timestamp: string;
  components: CpiComponent[];
}

// Treasury & Commodities Types
export interface TreasuryRate {
  rate: number;
  daily_change_bps: number | null;
}

export interface TreasuryCommoditiesResponse {
  success: boolean;
  timestamp: string;
  treasury: {
    date: string | null;
    rates: Record<string, TreasuryRate>;
    spreads: Record<string, number>;
    yield_curve_shape: string;
  };
  commodities: Record<string, {
    price: number | null;
    changePercent: number | null;
    previousClose: number | null;
    dayHigh: number | null;
    dayLow: number | null;
    symbol: string;
  }>;
  dollar: {
    price: number | null;
    daily_change: number | null;
  };
}

// OHLCV History Response (shared by sentiment + commodity history)
export interface OhlcvHistoryResponse {
  success: boolean;
  symbol: string;
  count: number;
  data: Array<{ date: string; open: number; high: number; low: number; close: number; volume: number }>;
}

function fetchOhlcvHistory(pathSegment: string) {
  return async (symbol: string, days: number = 730): Promise<OhlcvHistoryResponse> => {
    const response = await fetch(`${API_BASE_URL}/macro-risk/${pathSegment}/history/${symbol}?days=${days}`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: `Failed to fetch ${pathSegment} history` }));
      throw new Error(error.detail || `Failed to fetch ${pathSegment} history`);
    }
    return response.json();
  };
}

// Weekly Macro Report Types
export interface SectionAnalysis {
  summary: string;
  data_changes: string;
  trend_interpretation: string;
  market_implication: string;
}

export interface SignalLights {
  liquidity: 'green' | 'yellow' | 'red';
  economy: 'green' | 'yellow' | 'red';
  inflation: 'green' | 'yellow' | 'red';
  sentiment: 'green' | 'yellow' | 'red';
}

export interface WeekAheadEvent {
  date: string;
  event: string;
  if_above: string;
  if_below: string;
}

export interface WeeklyMacroReport {
  week_label: string;
  generated_at: string;
  title: string;
  verdict: string;
  signal_lights: SignalLights;
  landscape: string;
  narrative: string;
  takeaway: string;
  liquidity_analysis: SectionAnalysis;
  economy_analysis: SectionAnalysis;
  inflation_analysis: SectionAnalysis;
  sentiment_analysis: SectionAnalysis;
  week_ahead: WeekAheadEvent[];
}

export interface WeeklyReportResponse {
  success: boolean;
  data: WeeklyMacroReport | null;
}

// --- Data types for backend-proxied reads ---

export interface ReportListItem {
  id: string;
  report_date: string;
  timestamp: string;
  title?: string;
  summary?: string;
  created_at?: string;
}

// --- Morning Report Types ---

export interface MorningFuturesQuote {
  name: string;
  value: number;
  daily_change: number;
}

export interface MorningMarketQuote {
  name: string;
  value: number;
  daily_change: number;
}

export interface MorningGlobalSnapshot {
  asia: MorningMarketQuote[];
  europe: MorningMarketQuote[];
  other: MorningMarketQuote[];
}

export interface MorningOvernightItem {
  title: string;
  analysis: string;
  url?: string;
  published_at?: string;
}

export interface MorningTodayFocusItem {
  title: string;
  analysis: string;
  time?: string;
}

export interface MorningSummarySection {
  title: string;
  content: string;
}

export interface MorningReport {
  report_id?: string;
  report_date?: string;
  timestamp: string;
  title: string;
  market_pulse: string;
  futures: MorningFuturesQuote[];
  futures_analysis?: string;
  global_markets: MorningGlobalSnapshot;
  global_markets_analysis?: string;
  overnight_news: MorningOvernightItem[];
  today_focus: MorningTodayFocusItem[];
  summary: MorningSummarySection[];
  market_data?: unknown;
  from_cache?: boolean;
}

export interface MorningReportListItem {
  id: string;
  report_date: string;
  timestamp: string;
  title?: string;
  market_pulse?: string;
  created_at?: string;
}

// Portfolio & Investment Profile types
export interface HoldingInput {
  symbol: string;
  weight_pct?: number | null;
  shares?: number | null;
  cost_basis?: number | null;
  entry_price?: number | null;
  thesis?: string | null;
  target?: number | null;
  stop_loss?: number | null;
  conviction?: number | null;
}

export interface HoldingView {
  symbol: string;
  weight_pct: number | null;
  shares: number | null;
  cost_basis: number | null;
  entry_price: number | null;
  market_value: number | null;
  unrealized_pnl: number | null;
  thesis: string | null;
  target: number | null;
  stop_loss: number | null;
  conviction: number | null;
  effective_weight_pct: number;
  weight_source: 'shares_x_price' | 'cost_basis' | 'weight_pct' | 'equal' | 'ghost';
}

export interface PortfolioListResponse {
  holdings: HoldingView[];
  total_weight_pct: number;
}

export type InvestmentStyle = 'passive' | 'balanced' | 'active';
export type InvestmentHorizon = 'short' | 'mid' | 'long';
export type RiskTolerance = 'low' | 'moderate' | 'high';
export type NotifyMode = 'silent' | 'events_only' | 'daily';

export interface InvestmentProfileInput {
  style?: InvestmentStyle;
  horizon?: InvestmentHorizon;
  risk_tolerance?: RiskTolerance;
  notify_mode?: NotifyMode;
}

export interface InvestmentProfileView {
  user_id: string;
  style: InvestmentStyle;
  horizon: InvestmentHorizon;
  risk_tolerance: RiskTolerance;
  notify_mode: NotifyMode;
  version: number;
  onboarded_at: string | null;
  portfolio_confirmed_at: string | null;
  updated_at: string | null;
}

// Portfolio Health
export interface HealthScore {
  dispersion: number;
  performance: number;
  macro_fit: number;
  stability: number;
  total: number;
}

export interface NextAction {
  type: 'rebalance' | 'research' | 'none';
  text: string;
  symbols: string[];
}

export interface DiagnosisOutput {
  one_line: string;
  diagnosis_markdown: string;
  top_risk: string;
  sector_dna: string;
  macro_sensitivity_tag: 'low' | 'mid' | 'high';
  next_action: NextAction;
}

export interface HealthResponse {
  report_id?: string;
  score: HealthScore;
  diagnosis: DiagnosisOutput | null;
  generated_at: string;
  from_cache: boolean;
  is_first_report: boolean;
}

export interface HealthLatestResponse {
  health_score: number | null;
  top_risk: string | null;
  next_action: NextAction | null;
  generated_at: string | null;
  stale: boolean;
}

// Action Bar
export type ActionChipKind =
  | 'event'
  | 'health'
  | 'drawdown'
  | 'stable'
  | 'research'
  | 'guide'
  | 'thesis'
  | 'recap'
  | 'section';

export interface ActionChip {
  label: string;
  // `target` is the routing source of truth (e.g., "thesis:NVDA", "section:notes",
  // "digest:<uuid>"). `link` is a legacy best-effort URL kept for backwards compat.
  target: string;
  link: string;
  kind: ActionChipKind;
}

export interface ActionBarResponse {
  severity: 'green' | 'yellow' | 'red';
  headline: string;
  chips: ActionChip[];
  source: 'template' | 'llm' | 'llm_fallback' | 'agent';
  visibility?: 'visible' | 'hidden';
  generated_at: string;
}

// Feedback
export interface FeedbackInput {
  target_type: 'digest_quick_take' | 'digest_headline' | 'health_diagnosis' | 'action_bar_headline' | 'action_bar_chip' | 'top_event';
  target_id: string;
  sentiment: 1 | -1;
  reason?: string;
  snapshot?: { text?: string; [key: string]: unknown };
}

export interface WatchlistData {
  user_id: string;
  email?: string;
  symbols: string[];
  created_at?: string;
  updated_at?: string;
}

export interface SaveWatchlistResponse {
  success: boolean;
  error?: string;
  action?: string;
  data?: WatchlistData;
}

export interface UserDigestItem {
  id?: string;
  user_id: string;
  digest_date: string;
  symbols: string[];
  analysis: string;
  greeting?: string;
  one_line_summary?: string;
  bottom_line?: string;
  digest_data?: {
    stocks?: StockAnalysis[];
    news?: DigestNewsSection;
    events?: DigestEvent[];
    summary?: DigestSummary;
  };
  created_at?: string;
}

// Screener Types
export interface ScreenerFilterRequest {
  strategy: string;
  sector?: string | null;
  params?: Record<string, unknown> | null;
}

export interface ScreenerSuggestionOption {
  value: string;
  label: string;
  count?: number;
}

export interface ScreenerSuggestion {
  dimension: string;
  label: string;
  type: 'categorical' | 'sort';
  options?: ScreenerSuggestionOption[];
  description?: string;
}

export interface ScreenerFilterResult {
  success: boolean;
  strategy: string;
  candidates: Record<string, unknown>[];
  candidate_count: number;
  universe_size: number;
  data_freshness: string | null;
  is_stale: boolean;
  suggestions: ScreenerSuggestion[];
}

export interface ScreenerStatusEntry {
  key: string;
  fetched_at: string | null;
  source: string | null;
  is_valid: boolean;
  error: string | null;
}

export interface ScreenerStatusResponse {
  success: boolean;
  timestamp: string;
  entries: ScreenerStatusEntry[];
  count: number;
}

export interface ScreenerSector {
  value: string;
  label_zh: string;
  label: string;
  count: number;
}

export interface ScreenerSectorsResponse {
  success: boolean;
  sectors: ScreenerSector[];
  count: number;
}

export interface SectorInfo {
  id: string;
  label: string;
  name_zh: string;
  name_en: string;
  symbols: string[];
  symbol_count: number;
  description: string;
}

export interface ScreenerAskRequest {
  message: string;
  current_filters?: { field: string; op: string; value: unknown }[];
  history?: { role: string; content?: string; summary?: string }[];
}

export interface ScreenerAskResult {
  success: boolean;
  filter_used: Record<string, unknown>;
  candidates: Record<string, unknown>[];
  candidate_count: number;
  universe_size: number;
  suggestions: ScreenerSuggestion[];
  summary: string;
  data_freshness: string | null;
  is_stale: boolean;
}

// Stock Research Agent types

export interface ResearchRequest {
  message: string;
  history?: { role: string; content: string }[];
  accumulated_filters?: { field: string; op: string; value: unknown }[];
  active_context?: {
    type: string;
    symbol?: string;
    quote?: Record<string, unknown>;
    fundamentals?: Record<string, unknown>;
    // Stock earnings data
    earnings_history?: unknown[];
    financial_growth?: unknown[];
    income_statements?: unknown[];
    // Stock technical data
    technical_derived?: Record<string, unknown>;
    support_resistance?: Record<string, unknown>;
    // Stock market data
    recent_news?: unknown[];
    // daily_report fields
    date?: string;
    title?: string;
    summary?: string;
    intro?: string;
    news?: unknown;
    report_summary?: unknown;
    calendar?: unknown;
    // macro fields
    week_label?: string;
    verdict?: string;
    signal_lights?: Record<string, string>;
    landscape?: string;
    narrative?: string;
    takeaway?: string;
    // morning_report fields
    market_pulse?: string;
    futures?: unknown;
    global_markets?: unknown;
    overnight_news?: unknown;
    today_focus?: unknown;
    morning_summary?: unknown;
    // brew (personal digest) fields
    digest_date?: string;
    symbols_used?: string[];
    greeting?: string;
    one_line_summary?: string;
    stocks?: unknown;
    events?: unknown;
    summary_content?: string;
    // macro sub-page fields (legacy flat format)
    net_liquidity?: number;
    net_liquidity_change?: number;
    overall_headline?: string;
    dimensions?: unknown;
    cpi_components?: unknown;
    overall_score?: number;
    // Unified macro panel data (all dimensions in one payload)
    active_tab?: string;
    liquidity?: unknown;
    economy?: unknown;
    inflation?: unknown;
    sentiment?: unknown;
  };
}

export interface ResearchResult {
  success: boolean;
  message: string;
  options: string[];
  candidates: Record<string, unknown>[];
  candidate_count: number;
  universe_size: number;
  recommendations: { symbol: string; reason: string }[];
  accumulated_filters: { field: string; op: string; value: unknown }[];
  reset_results: boolean;
  title: string;
  navigate?: { type: string; params: Record<string, string>; reason?: string } | null;
  data_freshness: string | null;
  is_stale: boolean;
}

// Research Conversation types

export interface ConversationSummary {
  id: string;
  title: string;
  message_count: number;
  updated_at: string;
}

export interface ConversationSaveRequest {
  title: string;
  data: Record<string, unknown>;
  message_count: number;
}

// ===========================================================================
// KOL Persona Research Agent (qinbafrank-style投研助手)
// ===========================================================================

export interface KolPersonaSummary {
  username: string;
  display_name: string;
  description: string;
  lenses_available: string[];
  last_indexed_at: string | null;
}

export interface KolPersonaChunk {
  citation_index: number;
  source_id: string;
  title: string | null;
  url: string | null;
  content: string;
  similarity: number;
  author_username: string | null;
  created_at: string | null;
  tickers: string[];
  metadata: Record<string, unknown>;
}

export interface KolToolCallSummary {
  name: string;
  args_summary: string | null;
  duration_ms: number | null;
  ok: boolean;
}

export interface KolResearchMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface KolResearchRequest {
  message: string;
  history?: KolResearchMessage[];
  persona_username?: string;
  content_context?: Record<string, unknown>;
}

export interface KolResearchResponse {
  persona_username: string;
  message: string;
  kol_chunks: KolPersonaChunk[];
  activated_skills: string[];
  tool_calls: KolToolCallSummary[];
  navigate: Record<string, unknown> | null;
}

export interface KolConversationSaveRequest {
  title: string;
  data: Record<string, unknown>;
  message_count: number;
  persona_username: string;
}

export type KolResearchStreamEvent =
  | { type: 'skill_activated'; skill_name: string; description: string }
  | { type: 'tool_call_start'; tool: string; description: string }
  | { type: 'tool_call_end'; tool: string; duration_ms: number | null }
  | { type: 'final'; data: KolResearchResponse }
  | { type: 'error'; error: string };

export interface ResearchKBMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ResearchKBRequest {
  message: string;
  history?: ResearchKBMessage[];
}

export interface RetrievedChunk {
  content: string;
  title?: string;
  source_type: string;
  source_id: string;
  url?: string;
  similarity: number;
}

export interface ResearchKBResponse {
  answer: string;
  chunks_used: RetrievedChunk[];
}

export type MethodologyCategory =
  | 'stock_analysis'
  | 'sector_analysis'
  | 'macro_analysis'
  | 'trading_strategy'
  | 'risk_management'
  | 'methodology';

export interface MethodologyChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface MethodologyChatRequest {
  message: string;
  username?: string;
  category?: MethodologyCategory | null;
  history?: MethodologyChatMessage[];
}

export interface MethodologyCitation {
  tweet_id: string;
  quote: string;
  reason: string;
}

export interface MethodologyLiveContext {
  topic: string;
  symbols: string[];
  quotes: Array<Record<string, unknown>>;
  news_events: Array<Record<string, unknown>>;
  calendar_events: Array<Record<string, unknown>>;
  market_reports: Array<Record<string, unknown>>;
  sources: string[];
  data_timestamp: string;
  limitations: string[];
}

export interface MethodologyChatResponse {
  success: boolean;
  analyst: string;
  category: MethodologyCategory;
  answer: string;
  citations: MethodologyCitation[];
  live_context?: MethodologyLiveContext | null;
  confidence: 'high' | 'medium' | 'low';
  limitations: string[];
  suggested_followups: string[];
}

export interface MethodologyChatStreamEvent {
  event: 'status' | 'live_context' | 'final' | 'error';
  data: {
    step?: string;
    message?: string;
    category?: MethodologyCategory;
    live_context?: MethodologyLiveContext;
    detail?: string;
  } & Partial<MethodologyChatResponse>;
}

export interface MethodologyConversationData {
  username: string;
  category: MethodologyCategory | null;
  messages: unknown[];
}

export interface MethodologyConversation {
  id: string;
  user_id: string;
  username: string;
  title: string;
  data: MethodologyConversationData;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface MethodologyConversationSaveRequest {
  username: string;
  title: string;
  data: MethodologyConversationData;
  message_count: number;
}

const AUTH_EXPIRED_ERROR = '登录已过期，请刷新页面或重新登录';

async function _authHeaders(
  base: Record<string, string> = {},
  { required = false }: { required?: boolean } = {},
): Promise<Record<string, string>> {
  const token = await getAccessToken();
  if (token) {
    return { ...base, Authorization: `Bearer ${token}` };
  }
  if (required) {
    throw new Error(AUTH_EXPIRED_ERROR);
  }
  return base;
}

async function readApiError(response: Response, fallback: string): Promise<string> {
  const error = await response.json().catch(() => ({ detail: fallback }));
  return error.detail || error.error || fallback;
}

async function throwProtectedApiError(response: Response, fallback: string): Promise<never> {
  if (response.status === 401) {
    throw new Error(AUTH_EXPIRED_ERROR);
  }

  throw new Error(await readApiError(response, fallback));
}

function toHeaderRecord(headers?: HeadersInit): Record<string, string> {
  if (!headers) {
    return {};
  }

  const nextHeaders: Record<string, string> = {};
  new Headers(headers).forEach((value, key) => {
    nextHeaders[key] = value;
  });
  return nextHeaders;
}

async function fetchProtected(
  url: string,
  init: RequestInit = {},
  fallback: string,
): Promise<Response> {
  void fallback;
  const baseHeaders = toHeaderRecord(init.headers);
  const response = await fetch(url, {
    ...init,
    headers: await _authHeaders(baseHeaders, { required: true }),
  });
  if (response.status === 401) {
    // Try refreshing the session and retry once
    const newToken = await refreshSession();
    if (newToken) {
      const retryResponse = await fetch(url, {
        ...init,
        headers: { ...baseHeaders, Authorization: `Bearer ${newToken}` },
      });
      if (!retryResponse.ok && retryResponse.status === 401) {
        throw new Error(AUTH_EXPIRED_ERROR);
      }
      return retryResponse;
    }
    throw new Error(AUTH_EXPIRED_ERROR);
  }
  return response;
}

export const api = {
  getMarketAnalysis: async (force: boolean = false): Promise<MarketData> => {
    const response = await fetch(`${API_BASE_URL}/market`, {
      method: 'POST',
      headers: await _authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ force }),
    });
    if (!response.ok) {
      throw new Error('Failed to fetch market analysis');
    }
    return response.json();
  },

  sendReportEmail: async (email?: string): Promise<SendEmailResponse> => {
    const response = await fetch(`${API_BASE_URL}/report/send-test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to send email' }));
      throw new Error(error.detail || 'Failed to send email');
    }
    return response.json();
  },

  sendMorningReportEmail: async (email?: string): Promise<SendEmailResponse> => {
    const response = await fetch(`${API_BASE_URL}/morning-report/send-test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to send morning report email' }));
      throw new Error(error.detail || 'Failed to send morning report email');
    }
    return response.json();
  },

  generateMorningReport: async (force = false): Promise<unknown> => {
    const response = await fetch(`${API_BASE_URL}/morning`, {
      method: 'POST',
      headers: await _authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ force }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to generate morning report' }));
      throw new Error(error.detail || 'Failed to generate morning report');
    }
    return response.json();
  },

  generateDigest: async (symbols: string[]): Promise<DigestResponse> => {
    const response = await fetchProtected(`${API_BASE_URL}/digest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbols }),
    }, 'Failed to generate digest');
    if (!response.ok) {
      await throwProtectedApiError(response, 'Failed to generate digest');
    }
    return response.json();
  },

  // Legacy subscribe (for backward compatibility) - uses daily_report channel
  subscribe: async (email: string, firstName?: string): Promise<SubscribeResponse> => {
    const result = await api.subscriptions.subscribe('daily_report', { email, first_name: firstName });
    return {
      success: result.success,
      message: result.success ? 'Successfully subscribed' : (result.error || 'Failed to subscribe'),
      email: result.email,
      contact_id: result.contact_id,
    };
  },

  // Legacy unsubscribe (for backward compatibility) - uses daily_report channel
  unsubscribe: async (email: string): Promise<UnsubscribeResponse> => {
    const result = await api.subscriptions.unsubscribe('daily_report', email);
    return {
      success: result.success,
      message: result.success ? 'Successfully unsubscribed' : (result.error || 'Failed to unsubscribe'),
      email: result.email,
    };
  },

  // Unified Subscription Management API
  subscriptions: {
    subscribe: async (channel: SubscriptionChannel, data: SubscribeData): Promise<SubscriptionResponse> => {
      const response = await fetch(`${API_BASE_URL}/subscriptions/${channel}/subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Failed to subscribe' }));
        throw new Error(error.detail || 'Failed to subscribe');
      }
      return response.json();
    },

    unsubscribe: async (channel: SubscriptionChannel, email: string): Promise<SubscriptionResponse> => {
      const response = await fetch(`${API_BASE_URL}/subscriptions/${channel}/unsubscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Failed to unsubscribe' }));
        throw new Error(error.detail || 'Failed to unsubscribe');
      }
      return response.json();
    },

    getStatus: async (channel: SubscriptionChannel, email: string): Promise<SubscriptionStatusResponse> => {
      const url = `${API_BASE_URL}/subscriptions/${channel}/status?email=${encodeURIComponent(email)}`;
      let response: Response;
      try {
        response = await fetch(url);
      } catch {
        throw new Error(`Failed to reach API endpoint: ${url}. Check backend server status and NEXT_PUBLIC_API_URL.`);
      }
      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Failed to get status' }));
        throw new Error(error.detail || 'Failed to get status');
      }
      return response.json();
    },

    update: async (channel: SubscriptionChannel, data: UpdateSubscriptionData): Promise<SubscriptionResponse> => {
      const response = await fetch(`${API_BASE_URL}/subscriptions/${channel}/update`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Failed to update subscription' }));
        throw new Error(error.detail || 'Failed to update subscription');
      }
      return response.json();
    },

    /**
     * Sync a website user with their existing Resend subscriptions.
     * Call this when user logs in or registers to link their account
     * with any existing email subscriptions.
     */
    syncUser: async (userId: string, email: string, firstName?: string): Promise<SyncUserResponse> => {
      try {
        const response = await fetch(`${API_BASE_URL}/subscriptions/sync-user`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            user_id: userId,
            email: email,
            first_name: firstName,
          }),
        });
        if (!response.ok) {
          const error = await response.json().catch(() => ({ detail: 'Failed to sync user' }));
          console.warn('[API] Sync user failed:', error.detail);
          return { success: false, email, user_id: userId, synced_channels: [], errors: [error.detail] };
        }
        return response.json();
      } catch (error) {
        // Don't throw - sync is a background operation that shouldn't block login
        console.warn('[API] Sync user error:', error);
        return { success: false, email, user_id: userId, synced_channels: [], errors: [String(error)] };
      }
    },

    getPreferences: async (): Promise<PreferencesResponse> => {
      const headers = await _authHeaders({}, { required: true });
      const response = await fetch(`${API_BASE_URL}/subscriptions/preferences`, { headers });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Failed to get preferences' }));
        throw new Error(error.detail || 'Failed to get preferences');
      }
      return response.json();
    },

    updatePreferences: async (prefs: Partial<EmailPreferences>): Promise<PreferencesResponse> => {
      const headers = await _authHeaders({ 'Content-Type': 'application/json' }, { required: true });
      const response = await fetch(`${API_BASE_URL}/subscriptions/preferences`, {
        method: 'POST',
        headers,
        body: JSON.stringify(prefs),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Failed to update preferences' }));
        throw new Error(error.detail || 'Failed to update preferences');
      }
      return response.json();
    },
  },

  getEmailPreview: async (reportId?: string, firstName?: string): Promise<EmailPreviewResponse> => {
    const params = new URLSearchParams();
    if (reportId) params.append('report_id', reportId);
    if (firstName) params.append('first_name', firstName);
    const queryString = params.toString();
    const url = queryString
      ? `${API_BASE_URL}/report/preview?${queryString}`
      : `${API_BASE_URL}/report/preview`;
    const response = await fetch(url);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to get email preview' }));
      throw new Error(error.detail || 'Failed to get email preview');
    }
    return response.json();
  },

  getDigestPreview: async (params?: { userId?: string; digestId?: string }): Promise<DigestPreviewResponse> => {
    const searchParams = new URLSearchParams();
    if (params?.userId) searchParams.append('user_id', params.userId);
    if (params?.digestId) searchParams.append('digest_id', params.digestId);
    const queryString = searchParams.toString();
    const url = `${API_BASE_URL}/subscriptions/personal_digest/preview${queryString ? `?${queryString}` : ''}`;
    const response = await fetch(url);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to get digest preview' }));
      throw new Error(error.detail || 'Failed to get digest preview');
    }
    return response.json();
  },

  getWeeklyPreview: async (params?: { week?: string; firstName?: string }): Promise<WeeklyPreviewResponse> => {
    const searchParams = new URLSearchParams();
    if (params?.week) searchParams.append('week', params.week);
    if (params?.firstName) searchParams.append('first_name', params.firstName);
    const queryString = searchParams.toString();
    const url = `${API_BASE_URL}/weekly-report/preview${queryString ? `?${queryString}` : ''}`;
    const response = await fetch(url);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to get weekly report preview' }));
      throw new Error(error.detail || 'Failed to get weekly report preview');
    }
    return response.json();
  },

  getWelcomePreview: async (params?: { firstName?: string; email?: string }): Promise<{
    success: boolean;
    subject: string;
    html: string;
  }> => {
    const searchParams = new URLSearchParams();
    if (params?.firstName) searchParams.append('first_name', params.firstName);
    if (params?.email) searchParams.append('email', params.email);
    const qs = searchParams.toString();
    const response = await fetch(`${API_BASE_URL}/welcome/preview${qs ? `?${qs}` : ''}`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to get welcome preview' }));
      throw new Error(error.detail || 'Failed to get welcome preview');
    }
    return response.json();
  },

  getTwitterDigestPreview: async (date?: string): Promise<{
    success: boolean;
    html: string;
    digest_date: string | null;
    input_tweet_count: number;
    tracked_kol_count: number;
  }> => {
    const params = new URLSearchParams();
    if (date) params.append('date', date);
    const qs = params.toString();
    const url = `${API_BASE_URL}/twitter-digest/preview${qs ? `?${qs}` : ''}`;
    const response = await fetch(url);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to get twitter digest preview' }));
      throw new Error(error.detail || 'Failed to get twitter digest preview');
    }
    return response.json();
  },

  getOnboardingPreview: async (day: number = 1, firstName?: string): Promise<{
    success: boolean;
    day: number;
    subject: string;
    html: string;
    valid_days: number[];
  }> => {
    const params = new URLSearchParams({ day: String(day) });
    if (firstName) params.append('first_name', firstName);
    const response = await fetch(`${API_BASE_URL}/onboarding/preview?${params}`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to get onboarding preview' }));
      throw new Error(error.detail || 'Failed to get onboarding preview');
    }
    return response.json();
  },

  sendWeeklyReportEmail: async (email: string): Promise<SendEmailResponse> => {
    const response = await fetch(`${API_BASE_URL}/weekly-report/send-test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to send weekly report email' }));
      throw new Error(error.detail || 'Failed to send weekly report email');
    }
    return response.json();
  },

  // Liquidity Monitor APIs
  getLiquidityMetrics: async (): Promise<LiquidityMetricsResponse> => {
    const response = await fetch(`${API_BASE_URL}/liquidity/metrics`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to fetch liquidity metrics' }));
      throw new Error(error.detail || 'Failed to fetch liquidity metrics');
    }
    return response.json();
  },

  getLiquidityHistory: async (days: number = 365): Promise<LiquidityHistoryResponse> => {
    const response = await fetch(`${API_BASE_URL}/liquidity/history?days=${days}`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to fetch liquidity history' }));
      throw new Error(error.detail || 'Failed to fetch liquidity history');
    }
    return response.json();
  },

  // Global Liquidity API
  getGlobalLiquidity: async (): Promise<GlobalLiquidityResponse> => {
    const response = await fetch(`${API_BASE_URL}/liquidity/global`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to fetch global liquidity' }));
      throw new Error(error.detail || 'Failed to fetch global liquidity');
    }
    return response.json();
  },

  getGlobalLiquidityHistory: async (days: number = 365): Promise<GlobalLiquidityHistoryResponse> => {
    const response = await fetch(`${API_BASE_URL}/liquidity/global/history?days=${days}`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to fetch global liquidity history' }));
      throw new Error(error.detail || 'Failed to fetch global liquidity history');
    }
    return response.json();
  },

  // Macro Risk Dashboard API
  getMacroRiskDashboard: async (): Promise<MacroRiskDashboardResponse> => {
    const response = await fetch(`${API_BASE_URL}/macro-risk/dashboard`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to fetch macro risk dashboard' }));
      throw new Error(error.detail || 'Failed to fetch macro risk dashboard');
    }
    return response.json();
  },

  // Economic Fundamentals API
  getEconomicFundamentals: async (): Promise<EconomicFundamentalsResponse> => {
    const response = await fetch(`${API_BASE_URL}/macro-risk/economy`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to fetch economic fundamentals' }));
      throw new Error(error.detail || 'Failed to fetch economic fundamentals');
    }
    return response.json();
  },

  // Market Sentiment API
  getMarketSentiment: async (): Promise<EconomicFundamentalsResponse> => {
    const response = await fetch(`${API_BASE_URL}/macro-risk/sentiment`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to fetch market sentiment' }));
      throw new Error(error.detail || 'Failed to fetch market sentiment');
    }
    return response.json();
  },

  getSentimentHistory: fetchOhlcvHistory('sentiment'),

  getCommodityHistory: fetchOhlcvHistory('commodity'),

  getFredHistory: async (seriesId: string, days: number = 730, units?: string): Promise<{
    success: boolean;
    data: Array<{ date: string; close: number }>;
  }> => {
    const params = new URLSearchParams({ days: String(days) });
    if (units) params.set('units', units);
    const response = await fetch(`${API_BASE_URL}/macro-risk/history/${seriesId}?${params}`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to fetch FRED history' }));
      throw new Error(error.detail || 'Failed to fetch FRED history');
    }
    const json = await response.json();
    const observations: Array<{ date: string; value: number }> = json.data?.observations ?? [];
    return {
      success: true,
      data: observations
        .map((obs) => ({ date: obs.date, close: obs.value }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    };
  },

  // Inflation & Rates API
  getInflationRates: async (): Promise<EconomicFundamentalsResponse> => {
    const response = await fetch(`${API_BASE_URL}/macro-risk/inflation-rates`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to fetch inflation & rates' }));
      throw new Error(error.detail || 'Failed to fetch inflation & rates');
    }
    return response.json();
  },

  // CPI Breakdown API
  getCpiBreakdown: async (): Promise<CpiBreakdownResponse> => {
    const response = await fetch(`${API_BASE_URL}/macro-risk/cpi-breakdown`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to fetch CPI breakdown' }));
      throw new Error(error.detail || 'Failed to fetch CPI breakdown');
    }
    return response.json();
  },

  // Treasury & Commodities API
  getTreasuryCommodities: async (): Promise<TreasuryCommoditiesResponse> => {
    const response = await fetch(`${API_BASE_URL}/macro-risk/treasury-commodities`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to fetch treasury & commodities' }));
      throw new Error(error.detail || 'Failed to fetch treasury & commodities');
    }
    return response.json();
  },

  // Stock Search API
  searchStocks: async (query: string, limit: number = 8): Promise<StockSearchResponse> => {
    const response = await fetch(
      `${API_BASE_URL}/stocks/search?q=${encodeURIComponent(query)}&limit=${limit}`
    );
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to search stocks' }));
      throw new Error(error.detail || 'Failed to search stocks');
    }
    return response.json();
  },

  // Stock Quotes API
  getStockQuotes: async (symbols: string[]): Promise<StockQuotesResponse> => {
    if (symbols.length === 0) {
      return { success: true, quotes: [] };
    }
    const response = await fetch(
      `${API_BASE_URL}/stocks/quotes?symbols=${symbols.join(',')}`
    );
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to get stock quotes' }));
      throw new Error(error.detail || 'Failed to get stock quotes');
    }
    return response.json();
  },

  // --- Backend-proxied data reads (replaces direct Insforge SDK queries) ---

  morningReports: {
    getLatest: async (): Promise<MorningReport | null> => {
      const response = await fetch(`${API_BASE_URL}/morning/reports/latest`);
      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error('Failed to fetch latest morning report');
      }
      const json = await response.json();
      return json.data as MorningReport;
    },

    getByDate: async (date: string): Promise<MorningReport | null> => {
      const response = await fetch(`${API_BASE_URL}/morning/reports/date/${date}`);
      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error('Failed to fetch morning report');
      }
      const json = await response.json();
      return json.data as MorningReport;
    },

    getById: async (id: string): Promise<MorningReport | null> => {
      const response = await fetch(`${API_BASE_URL}/morning/reports/${id}`);
      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error('Failed to fetch morning report');
      }
      const json = await response.json();
      return json.data as MorningReport;
    },

    list: async (limit = 20, offset = 0): Promise<{ data: MorningReportListItem[]; total: number }> => {
      const response = await fetch(`${API_BASE_URL}/morning/reports?limit=${limit}&offset=${offset}`);
      if (!response.ok) {
        throw new Error('Failed to fetch morning reports');
      }
      const json = await response.json();
      return { data: json.data || [], total: json.total ?? json.data?.length ?? 0 };
    },
  },

  reports: {
    getLatest: async (): Promise<MarketData | null> => {
      const response = await fetch(`${API_BASE_URL}/market/reports/latest`, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error('Failed to fetch latest report');
      }
      const json = await response.json();
      return json.data as MarketData;
    },

    getByDate: async (date: string): Promise<MarketData | null> => {
      const response = await fetch(`${API_BASE_URL}/market/reports/date/${date}`, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error('Failed to fetch report');
      }
      const json = await response.json();
      return json.data as MarketData;
    },

    getById: async (id: string): Promise<MarketData | null> => {
      const response = await fetch(`${API_BASE_URL}/market/reports/${id}`, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error('Failed to fetch report');
      }
      const json = await response.json();
      return json.data as MarketData;
    },

    list: async (limit = 20, offset = 0): Promise<{ data: ReportListItem[]; total: number }> => {
      const response = await fetch(`${API_BASE_URL}/market/reports?limit=${limit}&offset=${offset}`, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) {
        throw new Error('Failed to fetch reports');
      }
      const json = await response.json();
      return { data: json.data || [], total: json.total ?? json.data?.length ?? 0 };
    },
  },

  sectors: {
    list: async (): Promise<SectorInfo[]> => {
      const response = await fetchProtected(`${API_BASE_URL}/sectors`, {}, 'Failed to fetch sectors');
      if (!response.ok) throw new Error('Failed to fetch sectors');
      const json = await response.json();
      return json.data ?? json ?? [];
    },
  },

  watchlist: {
    get: async (userId?: string): Promise<WatchlistData | null> => {
      void userId;
      const response = await fetchProtected(
        `${API_BASE_URL}/watchlist`,
        {},
        'Failed to fetch watchlist',
      );
      if (!response.ok) {
        await throwProtectedApiError(response, 'Failed to fetch watchlist');
      }
      const json = await response.json();
      if (!json.success) {
        throw new Error(json.error || json.detail || 'Failed to fetch watchlist');
      }
      return json.data || null;
    },

    save: async (
      _userId: string,
      symbols: string[],
      email: string = '',
      baseUpdatedAt?: string,
    ): Promise<SaveWatchlistResponse> => {
      const response = await fetchProtected(`${API_BASE_URL}/watchlist`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbols,
          email,
          base_updated_at: baseUpdatedAt,
        }),
      }, 'Failed to save watchlist');
      if (!response.ok) {
        if (response.status === 401) {
          await throwProtectedApiError(response, 'Failed to save watchlist');
        }
        throw new ApiError(
          await readApiError(response, 'Failed to save watchlist'),
          response.status,
        );
      }
      const json = await response.json();
      if (!json.success) {
        throw new ApiError(
          json.error || json.detail || 'Failed to save watchlist',
          response.status,
        );
      }
      return json as SaveWatchlistResponse;
    },
  },

  digests: {
    list: async (_userId: string, limit = 10, offset = 0): Promise<{ data: UserDigestItem[]; total: number }> => {
      const response = await fetchProtected(
        `${API_BASE_URL}/digests?limit=${limit}&offset=${offset}`,
        {},
        'Failed to fetch digests',
      );
      if (!response.ok) {
        await throwProtectedApiError(response, 'Failed to fetch digests');
      }
      const json = await response.json();
      return { data: json.data || [], total: json.total || 0 };
    },

    getById: async (id: string): Promise<UserDigestItem | null> => {
      const response = await fetchProtected(
        `${API_BASE_URL}/digests/${id}`,
        {},
        'Failed to fetch digest',
      );
      if (!response.ok) {
        if (response.status === 404) return null;
        await throwProtectedApiError(response, 'Failed to fetch digest');
      }
      const json = await response.json();
      return json.data || null;
    },
  },

  // Twitter KOL Digest API (V3 read endpoints; auth required for reads.
  // generate is nonprod / admin / cron only — see backend deps.)
  twitterDigest: {
    getLatest: async (): Promise<DailyDigest | null> => {
      const response = await fetchProtected(
        `${API_BASE_URL}/twitter-digest/latest`,
        {},
        'Failed to fetch latest twitter digest',
      );
      if (response.status === 404) return null;
      if (!response.ok) {
        await throwProtectedApiError(response, 'Failed to fetch latest twitter digest');
      }
      return response.json();
    },

    getByDate: async (date: string): Promise<DailyDigest | null> => {
      const response = await fetchProtected(
        `${API_BASE_URL}/twitter-digest/${encodeURIComponent(date)}`,
        {},
        'Failed to fetch twitter digest',
      );
      if (response.status === 404) return null;
      if (!response.ok) {
        await throwProtectedApiError(response, 'Failed to fetch twitter digest');
      }
      return response.json();
    },

    // Trigger today's digest generation. The backend gates this to nonprod /
    // admin / cron — production users get 401/403 and the UI button is
    // hidden. Returns the generated DailyDigest on success. Long-running:
    // typical pipeline takes 30-90s.
    generate: async (windowHours: number = 24): Promise<DailyDigest> => {
      const response = await fetchProtected(
        `${API_BASE_URL}/twitter-digest/generate?window_hours=${windowHours}&persist=true`,
        { method: 'POST' },
        'Failed to generate twitter digest',
      );
      if (!response.ok) {
        await throwProtectedApiError(response, 'Failed to generate twitter digest');
      }
      return response.json();
    },
  },

  // KOL Methodology Chat API
  twitterMethodology: {
    chat: async (
      req: MethodologyChatRequest,
      options: { signal?: AbortSignal } = {},
    ): Promise<MethodologyChatResponse> => {
      const headers = await _authHeaders({ 'Content-Type': 'application/json' }, { required: true });
      const controller = new AbortController();
      let timedOut = false;
      const abortFromCaller = () => controller.abort();
      options.signal?.addEventListener('abort', abortFromCaller, { once: true });
      const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, 120_000);
      try {
        const response = await fetch(`${API_BASE_URL}/twitter/methodology-chat`, {
          method: 'POST',
          headers,
          body: JSON.stringify(req),
          signal: controller.signal,
        });
        if (!response.ok) {
          await throwProtectedApiError(response, 'KOL 方法论助手暂时无法响应');
        }
        return response.json();
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          if (options.signal?.aborted && !timedOut) {
            throw new Error('已停止生成');
          }
          throw new Error('KOL 方法论助手响应超时，请再试一次');
        }
        throw err;
      } finally {
        clearTimeout(timeout);
        options.signal?.removeEventListener('abort', abortFromCaller);
      }
    },

    chatStream: async (
      req: MethodologyChatRequest,
      onEvent: (event: MethodologyChatStreamEvent) => void,
      options: { signal?: AbortSignal } = {},
    ): Promise<MethodologyChatResponse> => {
      const headers = await _authHeaders({ 'Content-Type': 'application/json' }, { required: true });
      const response = await fetch(`${API_BASE_URL}/twitter/methodology-chat/stream`, {
        method: 'POST',
        headers,
        body: JSON.stringify(req),
        signal: options.signal,
      });
      if (!response.ok) {
        await throwProtectedApiError(response, 'KOL 方法论助手暂时无法响应');
      }
      const responseBody = response.body;
      if (!responseBody) {
        throw new Error('KOL 方法论助手响应中断，请再试一次');
      }

      const reader = responseBody.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalResponse: MethodologyChatResponse | null = null;

      const flushEvent = (raw: string) => {
        const lines = raw.split('\n');
        const eventLine = lines.find((line) => line.startsWith('event:'));
        const dataLine = lines.find((line) => line.startsWith('data:'));
        if (!eventLine || !dataLine) return;

        const event = eventLine.slice('event:'.length).trim() as MethodologyChatStreamEvent['event'];
        const data = JSON.parse(dataLine.slice('data:'.length).trim()) as MethodologyChatStreamEvent['data'];
        const parsed = { event, data };
        onEvent(parsed);
        if (event === 'final') {
          finalResponse = data as MethodologyChatResponse;
        }
        if (event === 'error') {
          throw new Error(data.detail || data.message || 'KOL 方法论助手暂时无法响应');
        }
      };

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split('\n\n');
          buffer = chunks.pop() || '';
          chunks.forEach(flushEvent);
        }
        if (buffer.trim()) flushEvent(buffer);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          throw new Error('已停止生成');
        }
        throw err;
      }

      if (!finalResponse) {
        throw new Error('KOL 方法论助手响应中断，请再试一次');
      }
      return finalResponse;
    },

    conversations: {
      latest: async (username = 'qinbafrank'): Promise<MethodologyConversation | null> => {
        const headers = await _authHeaders({}, { required: true });
        const response = await fetch(
          `${API_BASE_URL}/twitter/methodology-conversations/latest?username=${encodeURIComponent(username)}`,
          { headers },
        );
        if (!response.ok) {
          await throwProtectedApiError(response, 'Failed to fetch KOL conversation');
        }
        const json = await response.json();
        return json.data || null;
      },

      create: async (
        req: MethodologyConversationSaveRequest,
      ): Promise<MethodologyConversation> => {
        const headers = await _authHeaders({ 'Content-Type': 'application/json' }, { required: true });
        const response = await fetch(`${API_BASE_URL}/twitter/methodology-conversations`, {
          method: 'POST',
          headers,
          body: JSON.stringify(req),
        });
        if (!response.ok) {
          await throwProtectedApiError(response, 'Failed to create KOL conversation');
        }
        return response.json();
      },

      update: async (
        id: string,
        req: MethodologyConversationSaveRequest,
      ): Promise<{ success: boolean }> => {
        const headers = await _authHeaders({ 'Content-Type': 'application/json' }, { required: true });
        const response = await fetch(`${API_BASE_URL}/twitter/methodology-conversations/${id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(req),
        });
        if (!response.ok) {
          await throwProtectedApiError(response, 'Failed to update KOL conversation');
        }
        return response.json();
      },
    },
  },

  // Screener API
  screener: {
    filter: async (req: ScreenerFilterRequest): Promise<ScreenerFilterResult> => {
      const headers = await _authHeaders({ 'Content-Type': 'application/json' }, { required: true });
      const response = await fetch(`${API_BASE_URL}/screener/filter`, {
        method: 'POST',
        headers,
        body: JSON.stringify(req),
      });
      if (!response.ok) {
        await throwProtectedApiError(response, 'Failed to filter stocks');
      }
      return response.json();
    },

    status: async (): Promise<ScreenerStatusResponse> => {
      const response = await fetch(`${API_BASE_URL}/screener/status`);
      if (!response.ok) {
        throw new Error('Failed to fetch screener status');
      }
      return response.json();
    },

    sectors: async (): Promise<ScreenerSectorsResponse> => {
      const response = await fetch(`${API_BASE_URL}/screener/sectors`);
      if (!response.ok) {
        throw new Error('Failed to fetch screener sectors');
      }
      return response.json();
    },

    ask: async (req: ScreenerAskRequest): Promise<ScreenerAskResult> => {
      const headers = await _authHeaders({ 'Content-Type': 'application/json' }, { required: true });
      const response = await fetch(`${API_BASE_URL}/screener/ask`, {
        method: 'POST',
        headers,
        body: JSON.stringify(req),
      });
      if (!response.ok) {
        await throwProtectedApiError(response, 'AI 查询失败');
      }
      return response.json();
    },

    // @deprecated Use api.research.chat() instead
    pick: async (req: ResearchRequest): Promise<ResearchResult> => {
      const headers = await _authHeaders({ 'Content-Type': 'application/json' }, { required: true });
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90_000);
      try {
        const response = await fetch(`${API_BASE_URL}/screener/pick`, {
          method: 'POST',
          headers,
          body: JSON.stringify(req),
          signal: controller.signal,
        });
        if (!response.ok) {
          await throwProtectedApiError(response, 'AI 助手暂时无法响应');
        }
        return response.json();
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          throw new Error('AI 助手响应超时，请再试一次');
        }
        throw err;
      } finally {
        clearTimeout(timeout);
      }
    },

    conversations: {
      list: async (): Promise<{ conversations: ConversationSummary[] }> => {
        const headers = await _authHeaders({}, { required: true });
        const response = await fetch(`${API_BASE_URL}/screener/conversations`, { headers });
        if (!response.ok) {
          await throwProtectedApiError(response, 'Failed to fetch conversations');
        }
        return response.json();
      },

      get: async (id: string): Promise<Record<string, unknown>> => {
        const headers = await _authHeaders({}, { required: true });
        const response = await fetch(`${API_BASE_URL}/screener/conversations/${id}`, { headers });
        if (!response.ok) {
          await throwProtectedApiError(response, 'Failed to fetch conversation');
        }
        return response.json();
      },

      create: async (req: ConversationSaveRequest): Promise<{ id: string }> => {
        const headers = await _authHeaders({ 'Content-Type': 'application/json' }, { required: true });
        const response = await fetch(`${API_BASE_URL}/screener/conversations`, {
          method: 'POST',
          headers,
          body: JSON.stringify(req),
        });
        if (!response.ok) {
          await throwProtectedApiError(response, 'Failed to create conversation');
        }
        return response.json();
      },

      update: async (id: string, req: ConversationSaveRequest): Promise<{ success: boolean }> => {
        const headers = await _authHeaders({ 'Content-Type': 'application/json' }, { required: true });
        const response = await fetch(`${API_BASE_URL}/screener/conversations/${id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(req),
        });
        if (!response.ok) {
          await throwProtectedApiError(response, 'Failed to update conversation');
        }
        return response.json();
      },

      delete: async (id: string): Promise<{ success: boolean }> => {
        const headers = await _authHeaders({}, { required: true });
        const response = await fetch(`${API_BASE_URL}/screener/conversations/${id}`, {
          method: 'DELETE',
          headers,
        });
        if (!response.ok) {
          await throwProtectedApiError(response, 'Failed to delete conversation');
        }
        return response.json();
      },
    },
  },

  // Weekly Macro Report API
  weeklyReport: {
    getLatest: async (): Promise<WeeklyReportResponse> => {
      const response = await fetch(`${API_BASE_URL}/weekly-report`);
      if (!response.ok) {
        throw new Error('Failed to fetch weekly report');
      }
      return response.json();
    },

    generate: async (force: boolean = false): Promise<WeeklyReportResponse> => {
      const headers: Record<string, string> = {};
      const cronSecret = process.env.NEXT_PUBLIC_CRON_SECRET;
      if (cronSecret) {
        headers['X-Cron-Secret'] = cronSecret;
      }
      const response = await fetch(
        `${API_BASE_URL}/weekly-report/generate?force=${force}`,
        { method: 'POST', headers },
      );
      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Failed to generate weekly report' }));
        throw new Error(error.detail || 'Failed to generate weekly report');
      }
      return response.json();
    },
  },

  // Research API (unified endpoints, replaces screener.pick + screener.conversations)
  research: {
    chat: async (req: ResearchRequest): Promise<ResearchResult> => {
      const headers = await _authHeaders({ 'Content-Type': 'application/json' });
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90_000);
      try {
        const response = await fetch(`${API_BASE_URL}/research/chat`, {
          method: 'POST',
          headers,
          body: JSON.stringify(req),
          signal: controller.signal,
        });
        if (!response.ok) {
          await throwProtectedApiError(response, 'AI 助手暂时无法响应');
        }
        return response.json();
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          throw new Error('AI 助手响应超时，请再试一次');
        }
        throw err;
      } finally {
        clearTimeout(timeout);
      }
    },

    chatStream: async (
      req: ResearchRequest,
      onEvent: (event: { type: string; tool?: string; description?: string; content?: string; result?: ResearchResult; message?: string; quota_exceeded?: boolean }) => void,
    ): Promise<void> => {
      const headers = await _authHeaders({ 'Content-Type': 'application/json' });
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120_000);
      try {
        const response = await fetch(`${API_BASE_URL}/research/chat/stream`, {
          method: 'POST',
          headers,
          body: JSON.stringify(req),
          signal: controller.signal,
        });
        if (!response.ok) {
          await throwProtectedApiError(response, 'AI 助手暂时无法响应');
        }
        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body');
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                onEvent(data);
                // Yield to browser between events so React can render
                // tool_call_start before tool_call_end arrives
                if (data.type === 'tool_call_start') {
                  await new Promise(r => setTimeout(r, 0));
                }
              } catch { /* skip malformed events */ }
            }
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          onEvent({ type: 'error', message: 'AI 助手响应超时，请再试一次' });
        } else {
          throw err;
        }
      } finally {
        clearTimeout(timeout);
      }
    },

    quota: async (): Promise<{ success: boolean; allowed: boolean; used: number; limit: number; remaining: number; unlimited: boolean }> => {
      const headers = await _authHeaders({});
      const response = await fetch(`${API_BASE_URL}/research/quota`, { headers });
      if (!response.ok) return { success: false, allowed: true, used: 0, limit: 5, remaining: 5, unlimited: false };
      return response.json();
    },

    conversations: {
      list: async (): Promise<{ conversations: ConversationSummary[] }> => {
        const headers = await _authHeaders({});
        const hasAuth = !!headers['Authorization'];
        const response = await fetch(`${API_BASE_URL}/research/conversations`, { headers });
        if (!response.ok) {
          if (!hasAuth) return { conversations: [] };
          await throwProtectedApiError(response, 'Failed to fetch conversations');
        }
        return response.json();
      },

      get: async (id: string): Promise<Record<string, unknown>> => {
        const headers = await _authHeaders({});
        const response = await fetch(`${API_BASE_URL}/research/conversations/${id}`, { headers });
        if (!response.ok) {
          await throwProtectedApiError(response, 'Failed to fetch conversation');
        }
        return response.json();
      },

      create: async (req: ConversationSaveRequest): Promise<{ id: string }> => {
        const headers = await _authHeaders({ 'Content-Type': 'application/json' });
        const hasAuth = !!headers['Authorization'];
        const response = await fetch(`${API_BASE_URL}/research/conversations`, {
          method: 'POST',
          headers,
          body: JSON.stringify(req),
        });
        if (!response.ok) {
          if (!hasAuth) return { id: '' };
          await throwProtectedApiError(response, 'Failed to create conversation');
        }
        return response.json();
      },

      update: async (id: string, req: ConversationSaveRequest): Promise<{ success: boolean }> => {
        const headers = await _authHeaders({ 'Content-Type': 'application/json' });
        const hasAuth = !!headers['Authorization'];
        const response = await fetch(`${API_BASE_URL}/research/conversations/${id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(req),
        });
        if (!response.ok) {
          if (!hasAuth) return { success: false };
          await throwProtectedApiError(response, 'Failed to update conversation');
        }
        return response.json();
      },

      delete: async (id: string): Promise<{ success: boolean }> => {
        const headers = await _authHeaders({});
        const response = await fetch(`${API_BASE_URL}/research/conversations/${id}`, {
          method: 'DELETE',
          headers,
        });
        if (!response.ok) {
          await throwProtectedApiError(response, 'Failed to delete conversation');
        }
        return response.json();
      },
    },
  },

  kolResearch: {
    personas: async (): Promise<{ personas: KolPersonaSummary[] }> => {
      const headers = await _authHeaders({});
      const response = await fetch(`${API_BASE_URL}/kol_research/personas`, { headers });
      if (!response.ok) {
        if (response.status === 403) return { personas: [] };
        await throwProtectedApiError(response, 'Failed to load personas');
      }
      return response.json();
    },

    chat: async (req: KolResearchRequest): Promise<KolResearchResponse> => {
      const headers = await _authHeaders({ 'Content-Type': 'application/json' });
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90_000);
      try {
        const response = await fetch(`${API_BASE_URL}/kol_research/chat`, {
          method: 'POST',
          headers,
          body: JSON.stringify(req),
          signal: controller.signal,
        });
        if (!response.ok) {
          await throwProtectedApiError(response, 'AI 助手暂时无法响应');
        }
        return response.json();
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          throw new Error('AI 助手响应超时，请再试一次');
        }
        throw err;
      } finally {
        clearTimeout(timeout);
      }
    },

    chatStream: async (
      req: KolResearchRequest,
      onEvent: (event: KolResearchStreamEvent) => void,
      signal?: AbortSignal,
    ): Promise<void> => {
      const headers = await _authHeaders({ 'Content-Type': 'application/json' });
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120_000);
      if (signal) {
        signal.addEventListener('abort', () => controller.abort(), { once: true });
      }
      try {
        const response = await fetch(`${API_BASE_URL}/kol_research/chat/stream`, {
          method: 'POST',
          headers,
          body: JSON.stringify(req),
          signal: controller.signal,
        });
        if (!response.ok) {
          await throwProtectedApiError(response, 'AI 助手暂时无法响应');
        }
        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body');
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6)) as KolResearchStreamEvent;
                onEvent(data);
                if (data.type === 'tool_call_start' || data.type === 'skill_activated') {
                  await new Promise(r => setTimeout(r, 0));
                }
              } catch { /* skip malformed events */ }
            }
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          onEvent({ type: 'error', error: 'AI 助手响应超时，请再试一次' });
        } else {
          throw err;
        }
      } finally {
        clearTimeout(timeout);
      }
    },

    conversations: {
      list: async (): Promise<{ conversations: ConversationSummary[] }> => {
        const headers = await _authHeaders({});
        const response = await fetch(`${API_BASE_URL}/kol_research/conversations`, { headers });
        if (!response.ok) {
          if (response.status === 403) return { conversations: [] };
          await throwProtectedApiError(response, 'Failed to fetch conversations');
        }
        return response.json();
      },

      get: async (id: string): Promise<Record<string, unknown>> => {
        const headers = await _authHeaders({});
        const response = await fetch(`${API_BASE_URL}/kol_research/conversations/${id}`, { headers });
        if (!response.ok) {
          await throwProtectedApiError(response, 'Failed to fetch conversation');
        }
        return response.json();
      },

      create: async (req: KolConversationSaveRequest): Promise<{ id: string }> => {
        const headers = await _authHeaders({ 'Content-Type': 'application/json' });
        const response = await fetch(`${API_BASE_URL}/kol_research/conversations`, {
          method: 'POST',
          headers,
          body: JSON.stringify(req),
        });
        if (!response.ok) {
          await throwProtectedApiError(response, 'Failed to create conversation');
        }
        return response.json();
      },

      update: async (id: string, req: KolConversationSaveRequest): Promise<{ success: boolean }> => {
        const headers = await _authHeaders({ 'Content-Type': 'application/json' });
        const response = await fetch(`${API_BASE_URL}/kol_research/conversations/${id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(req),
        });
        if (!response.ok) {
          await throwProtectedApiError(response, 'Failed to update conversation');
        }
        return response.json();
      },

      delete: async (id: string): Promise<{ success: boolean }> => {
        const headers = await _authHeaders({});
        const response = await fetch(`${API_BASE_URL}/kol_research/conversations/${id}`, {
          method: 'DELETE',
          headers,
        });
        if (!response.ok) {
          await throwProtectedApiError(response, 'Failed to delete conversation');
        }
        return response.json();
      },
    },
  },

  researchKb: {
    chat: async (req: ResearchKBRequest): Promise<ResearchKBResponse> => {
      const headers = await _authHeaders({ 'Content-Type': 'application/json' }, { required: true });
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90_000);
      try {
        const response = await fetch(`${API_BASE_URL}/research-kb/chat`, {
          method: 'POST',
          headers,
          body: JSON.stringify(req),
          signal: controller.signal,
        });
        if (!response.ok) {
          await throwProtectedApiError(response, '知识库助手暂时无法响应');
        }
        return response.json();
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          throw new Error('知识库助手响应超时，请再试一次');
        }
        throw err;
      } finally {
        clearTimeout(timeout);
      }
    },
  },

  portfolio: {
    get: async (): Promise<PortfolioListResponse> => {
      const response = await fetchProtected(
        `${API_BASE_URL}/portfolio`,
        {},
        'Failed to fetch portfolio',
      );
      if (!response.ok) {
        await throwProtectedApiError(response, 'Failed to fetch portfolio');
      }
      return response.json();
    },

    bulkSave: async (rows: HoldingInput[]): Promise<PortfolioListResponse> => {
      const response = await fetchProtected(`${API_BASE_URL}/portfolio/bulk`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      }, 'Failed to save portfolio');
      if (!response.ok) {
        await throwProtectedApiError(response, 'Failed to save portfolio');
      }
      return response.json();
    },

    touch: async (): Promise<{ confirmed_at: string }> => {
      const response = await fetchProtected(`${API_BASE_URL}/portfolio/touch`, {
        method: 'PATCH',
      }, 'Failed to touch portfolio');
      if (!response.ok) {
        await throwProtectedApiError(response, 'Failed to touch portfolio');
      }
      return response.json();
    },

    patch: async (symbol: string, fields: Record<string, unknown>): Promise<unknown> => {
      const response = await fetchProtected(`${API_BASE_URL}/portfolio/${encodeURIComponent(symbol)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      }, 'Failed to patch holding');
      if (!response.ok) {
        await throwProtectedApiError(response, 'Failed to patch holding');
      }
      return response.json();
    },

    delete: async (symbol: string): Promise<{ deleted: boolean; symbol: string }> => {
      const response = await fetchProtected(`${API_BASE_URL}/portfolio/${encodeURIComponent(symbol)}`, {
        method: 'DELETE',
      }, 'Failed to delete holding');
      if (!response.ok) {
        await throwProtectedApiError(response, 'Failed to delete holding');
      }
      return response.json();
    },
  },

  forYou: {
    getActionBar: async (): Promise<ActionBarResponse> => {
      const response = await fetchProtected(
        `${API_BASE_URL}/for-you/action-bar`,
        {},
        'Failed to fetch action bar',
      );
      if (!response.ok) {
        await throwProtectedApiError(response, 'Failed to fetch action bar');
      }
      return response.json();
    },

    generateHealthCheck: async (force: boolean = false): Promise<HealthResponse> => {
      const response = await fetchProtected(
        `${API_BASE_URL}/portfolio-health${force ? '?force=true' : ''}`,
        { method: 'POST' },
        'Failed to generate health check',
      );
      if (!response.ok) {
        await throwProtectedApiError(response, 'Failed to generate health check');
      }
      return response.json();
    },

    getHealthLatest: async (): Promise<HealthLatestResponse> => {
      const response = await fetchProtected(
        `${API_BASE_URL}/portfolio-health/latest`,
        {},
        'Failed to fetch health latest',
      );
      if (!response.ok) {
        await throwProtectedApiError(response, 'Failed to fetch health latest');
      }
      return response.json();
    },
  },

  feedback: {
    submit: async (data: FeedbackInput): Promise<{ success: boolean; id: string | null }> => {
      try {
        const response = await fetchProtected(`${API_BASE_URL}/feedback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        }, 'Failed to submit feedback');
        if (!response.ok) {
          // Don't throw on feedback failure — it's non-critical
          return { success: false, id: null };
        }
        return response.json();
      } catch {
        // Silently fail — feedback is non-critical
        return { success: false, id: null };
      }
    },
  },

  investmentProfile: {
    get: async (): Promise<InvestmentProfileView> => {
      const response = await fetchProtected(
        `${API_BASE_URL}/profile`,
        {},
        'Failed to fetch profile',
      );
      if (!response.ok) {
        await throwProtectedApiError(response, 'Failed to fetch profile');
      }
      return response.json();
    },

    save: async (data: InvestmentProfileInput): Promise<InvestmentProfileView> => {
      const response = await fetchProtected(`${API_BASE_URL}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }, 'Failed to save profile');
      if (!response.ok) {
        await throwProtectedApiError(response, 'Failed to save profile');
      }
      return response.json();
    },
  },
};
