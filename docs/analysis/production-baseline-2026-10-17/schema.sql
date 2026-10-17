-- Database Export
-- Generated on: 2026-10-17T11:45:17.194Z
-- Format: SQL
-- Include Data: false
-- Row Limit: 1000 rows per table

-- Table: access_requests
CREATE TABLE IF NOT EXISTS access_requests (id integer NOT NULL DEFAULT nextval('access_requests_id_seq'::regclass), background text NOT NULL, feedback text, email text, created_at timestamptz DEFAULT now(), pain_points ARRAY DEFAULT '{}'::text[], markets ARRAY DEFAULT '{}'::text[], trading_style ARRAY DEFAULT '{}'::text[]);

-- Table: agent_session_events
CREATE TABLE IF NOT EXISTS agent_session_events (id uuid NOT NULL DEFAULT gen_random_uuid(), session_id text NOT NULL, user_id text NOT NULL, agent_id text NOT NULL, event_type text NOT NULL, role text, content text, payload jsonb NOT NULL DEFAULT '{}'::jsonb, token_estimate integer, created_at timestamptz NOT NULL DEFAULT now(), turn_id text, client_event_id text, client_ts timestamptz, feedback_sentiment smallint, feedback_reason text, feedback_at timestamptz, feedback_payload jsonb NOT NULL DEFAULT '{}'::jsonb);

-- Indexes for table: agent_session_events
CREATE INDEX idx_agent_session_events_cursor ON public.agent_session_events USING btree (user_id, agent_id, session_id, created_at, id);
CREATE INDEX idx_agent_session_events_feedback_recent ON public.agent_session_events USING btree (user_id, agent_id, feedback_at DESC) WHERE ((event_type = 'assistant_message'::text) AND (feedback_sentiment IS NOT NULL));
CREATE INDEX idx_agent_session_events_session_recent ON public.agent_session_events USING btree (user_id, agent_id, session_id, created_at DESC);
CREATE INDEX idx_agent_session_events_type_recent ON public.agent_session_events USING btree (user_id, agent_id, event_type, created_at DESC);
CREATE UNIQUE INDEX uq_agent_session_events_client_event ON public.agent_session_events USING btree (user_id, agent_id, session_id, client_event_id) WHERE (client_event_id IS NOT NULL);
CREATE UNIQUE INDEX uq_agent_session_events_client_event_full ON public.agent_session_events USING btree (user_id, agent_id, session_id, client_event_id);
CREATE UNIQUE INDEX uq_agent_session_events_turn_message ON public.agent_session_events USING btree (user_id, agent_id, session_id, turn_id, event_type, role) WHERE ((turn_id IS NOT NULL) AND (client_event_id IS NULL) AND (event_type = ANY (ARRAY['user_message'::text, 'assistant_message'::text, 'context_snapshot'::text, 'error'::text])));

-- Table: agent_sessions
CREATE TABLE IF NOT EXISTS agent_sessions (id uuid NOT NULL DEFAULT gen_random_uuid(), session_id text NOT NULL, user_id text NOT NULL, agent_id text NOT NULL, status text NOT NULL DEFAULT 'active'::text, title text, metadata jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

-- Indexes for table: agent_sessions
CREATE UNIQUE INDEX agent_sessions_user_id_agent_id_session_id_key ON public.agent_sessions USING btree (user_id, agent_id, session_id);
CREATE INDEX idx_agent_sessions_lookup ON public.agent_sessions USING btree (user_id, agent_id, session_id);
CREATE INDEX idx_agent_sessions_user_recent ON public.agent_sessions USING btree (user_id, updated_at DESC);

-- Table: community_access_grants
CREATE TABLE IF NOT EXISTS community_access_grants (id uuid NOT NULL DEFAULT gen_random_uuid(), partner_id text NOT NULL, email text NOT NULL, email_normalized text NOT NULL, status text NOT NULL DEFAULT 'active'::text, grant_source text, granted_by text, granted_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz, revoked_by text, user_id text, first_seen_user_id text, last_seen_at timestamptz, notes text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

-- Indexes for table: community_access_grants
CREATE UNIQUE INDEX community_access_grants_partner_id_email_normalized_key ON public.community_access_grants USING btree (partner_id, email_normalized);
CREATE INDEX idx_community_access_grants_email ON public.community_access_grants USING btree (email_normalized);
CREATE INDEX idx_community_access_grants_partner_status ON public.community_access_grants USING btree (partner_id, status, updated_at DESC);

-- Table: email_broadcast_runs
CREATE TABLE IF NOT EXISTS email_broadcast_runs (id uuid NOT NULL DEFAULT gen_random_uuid(), run_key text NOT NULL, channel text NOT NULL, broadcast_date date NOT NULL, status text NOT NULL DEFAULT 'running'::text, lock_token text NOT NULL, broadcast_id text, details jsonb NOT NULL DEFAULT '{}'::jsonb, started_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now());

-- Indexes for table: email_broadcast_runs
CREATE UNIQUE INDEX email_broadcast_runs_run_key_key ON public.email_broadcast_runs USING btree (run_key);
CREATE INDEX idx_email_broadcast_runs_channel_date ON public.email_broadcast_runs USING btree (channel, broadcast_date);

-- Table: email_events
CREATE TABLE IF NOT EXISTS email_events (id uuid NOT NULL DEFAULT gen_random_uuid(), svix_id text NOT NULL, event_type text NOT NULL, event_created_at timestamptz, email_id text, broadcast_id text, recipient_email text, subject text, channel text, raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now());

-- Indexes for table: email_events
CREATE UNIQUE INDEX email_events_svix_id_key ON public.email_events USING btree (svix_id);
CREATE INDEX idx_email_events_broadcast ON public.email_events USING btree (broadcast_id);
CREATE INDEX idx_email_events_channel_created ON public.email_events USING btree (channel, event_created_at DESC);
CREATE INDEX idx_email_events_email ON public.email_events USING btree (email_id);
CREATE INDEX idx_email_events_event_created ON public.email_events USING btree (event_created_at DESC);
CREATE INDEX idx_email_events_type ON public.email_events USING btree (event_type);

-- Table: email_feedback
CREATE TABLE IF NOT EXISTS email_feedback (id uuid NOT NULL DEFAULT gen_random_uuid(), report_id uuid, report_date date NOT NULL, email text NOT NULL, rating text NOT NULL, created_at timestamptz DEFAULT now());

-- Indexes for table: email_feedback
CREATE UNIQUE INDEX email_feedback_report_date_email_key ON public.email_feedback USING btree (report_date, email);
CREATE INDEX idx_email_feedback_rating ON public.email_feedback USING btree (rating);
CREATE INDEX idx_email_feedback_report_date ON public.email_feedback USING btree (report_date);

-- Foreign key constraints for table: email_feedback
ALTER TABLE email_feedback ADD CONSTRAINT email_feedback_report_id_fkey FOREIGN KEY (report_id) REFERENCES market_reports (id);

-- Table: feature_flags
CREATE TABLE IF NOT EXISTS feature_flags (user_id text NOT NULL, flag text NOT NULL, enabled boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now());

-- Indexes for table: feature_flags
CREATE INDEX idx_feature_flags_flag ON public.feature_flags USING btree (flag);

-- Table: frank_lens_invites
CREATE TABLE IF NOT EXISTS frank_lens_invites (id uuid NOT NULL DEFAULT gen_random_uuid(), code_hash text NOT NULL, label text, status text NOT NULL DEFAULT 'active'::text, max_uses integer, use_count integer NOT NULL DEFAULT 0, expires_at timestamptz, last_used_at timestamptz, metadata jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now());

-- Indexes for table: frank_lens_invites
CREATE UNIQUE INDEX frank_lens_invites_code_hash_key ON public.frank_lens_invites USING btree (code_hash);
CREATE INDEX idx_frank_lens_invites_code_hash ON public.frank_lens_invites USING btree (code_hash);

-- Table: frank_lens_usage
CREATE TABLE IF NOT EXISTS frank_lens_usage (id uuid NOT NULL DEFAULT gen_random_uuid(), invite_id uuid, persona_username text NOT NULL DEFAULT 'qinbafrank'::text, tool_name text, workflow text, ticker text, tickers jsonb NOT NULL DEFAULT '[]'::jsonb, status text NOT NULL DEFAULT 'unknown'::text, latency_ms integer, metadata jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now());

-- Indexes for table: frank_lens_usage
CREATE INDEX idx_frank_lens_usage_invite_created ON public.frank_lens_usage USING btree (invite_id, created_at DESC);

-- Foreign key constraints for table: frank_lens_usage
ALTER TABLE frank_lens_usage ADD CONSTRAINT frank_lens_usage_invite_id_fkey FOREIGN KEY (invite_id) REFERENCES frank_lens_invites (id) ON DELETE SET NULL;

-- Table: interactions
CREATE TABLE IF NOT EXISTS interactions (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id uuid NOT NULL, date timestamptz DEFAULT now(), type text, summary text, content text, key_feedback jsonb DEFAULT '[]'::jsonb, action_items jsonb DEFAULT '[]'::jsonb, sentiment text, created_at timestamptz DEFAULT now());

-- Indexes for table: interactions
CREATE INDEX idx_interactions_date ON public.interactions USING btree (date DESC);
CREATE INDEX idx_interactions_user_id ON public.interactions USING btree (user_id);

-- Foreign key constraints for table: interactions
ALTER TABLE interactions ADD CONSTRAINT interactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE;

-- RLS enabled for table: interactions
ALTER TABLE interactions ENABLE ROW LEVEL SECURITY;

-- RLS policies for table: interactions
CREATE POLICY service_all_interactions ON interactions FOR ALL TO public USING (true) WITH CHECK (true);

-- Table: kol_accounts
CREATE TABLE IF NOT EXISTS kol_accounts (username text NOT NULL, display_name text NOT NULL, source text NOT NULL, enabled boolean NOT NULL DEFAULT true, followers integer, bio text, added_at timestamptz NOT NULL DEFAULT now(), last_synced_at timestamptz);

-- Indexes for table: kol_accounts
CREATE INDEX idx_kol_accounts_enabled ON public.kol_accounts USING btree (enabled);
CREATE INDEX idx_kol_accounts_source ON public.kol_accounts USING btree (source);

-- Table: kol_daily_digests
CREATE TABLE IF NOT EXISTS kol_daily_digests (id uuid NOT NULL DEFAULT gen_random_uuid(), date date NOT NULL, tracked_kols jsonb NOT NULL DEFAULT '[]'::jsonb, window_hours integer NOT NULL, input_tweet_count integer NOT NULL, generated_at timestamptz NOT NULL, model_version text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), headline text NOT NULL DEFAULT ''::text, intro text NOT NULL DEFAULT ''::text, hot_sectors jsonb DEFAULT '[]'::jsonb, hot_tickers jsonb DEFAULT '[]'::jsonb, hot_events jsonb DEFAULT '[]'::jsonb, ticker_theses jsonb, macro_threads jsonb, other_tickers jsonb, notable_tweets jsonb, watchpoints jsonb);

-- Indexes for table: kol_daily_digests
CREATE INDEX idx_kol_daily_digests_date ON public.kol_daily_digests USING btree (date DESC);
CREATE UNIQUE INDEX kol_daily_digests_date_key ON public.kol_daily_digests USING btree (date);

-- Table: kol_methodology_conversations
CREATE TABLE IF NOT EXISTS kol_methodology_conversations (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id text NOT NULL, username text NOT NULL, title text NOT NULL DEFAULT ''::text, data jsonb NOT NULL DEFAULT '{}'::jsonb, message_count integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

-- Indexes for table: kol_methodology_conversations
CREATE INDEX idx_kol_methodology_conversations_user_username_updated ON public.kol_methodology_conversations USING btree (user_id, username, updated_at DESC);
CREATE INDEX idx_kol_methodology_conversations_username_updated ON public.kol_methodology_conversations USING btree (username, updated_at DESC);

-- Table: kol_tweets
CREATE TABLE IF NOT EXISTS kol_tweets (id text NOT NULL, author_username text NOT NULL, text text, tweet_type text, conversation_id text, quoted_tweet_text text, in_reply_to_username text, created_at timestamptz, like_count integer DEFAULT 0, retweet_count integer DEFAULT 0, reply_count integer DEFAULT 0, view_count integer DEFAULT 0, url text, category text, symbols jsonb, media jsonb NOT NULL DEFAULT '[]'::jsonb, content_parts jsonb NOT NULL DEFAULT '[]'::jsonb, canonical_text text, canonical_status text NOT NULL DEFAULT 'raw_only'::text, canonical_hash text, canonical_extracted_at timestamptz, canonical_extracted_model text);

-- Indexes for table: kol_tweets
CREATE INDEX idx_kol_tweets_author_date ON public.kol_tweets USING btree (author_username, created_at DESC);
CREATE INDEX idx_kol_tweets_category ON public.kol_tweets USING btree (category);
CREATE INDEX idx_kol_tweets_conversation ON public.kol_tweets USING btree (conversation_id);
CREATE INDEX idx_kol_tweets_symbols ON public.kol_tweets USING gin (symbols);

-- Table: llm_usage
CREATE TABLE IF NOT EXISTS llm_usage (id uuid NOT NULL DEFAULT gen_random_uuid(), ts timestamptz NOT NULL DEFAULT now(), feature text NOT NULL, agent_name text NOT NULL, model text, prompt_tokens integer, output_tokens integer, cached_tokens integer, thoughts_tokens integer, total_tokens integer, extra jsonb, user_id text, user_tier text, route text, request_method text, source text, request_id text, invocation_id text, metering_version integer, usage_signature text);

-- Indexes for table: llm_usage
CREATE INDEX llm_usage_feature_ts_idx ON public.llm_usage USING btree (feature, ts DESC);
CREATE INDEX llm_usage_metering_version_ts_idx ON public.llm_usage USING btree (metering_version, ts DESC) WHERE (metering_version IS NOT NULL);
CREATE INDEX llm_usage_request_ts_idx ON public.llm_usage USING btree (request_id, ts DESC) WHERE (request_id IS NOT NULL);
CREATE INDEX llm_usage_route_ts_idx ON public.llm_usage USING btree (route, ts DESC) WHERE (route IS NOT NULL);
CREATE INDEX llm_usage_ts_idx ON public.llm_usage USING btree (ts DESC);
CREATE INDEX llm_usage_user_ts_idx ON public.llm_usage USING btree (user_id, ts DESC) WHERE (user_id IS NOT NULL);

-- Table: macro_data_cache
CREATE TABLE IF NOT EXISTS macro_data_cache (id uuid NOT NULL DEFAULT gen_random_uuid(), data_key text NOT NULL, data jsonb NOT NULL, fetched_at timestamptz NOT NULL, expires_at timestamptz NOT NULL, source text NOT NULL, error text, created_at timestamptz DEFAULT now());

-- Indexes for table: macro_data_cache
CREATE INDEX idx_macro_data_cache_expires ON public.macro_data_cache USING btree (expires_at);
CREATE INDEX idx_macro_data_cache_key ON public.macro_data_cache USING btree (data_key);
CREATE UNIQUE INDEX macro_data_cache_data_key_key ON public.macro_data_cache USING btree (data_key);

-- Table: market_reports
CREATE TABLE IF NOT EXISTS market_reports (id uuid NOT NULL DEFAULT gen_random_uuid(), created_at timestamptz DEFAULT now(), report_date date NOT NULL, timestamp text NOT NULL, indices jsonb, market_data jsonb, title text, summary text, calendar jsonb DEFAULT '[]'::jsonb, macro jsonb, news jsonb, intro text, report_summary text);

-- Indexes for table: market_reports
CREATE INDEX idx_market_reports_created_at ON public.market_reports USING btree (created_at DESC);
CREATE INDEX idx_market_reports_report_date ON public.market_reports USING btree (report_date DESC);

-- Table: morning_reports
CREATE TABLE IF NOT EXISTS morning_reports (id uuid NOT NULL DEFAULT gen_random_uuid(), report_date date NOT NULL, timestamp text NOT NULL, title text, market_pulse text, futures jsonb DEFAULT '[]'::jsonb, global_markets jsonb DEFAULT '{}'::jsonb, overnight_news jsonb DEFAULT '[]'::jsonb, today_focus jsonb DEFAULT '[]'::jsonb, summary jsonb DEFAULT '[]'::jsonb, market_data jsonb, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), futures_analysis text DEFAULT ''::text, global_markets_analysis text DEFAULT ''::text);

-- Indexes for table: morning_reports
CREATE INDEX idx_morning_reports_created_at ON public.morning_reports USING btree (created_at DESC);
CREATE UNIQUE INDEX idx_morning_reports_report_date ON public.morning_reports USING btree (report_date);

-- Table: personal_digests
CREATE TABLE IF NOT EXISTS personal_digests (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id uuid NOT NULL, digest_date date NOT NULL, symbols ARRAY NOT NULL DEFAULT '{}'::text[], analysis text, news_data jsonb DEFAULT '[]'::jsonb, created_at timestamptz DEFAULT now(), digest_data jsonb DEFAULT '{}'::jsonb, greeting text, one_line_summary text, bottom_line text, preferences jsonb);

-- RLS policies for table: personal_digests
CREATE POLICY "Allow service inserts" ON personal_digests FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Users can delete own digests" ON personal_digests FOR DELETE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can update own digests" ON personal_digests FOR UPDATE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can view own digests" ON personal_digests FOR SELECT TO public USING ((auth.uid() = user_id));

-- Table: picker_conversations
CREATE TABLE IF NOT EXISTS picker_conversations (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id text NOT NULL, title text NOT NULL DEFAULT ''::text, data jsonb NOT NULL DEFAULT '{}'::jsonb, message_count integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

-- Indexes for table: picker_conversations
CREATE INDEX idx_picker_conversations_user ON public.picker_conversations USING btree (user_id, updated_at DESC);

-- Table: portfolio_health_reports
CREATE TABLE IF NOT EXISTS portfolio_health_reports (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id text NOT NULL, cache_key text NOT NULL, generated_at timestamptz NOT NULL DEFAULT now(), score_total smallint NOT NULL, score_dispersion smallint NOT NULL, score_performance smallint NOT NULL, score_macro_fit smallint NOT NULL, score_stability smallint NOT NULL, holdings_snapshot jsonb, profile_snapshot jsonb, diagnosis_markdown text, one_line text, top_risk text, sector_dna text, macro_sensitivity_tag text, next_action jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

-- Indexes for table: portfolio_health_reports
CREATE UNIQUE INDEX health_reports_user_cache_key_unique ON public.portfolio_health_reports USING btree (user_id, cache_key);
CREATE INDEX idx_health_reports_cache_key ON public.portfolio_health_reports USING btree (user_id, cache_key);
CREATE INDEX idx_health_reports_user ON public.portfolio_health_reports USING btree (user_id);

-- Triggers for table: portfolio_health_reports
CREATE TRIGGER trg_health_reports_updated_at BEFORE UPDATE ON portfolio_health_reports FOR EACH ROW EXECUTE FUNCTION u0a_set_updated_at();

-- Table: portfolio_insights
CREATE TABLE IF NOT EXISTS portfolio_insights (user_id text NOT NULL, health_score smallint, one_line text, top_risk text, sector_dna text, macro_sensitivity_tag text, next_action jsonb, source_report_id uuid, generated_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

-- Foreign key constraints for table: portfolio_insights
ALTER TABLE portfolio_insights ADD CONSTRAINT portfolio_insights_source_report_id_fkey FOREIGN KEY (source_report_id) REFERENCES portfolio_health_reports (id);

-- Triggers for table: portfolio_insights
CREATE TRIGGER trg_portfolio_insights_updated_at BEFORE UPDATE ON portfolio_insights FOR EACH ROW EXECUTE FUNCTION u0a_set_updated_at();

-- Table: research_quota
CREATE TABLE IF NOT EXISTS research_quota (id bigint NOT NULL, identifier text NOT NULL, identifier_type text NOT NULL DEFAULT 'user'::text, usage_date date NOT NULL DEFAULT CURRENT_DATE, count integer NOT NULL DEFAULT 0, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());

-- Indexes for table: research_quota
CREATE UNIQUE INDEX research_quota_identifier_date_unique ON public.research_quota USING btree (identifier, usage_date);
CREATE UNIQUE INDEX research_quota_identifier_usage_date_key ON public.research_quota USING btree (identifier, usage_date);

-- Table: screener_universe_cache
CREATE TABLE IF NOT EXISTS screener_universe_cache (id uuid NOT NULL DEFAULT gen_random_uuid(), data_key text NOT NULL, data jsonb NOT NULL, fetched_at timestamptz NOT NULL, expires_at timestamptz NOT NULL, source text NOT NULL, error text, created_at timestamptz DEFAULT now());

-- Indexes for table: screener_universe_cache
CREATE INDEX idx_screener_universe_cache_expires ON public.screener_universe_cache USING btree (expires_at);
CREATE INDEX idx_screener_universe_cache_key ON public.screener_universe_cache USING btree (data_key);
CREATE UNIQUE INDEX screener_universe_cache_data_key_key ON public.screener_universe_cache USING btree (data_key);

-- Table: stock_analyses
CREATE TABLE IF NOT EXISTS stock_analyses (id uuid NOT NULL DEFAULT gen_random_uuid(), symbol varchar(10) NOT NULL, analysis_type varchar(50) NOT NULL, content text NOT NULL, data_snapshot jsonb, model varchar(50) DEFAULT 'gemini-3-pro-preview'::character varying, generated_at timestamptz DEFAULT now(), expires_at timestamptz);

-- Indexes for table: stock_analyses
CREATE INDEX idx_analyses_expires ON public.stock_analyses USING btree (expires_at);
CREATE INDEX idx_analyses_symbol_type ON public.stock_analyses USING btree (symbol, analysis_type);

-- Table: stock_financials
CREATE TABLE IF NOT EXISTS stock_financials (id uuid NOT NULL DEFAULT gen_random_uuid(), symbol varchar(10) NOT NULL, fiscal_year integer NOT NULL, fiscal_quarter varchar(2), period_type varchar(10) NOT NULL, period_end_date date NOT NULL, income_statement jsonb, balance_sheet jsonb, cash_flow jsonb, derived_metrics jsonb, raw_response jsonb, currency varchar(3) DEFAULT 'USD'::character varying, data_source varchar(50) DEFAULT 'openbb_fmp'::character varying, filing_date date, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());

-- Indexes for table: stock_financials
CREATE INDEX idx_financials_period ON public.stock_financials USING btree (period_end_date DESC);
CREATE INDEX idx_financials_symbol ON public.stock_financials USING btree (symbol);
CREATE UNIQUE INDEX stock_financials_symbol_fiscal_year_fiscal_quarter_period_t_key ON public.stock_financials USING btree (symbol, fiscal_year, fiscal_quarter, period_type);

-- Table: stock_profiles
CREATE TABLE IF NOT EXISTS stock_profiles (id uuid NOT NULL DEFAULT gen_random_uuid(), symbol varchar(10) NOT NULL, company_name varchar(255) NOT NULL, company_name_zh varchar(255), exchange varchar(50), classification jsonb, description jsonb, company_details jsonb, data_source varchar(50) DEFAULT 'openbb_fmp'::character varying, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());

-- Indexes for table: stock_profiles
CREATE INDEX idx_profiles_symbol ON public.stock_profiles USING btree (symbol);
CREATE UNIQUE INDEX stock_profiles_symbol_key ON public.stock_profiles USING btree (symbol);

-- Table: subscription_migration_snapshots
CREATE TABLE IF NOT EXISTS subscription_migration_snapshots (migration_key text NOT NULL, captured_at timestamptz NOT NULL DEFAULT now(), user_id uuid NOT NULL, row_data jsonb NOT NULL);

-- Table: subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id uuid NOT NULL, stripe_customer_id text, stripe_subscription_id text, plan text DEFAULT 'free'::text, status text DEFAULT 'none'::text, current_period_start timestamptz, current_period_end timestamptz, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), invite_code text, access_expires_at timestamptz, referral_code text, referred_by text, referral_count integer DEFAULT 0, entitlements jsonb DEFAULT '[]'::jsonb, onboarding_step integer, is_lifetime boolean NOT NULL DEFAULT false, lifecycle_state jsonb NOT NULL DEFAULT '{}'::jsonb, reactivation_state text, onboarding_completed_at timestamptz, cancel_at_period_end boolean DEFAULT false, cancel_at timestamptz, canceled_at timestamptz, stripe_price_id text, billing_amount_cents integer, billing_currency text, billing_interval text, billing_interval_count integer, stripe_account_ref text DEFAULT 'primary'::text, legacy_stripe_customer_id text, legacy_stripe_subscription_id text, stripe_migration_state text, stripe_migrated_at timestamptz);

-- Indexes for table: subscriptions
CREATE INDEX idx_subscriptions_cancel_at ON public.subscriptions USING btree (cancel_at) WHERE (cancel_at IS NOT NULL);
CREATE INDEX idx_subscriptions_onboarding_incomplete ON public.subscriptions USING btree (user_id) WHERE (onboarding_completed_at IS NULL);
CREATE INDEX idx_subscriptions_reactivation_state ON public.subscriptions USING btree (reactivation_state) WHERE (reactivation_state IS NOT NULL);
CREATE INDEX idx_subscriptions_stripe_customer ON public.subscriptions USING btree (stripe_customer_id);
CREATE UNIQUE INDEX subscriptions_referral_code_key ON public.subscriptions USING btree (referral_code);
CREATE UNIQUE INDEX subscriptions_user_id_key ON public.subscriptions USING btree (user_id);

-- Table: symbol_resolution_cache
CREATE TABLE IF NOT EXISTS symbol_resolution_cache (query_norm text NOT NULL, resolved_json jsonb NOT NULL, status text NOT NULL, hit_count integer NOT NULL DEFAULT 0, resolved_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL);

-- Indexes for table: symbol_resolution_cache
CREATE INDEX idx_symbol_cache_expires ON public.symbol_resolution_cache USING btree (expires_at);

-- Table: ticker_daily_briefs
CREATE TABLE IF NOT EXISTS ticker_daily_briefs (id uuid NOT NULL DEFAULT gen_random_uuid(), symbol text NOT NULL, brief_date date NOT NULL, model_version text NOT NULL DEFAULT 'watchlist-monitor-v0'::text, headline text NOT NULL, ai_take text NOT NULL, signals jsonb NOT NULL DEFAULT '[]'::jsonb, watchpoints jsonb NOT NULL DEFAULT '[]'::jsonb, source_refs jsonb NOT NULL DEFAULT '[]'::jsonb, input_hash text, quality_status text NOT NULL DEFAULT 'passed'::text, generated_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), news_summary text NOT NULL DEFAULT ''::text, technical_monitor jsonb NOT NULL DEFAULT '{}'::jsonb, event_candidates jsonb NOT NULL DEFAULT '[]'::jsonb, market_discussion jsonb NOT NULL DEFAULT '{}'::jsonb);

-- Indexes for table: ticker_daily_briefs
CREATE INDEX idx_ticker_daily_briefs_generated_at ON public.ticker_daily_briefs USING btree (generated_at DESC);
CREATE INDEX idx_ticker_daily_briefs_symbol_date ON public.ticker_daily_briefs USING btree (symbol, brief_date DESC);
CREATE UNIQUE INDEX ticker_daily_briefs_unique_version ON public.ticker_daily_briefs USING btree (symbol, brief_date, model_version);

-- Triggers for table: ticker_daily_briefs
CREATE TRIGGER trg_ticker_daily_briefs_updated_at BEFORE UPDATE ON ticker_daily_briefs FOR EACH ROW EXECUTE FUNCTION u0a_set_updated_at();

-- Table: ticker_event_candidates
CREATE TABLE IF NOT EXISTS ticker_event_candidates (id bigint NOT NULL DEFAULT nextval('ticker_event_candidates_id_seq'::regclass), symbol text NOT NULL, candidate_id text, event_type text NOT NULL DEFAULT 'other_company_event'::text, event_date date, date_precision text NOT NULL DEFAULT 'unknown'::text, title text NOT NULL, summary text NOT NULL DEFAULT ''::text, why_it_matters text NOT NULL DEFAULT ''::text, status text NOT NULL DEFAULT 'scheduled'::text, confidence text NOT NULL DEFAULT 'medium'::text, source_ref_ids jsonb NOT NULL DEFAULT '[]'::jsonb, source_type text NOT NULL DEFAULT ''::text, dedupe_key text NOT NULL, metadata jsonb NOT NULL DEFAULT '{}'::jsonb, raw_candidate jsonb NOT NULL DEFAULT '{}'::jsonb, generated_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

-- Indexes for table: ticker_event_candidates
CREATE INDEX idx_ticker_event_candidates_generated_at ON public.ticker_event_candidates USING btree (generated_at DESC);
CREATE INDEX idx_ticker_event_candidates_symbol_date ON public.ticker_event_candidates USING btree (symbol, event_date, generated_at DESC);
CREATE UNIQUE INDEX ticker_event_candidates_symbol_dedupe_key_key ON public.ticker_event_candidates USING btree (symbol, dedupe_key);

-- Table: twitter_fetch_runs
CREATE TABLE IF NOT EXISTS twitter_fetch_runs (id uuid NOT NULL DEFAULT gen_random_uuid(), run_id text NOT NULL, username text NOT NULL, status text NOT NULL, pages_fetched integer DEFAULT 0, tweets_fetched integer DEFAULT 0, tweets_stored integer DEFAULT 0, tweets_skipped integer DEFAULT 0, reached_safety_window boolean DEFAULT false, error text, started_at timestamptz DEFAULT now(), finished_at timestamptz);

-- Indexes for table: twitter_fetch_runs
CREATE INDEX idx_fetch_runs_run_id ON public.twitter_fetch_runs USING btree (run_id);
CREATE INDEX idx_fetch_runs_username_started ON public.twitter_fetch_runs USING btree (username, started_at DESC);

-- Table: user_activities
CREATE TABLE IF NOT EXISTS user_activities (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id text NOT NULL, event_type text NOT NULL, event_name text DEFAULT ''::text, metadata jsonb DEFAULT '{}'::jsonb, created_at timestamptz DEFAULT now());

-- Indexes for table: user_activities
CREATE INDEX idx_ua_created_at ON public.user_activities USING btree (created_at DESC);
CREATE INDEX idx_ua_event_type ON public.user_activities USING btree (event_type);
CREATE INDEX idx_ua_user_id ON public.user_activities USING btree (user_id);

-- Table: user_feedback
CREATE TABLE IF NOT EXISTS user_feedback (id uuid NOT NULL DEFAULT gen_random_uuid(), rating text NOT NULL, email text NOT NULL, message text, created_at timestamptz DEFAULT now());

-- Table: user_investment_profiles
CREATE TABLE IF NOT EXISTS user_investment_profiles (user_id text NOT NULL, style text, horizon text, risk_tolerance text, notify_mode text NOT NULL DEFAULT 'events_only'::text, version integer NOT NULL DEFAULT 1, onboarded_at timestamptz, portfolio_confirmed_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

-- Triggers for table: user_investment_profiles
CREATE TRIGGER trg_user_investment_profiles_updated_at BEFORE UPDATE ON user_investment_profiles FOR EACH ROW EXECUTE FUNCTION u0a_set_updated_at();

-- Table: user_portfolios
CREATE TABLE IF NOT EXISTS user_portfolios (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id text NOT NULL, symbol text NOT NULL, weight_pct numeric, shares numeric, cost_basis numeric, thesis text, target numeric, stop_loss numeric, conviction smallint, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), entry_price numeric, source text DEFAULT 'manual'::text, source_synced_at timestamptz, external_account_id text);

-- Indexes for table: user_portfolios
CREATE INDEX idx_user_portfolios_user ON public.user_portfolios USING btree (user_id);
CREATE INDEX idx_user_portfolios_user_source ON public.user_portfolios USING btree (user_id, source);
CREATE UNIQUE INDEX user_portfolios_user_symbol_unique ON public.user_portfolios USING btree (user_id, symbol);

-- Triggers for table: user_portfolios
CREATE TRIGGER trg_user_portfolios_updated_at BEFORE UPDATE ON user_portfolios FOR EACH ROW EXECUTE FUNCTION u0a_set_updated_at();

-- Table: user_profiles
CREATE TABLE IF NOT EXISTS user_profiles (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id uuid NOT NULL, name text, wechat text, channel text, ops_status text DEFAULT '待联系'::text, priority text DEFAULT 'mid'::text, tags jsonb DEFAULT '[]'::jsonb, notes text, next_followup timestamptz, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());

-- Indexes for table: user_profiles
CREATE INDEX idx_user_profiles_user_id ON public.user_profiles USING btree (user_id);
CREATE UNIQUE INDEX user_profiles_user_id_key ON public.user_profiles USING btree (user_id);

-- Foreign key constraints for table: user_profiles
ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE;

-- RLS enabled for table: user_profiles
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- RLS policies for table: user_profiles
CREATE POLICY service_all_user_profiles ON user_profiles FOR ALL TO public USING (true) WITH CHECK (true);

-- Table: user_watchlists
CREATE TABLE IF NOT EXISTS user_watchlists (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id uuid NOT NULL, symbols ARRAY NOT NULL DEFAULT '{}'::text[], created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), preferences jsonb, email text);

-- Indexes for table: user_watchlists
CREATE UNIQUE INDEX user_watchlists_user_id_key ON public.user_watchlists USING btree (user_id);

-- RLS enabled for table: user_watchlists
ALTER TABLE user_watchlists ENABLE ROW LEVEL SECURITY;

-- RLS policies for table: user_watchlists
CREATE POLICY "Service can insert watchlists" ON user_watchlists FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Service can read all watchlists" ON user_watchlists FOR SELECT TO public USING (true);
CREATE POLICY "Service can update watchlists" ON user_watchlists FOR UPDATE TO public USING (true);
CREATE POLICY "Users can delete own watchlist" ON user_watchlists FOR DELETE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can insert own watchlist" ON user_watchlists FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can update own watchlist" ON user_watchlists FOR UPDATE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can view own watchlist" ON user_watchlists FOR SELECT TO public USING ((auth.uid() = user_id));

-- Table: users
CREATE TABLE IF NOT EXISTS users (id uuid NOT NULL, nickname text, avatar_url text, bio text, birthday date, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());

-- RLS enabled for table: users
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- RLS policies for table: users
CREATE POLICY "Allow project_admin to update any user" ON users FOR UPDATE TO project_admin USING (true) WITH CHECK (true);
CREATE POLICY "Disable delete for users" ON users FOR DELETE TO authenticated USING (false);
CREATE POLICY "Enable read access for all users" ON users FOR SELECT TO public USING (true);
CREATE POLICY "Enable update for users based on user_id" ON users FOR UPDATE TO authenticated USING ((uid() = id)) WITH CHECK ((uid() = id));

-- Triggers for table: users
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Table: vector_chunks
CREATE TABLE IF NOT EXISTS vector_chunks (id uuid NOT NULL DEFAULT gen_random_uuid(), document_id uuid NOT NULL, source_type text NOT NULL, source_id text NOT NULL, chunk_index integer NOT NULL, content text NOT NULL, content_hash text NOT NULL, token_count integer, title text, url text, symbol text, report_date date, visibility text NOT NULL DEFAULT 'public'::text, user_id text, metadata jsonb NOT NULL DEFAULT '{}'::jsonb, embedding USER-DEFINED, embedding_model text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());

-- Indexes for table: vector_chunks
CREATE UNIQUE INDEX vector_chunks_document_id_chunk_index_key ON public.vector_chunks USING btree (document_id, chunk_index);
CREATE INDEX vector_chunks_embedding_hnsw_idx ON public.vector_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX vector_chunks_metadata_gin_idx ON public.vector_chunks USING gin (metadata);
CREATE INDEX vector_chunks_report_date_idx ON public.vector_chunks USING btree (report_date);
CREATE INDEX vector_chunks_source_idx ON public.vector_chunks USING btree (source_type, source_id);
CREATE INDEX vector_chunks_symbol_idx ON public.vector_chunks USING btree (symbol);
CREATE INDEX vector_chunks_visibility_user_idx ON public.vector_chunks USING btree (visibility, user_id);

-- Foreign key constraints for table: vector_chunks
ALTER TABLE vector_chunks ADD CONSTRAINT vector_chunks_document_id_fkey FOREIGN KEY (document_id) REFERENCES vector_documents (id) ON DELETE CASCADE;

-- Table: vector_documents
CREATE TABLE IF NOT EXISTS vector_documents (id uuid NOT NULL DEFAULT gen_random_uuid(), source_type text NOT NULL, source_id text NOT NULL, title text, url text, symbol text, report_date date, visibility text NOT NULL DEFAULT 'public'::text, user_id text, metadata jsonb NOT NULL DEFAULT '{}'::jsonb, content_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

-- Indexes for table: vector_documents
CREATE INDEX vector_documents_source_idx ON public.vector_documents USING btree (source_type, source_id);
CREATE UNIQUE INDEX vector_documents_source_type_source_id_content_hash_key ON public.vector_documents USING btree (source_type, source_id, content_hash);

-- Table: weekly_macro_reports
CREATE TABLE IF NOT EXISTS weekly_macro_reports (id uuid NOT NULL DEFAULT gen_random_uuid(), week_label text NOT NULL, generated_at timestamptz, narrative text, signal_lights jsonb, liquidity_analysis jsonb, economy_analysis jsonb, inflation_analysis jsonb, sentiment_analysis jsonb, takeaway text, week_ahead jsonb, raw_data jsonb, created_at timestamptz DEFAULT now(), verdict text, landscape text, title text DEFAULT ''::text);

-- Indexes for table: weekly_macro_reports
CREATE UNIQUE INDEX idx_weekly_macro_reports_week ON public.weekly_macro_reports USING btree (week_label);

-- Table: zsxq_credentials
CREATE TABLE IF NOT EXISTS zsxq_credentials (group_id text NOT NULL, cookie text NOT NULL, status text NOT NULL DEFAULT 'active'::text, updated_at timestamptz NOT NULL DEFAULT now(), updated_by text);

-- Table: zsxq_ingest_runs
CREATE TABLE IF NOT EXISTS zsxq_ingest_runs (run_id uuid NOT NULL DEFAULT gen_random_uuid(), group_id text NOT NULL, crawl_type text NOT NULL, started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz, status text NOT NULL DEFAULT 'running'::text, pages_fetched integer DEFAULT 0, topics_seen integer DEFAULT 0, topics_new integer DEFAULT 0, topics_updated integer DEFAULT 0, comments_fetched integer DEFAULT 0, files_downloaded integer DEFAULT 0, indexed integer DEFAULT 0, skipped integer DEFAULT 0, failed integer DEFAULT 0, error_message text, report jsonb NOT NULL DEFAULT '{}'::jsonb);

-- Table: zsxq_ingest_state
CREATE TABLE IF NOT EXISTS zsxq_ingest_state (group_id text NOT NULL, last_success_at timestamptz, last_seen_create_time text, last_seen_topic_id text, last_input_hash text, last_summary jsonb NOT NULL DEFAULT '{}'::jsonb);

-- Table: zsxq_thread_ledger
CREATE TABLE IF NOT EXISTS zsxq_thread_ledger (group_id text NOT NULL, topic_id text NOT NULL, first_seen_run_id uuid, last_run_id uuid, topic_type text, author_role text, create_time text, content_hash text, stage_crawled text DEFAULT 'pending'::text, stage_comments text DEFAULT 'pending'::text, stage_binaries text DEFAULT 'pending'::text, stage_normalized text DEFAULT 'pending'::text, stage_indexed text DEFAULT 'pending'::text, drop_reason text, binaries_total integer DEFAULT 0, binaries_failed integer DEFAULT 0, storage_keys jsonb NOT NULL DEFAULT '[]'::jsonb, last_error text, updated_at timestamptz NOT NULL DEFAULT now());

-- Indexes for table: zsxq_thread_ledger
CREATE INDEX zsxq_ledger_run_idx ON public.zsxq_thread_ledger USING btree (last_run_id);
CREATE INDEX zsxq_ledger_stage_idx ON public.zsxq_thread_ledger USING btree (group_id, stage_indexed);

-- Functions and Procedures
-- Function: admin_activity_stats
CREATE OR REPLACE FUNCTION public.admin_activity_stats()
 RETURNS TABLE(user_id text, event_type text, event_count bigint, last_event_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT user_id, event_type, count(*)::bigint, max(created_at)
  FROM user_activities GROUP BY user_id, event_type;
$function$
;

-- Function: admin_conversation_stats
CREATE OR REPLACE FUNCTION public.admin_conversation_stats()
 RETURNS TABLE(user_id text, conversation_count bigint, total_messages bigint, last_conversation_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT user_id, count(*)::bigint, coalesce(sum(message_count), 0)::bigint, max(updated_at)
  FROM picker_conversations GROUP BY user_id;
$function$
;

-- Function: admin_daily_activity
CREATE OR REPLACE FUNCTION public.admin_daily_activity(days_back integer DEFAULT 30)
 RETURNS TABLE(day date, active_users bigint, event_count bigint, api_calls bigint)
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  with params as (
    select greatest(1, least(coalesce(days_back, 30), 90))::int as days
  ),
  day_series as (
    select generate_series(
      current_date - ((select days from params) - 1),
      current_date,
      interval '1 day'
    )::date as day
  )
  select
    d.day,
    count(distinct ua.user_id) filter (where ua.user_id is not null)::bigint as active_users,
    count(ua.id)::bigint as event_count,
    count(ua.id) filter (where ua.event_type = 'api_call')::bigint as api_calls
  from day_series d
  left join public.user_activities ua
    on (ua.created_at at time zone 'UTC')::date = d.day
  group by d.day
  order by d.day;
$function$
;

-- Function: admin_daily_email_metrics
CREATE OR REPLACE FUNCTION public.admin_daily_email_metrics(days_back integer DEFAULT 30)
 RETURNS TABLE(day date, delivered bigint, opened bigint, clicked bigint, bounced bigint, complained bigint, failed bigint, open_rate numeric, click_rate numeric)
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  WITH params AS (
    SELECT greatest(1, least(coalesce(days_back, 30), 90))::int AS days
  ),
  bounds AS (
    SELECT
      (now() AT TIME ZONE 'America/Los_Angeles')::date AS end_day,
      ((now() AT TIME ZONE 'America/Los_Angeles')::date - ((SELECT days FROM params) - 1)) AS start_day
  ),
  day_series AS (
    SELECT generate_series(
      (SELECT start_day FROM bounds),
      (SELECT end_day FROM bounds),
      interval '1 day'
    )::date AS day
  ),
  scoped AS (
    SELECT
      (coalesce(event_created_at, created_at) AT TIME ZONE 'America/Los_Angeles')::date AS day,
      event_type,
      coalesce(email_id, recipient_email, svix_id) AS event_key
    FROM email_events
    WHERE (coalesce(event_created_at, created_at) AT TIME ZONE 'America/Los_Angeles')::date
      BETWEEN (SELECT start_day FROM bounds) AND (SELECT end_day FROM bounds)
  ),
  aggregated AS (
    SELECT
      day,
      count(DISTINCT event_key) FILTER (WHERE event_type = 'email.delivered')::bigint AS delivered,
      count(DISTINCT event_key) FILTER (WHERE event_type = 'email.opened')::bigint AS opened,
      count(DISTINCT event_key) FILTER (WHERE event_type = 'email.clicked')::bigint AS clicked,
      count(DISTINCT event_key) FILTER (WHERE event_type = 'email.bounced')::bigint AS bounced,
      count(DISTINCT event_key) FILTER (WHERE event_type = 'email.complained')::bigint AS complained,
      count(DISTINCT event_key) FILTER (WHERE event_type IN ('email.failed', 'email.suppressed'))::bigint AS failed
    FROM scoped
    GROUP BY day
  )
  SELECT
    d.day,
    coalesce(a.delivered, 0)::bigint AS delivered,
    coalesce(a.opened, 0)::bigint AS opened,
    coalesce(a.clicked, 0)::bigint AS clicked,
    coalesce(a.bounced, 0)::bigint AS bounced,
    coalesce(a.complained, 0)::bigint AS complained,
    coalesce(a.failed, 0)::bigint AS failed,
    CASE
      WHEN coalesce(a.delivered, 0) = 0 THEN 0
      ELSE least(round((coalesce(a.opened, 0)::numeric / a.delivered::numeric) * 100, 2), 100)
    END AS open_rate,
    CASE
      WHEN coalesce(a.delivered, 0) = 0 THEN 0
      ELSE least(round((coalesce(a.clicked, 0)::numeric / a.delivered::numeric) * 100, 2), 100)
    END AS click_rate
  FROM day_series d
  LEFT JOIN aggregated a ON a.day = d.day
  ORDER BY d.day;
$function$
;

-- Function: admin_daily_email_metrics_range
CREATE OR REPLACE FUNCTION public.admin_daily_email_metrics_range(start_date date, end_date date)
 RETURNS TABLE(day date, delivered bigint, opened bigint, clicked bigint, bounced bigint, complained bigint, failed bigint, open_rate numeric, click_rate numeric)
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  WITH bounds AS (
    SELECT
      least(
        coalesce(start_date, (now() AT TIME ZONE 'America/Los_Angeles')::date),
        coalesce(end_date, (now() AT TIME ZONE 'America/Los_Angeles')::date)
      ) AS start_day,
      greatest(
        coalesce(start_date, (now() AT TIME ZONE 'America/Los_Angeles')::date),
        coalesce(end_date, (now() AT TIME ZONE 'America/Los_Angeles')::date)
      ) AS end_day
  ),
  day_series AS (
    SELECT generate_series(
      (SELECT start_day FROM bounds),
      (SELECT end_day FROM bounds),
      interval '1 day'
    )::date AS day
  ),
  scoped AS (
    SELECT
      (coalesce(event_created_at, created_at) AT TIME ZONE 'America/Los_Angeles')::date AS day,
      event_type,
      coalesce(email_id, recipient_email, svix_id) AS event_key
    FROM email_events
    WHERE (coalesce(event_created_at, created_at) AT TIME ZONE 'America/Los_Angeles')::date
      BETWEEN (SELECT start_day FROM bounds) AND (SELECT end_day FROM bounds)
  ),
  aggregated AS (
    SELECT
      day,
      count(DISTINCT event_key) FILTER (WHERE event_type = 'email.delivered')::bigint AS delivered,
      count(DISTINCT event_key) FILTER (WHERE event_type = 'email.opened')::bigint AS opened,
      count(DISTINCT event_key) FILTER (WHERE event_type = 'email.clicked')::bigint AS clicked,
      count(DISTINCT event_key) FILTER (WHERE event_type = 'email.bounced')::bigint AS bounced,
      count(DISTINCT event_key) FILTER (WHERE event_type = 'email.complained')::bigint AS complained,
      count(DISTINCT event_key) FILTER (WHERE event_type IN ('email.failed', 'email.suppressed'))::bigint AS failed
    FROM scoped
    GROUP BY day
  )
  SELECT
    d.day,
    coalesce(a.delivered, 0)::bigint AS delivered,
    coalesce(a.opened, 0)::bigint AS opened,
    coalesce(a.clicked, 0)::bigint AS clicked,
    coalesce(a.bounced, 0)::bigint AS bounced,
    coalesce(a.complained, 0)::bigint AS complained,
    coalesce(a.failed, 0)::bigint AS failed,
    CASE
      WHEN coalesce(a.delivered, 0) = 0 THEN 0
      ELSE least(round((coalesce(a.opened, 0)::numeric / a.delivered::numeric) * 100, 2), 100)
    END AS open_rate,
    CASE
      WHEN coalesce(a.delivered, 0) = 0 THEN 0
      ELSE least(round((coalesce(a.clicked, 0)::numeric / a.delivered::numeric) * 100, 2), 100)
    END AS click_rate
  FROM day_series d
  LEFT JOIN aggregated a ON a.day = d.day
  ORDER BY d.day;
$function$
;

-- Function: admin_email_channel_metrics
CREATE OR REPLACE FUNCTION public.admin_email_channel_metrics(days_back integer DEFAULT 30)
 RETURNS TABLE(channel text, delivered bigint, opened bigint, clicked bigint, bounced bigint, complained bigint, failed bigint, open_rate numeric, click_rate numeric)
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  WITH params AS (
    SELECT greatest(1, least(coalesce(days_back, 30), 90))::int AS days
  ),
  bounds AS (
    SELECT
      (now() AT TIME ZONE 'America/Los_Angeles')::date AS end_day,
      ((now() AT TIME ZONE 'America/Los_Angeles')::date - ((SELECT days FROM params) - 1)) AS start_day
  ),
  scoped AS (
    SELECT
      public.infer_email_event_channel(email_events.channel, raw_payload, subject) AS channel,
      event_type,
      coalesce(email_id, recipient_email, svix_id) AS event_key
    FROM email_events
    WHERE (coalesce(event_created_at, created_at) AT TIME ZONE 'America/Los_Angeles')::date
      BETWEEN (SELECT start_day FROM bounds) AND (SELECT end_day FROM bounds)
  ),
  aggregated AS (
    SELECT
      channel,
      count(DISTINCT event_key) FILTER (WHERE event_type = 'email.delivered')::bigint AS delivered,
      count(DISTINCT event_key) FILTER (WHERE event_type = 'email.opened')::bigint AS opened,
      count(DISTINCT event_key) FILTER (WHERE event_type = 'email.clicked')::bigint AS clicked,
      count(DISTINCT event_key) FILTER (WHERE event_type = 'email.bounced')::bigint AS bounced,
      count(DISTINCT event_key) FILTER (WHERE event_type = 'email.complained')::bigint AS complained,
      count(DISTINCT event_key) FILTER (WHERE event_type IN ('email.failed', 'email.suppressed'))::bigint AS failed
    FROM scoped
    GROUP BY channel
  )
  SELECT
    channel,
    delivered,
    opened,
    clicked,
    bounced,
    complained,
    failed,
    CASE
      WHEN delivered = 0 THEN 0
      ELSE least(round((opened::numeric / delivered::numeric) * 100, 2), 100)
    END AS open_rate,
    CASE
      WHEN delivered = 0 THEN 0
      ELSE least(round((clicked::numeric / delivered::numeric) * 100, 2), 100)
    END AS click_rate
  FROM aggregated
  ORDER BY delivered DESC, channel ASC;
$function$
;

-- Function: admin_email_channel_metrics_range
CREATE OR REPLACE FUNCTION public.admin_email_channel_metrics_range(start_date date, end_date date)
 RETURNS TABLE(channel text, delivered bigint, opened bigint, clicked bigint, bounced bigint, complained bigint, failed bigint, open_rate numeric, click_rate numeric)
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  WITH bounds AS (
    SELECT
      least(
        coalesce(start_date, (now() AT TIME ZONE 'America/Los_Angeles')::date),
        coalesce(end_date, (now() AT TIME ZONE 'America/Los_Angeles')::date)
      ) AS start_day,
      greatest(
        coalesce(start_date, (now() AT TIME ZONE 'America/Los_Angeles')::date),
        coalesce(end_date, (now() AT TIME ZONE 'America/Los_Angeles')::date)
      ) AS end_day
  ),
  scoped AS (
    SELECT
      public.infer_email_event_channel(email_events.channel, raw_payload, subject) AS channel,
      event_type,
      coalesce(email_id, recipient_email, svix_id) AS event_key
    FROM email_events
    WHERE (coalesce(event_created_at, created_at) AT TIME ZONE 'America/Los_Angeles')::date
      BETWEEN (SELECT start_day FROM bounds) AND (SELECT end_day FROM bounds)
  ),
  aggregated AS (
    SELECT
      channel,
      count(DISTINCT event_key) FILTER (WHERE event_type = 'email.delivered')::bigint AS delivered,
      count(DISTINCT event_key) FILTER (WHERE event_type = 'email.opened')::bigint AS opened,
      count(DISTINCT event_key) FILTER (WHERE event_type = 'email.clicked')::bigint AS clicked,
      count(DISTINCT event_key) FILTER (WHERE event_type = 'email.bounced')::bigint AS bounced,
      count(DISTINCT event_key) FILTER (WHERE event_type = 'email.complained')::bigint AS complained,
      count(DISTINCT event_key) FILTER (WHERE event_type IN ('email.failed', 'email.suppressed'))::bigint AS failed
    FROM scoped
    GROUP BY channel
  )
  SELECT
    channel,
    delivered,
    opened,
    clicked,
    bounced,
    complained,
    failed,
    CASE
      WHEN delivered = 0 THEN 0
      ELSE least(round((opened::numeric / delivered::numeric) * 100, 2), 100)
    END AS open_rate,
    CASE
      WHEN delivered = 0 THEN 0
      ELSE least(round((clicked::numeric / delivered::numeric) * 100, 2), 100)
    END AS click_rate
  FROM aggregated
  ORDER BY delivered DESC, channel ASC;
$function$
;

-- Function: admin_feedback_stats
CREATE OR REPLACE FUNCTION public.admin_feedback_stats()
 RETURNS TABLE(email text, feedback_count bigint, last_feedback_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT email, count(*)::bigint, max(created_at)
  FROM email_feedback GROUP BY email;
$function$
;

-- Function: admin_growth_metrics
CREATE OR REPLACE FUNCTION public.admin_growth_metrics(days_back integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  WITH params AS (
    SELECT greatest(1, least(coalesce(days_back, 30), 90))::int AS days
  )
  SELECT public.admin_growth_metrics_range(
    current_date - ((SELECT days FROM params) - 1),
    current_date
  );
$function$
;

-- Function: admin_growth_metrics_range
CREATE OR REPLACE FUNCTION public.admin_growth_metrics_range(start_date date, end_date date)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  WITH normalized AS (
    SELECT
      least(
        coalesce($1, current_date),
        coalesce($2, current_date)
      )::date AS current_start,
      greatest(
        coalesce($1, current_date),
        coalesce($2, current_date)
      )::date AS current_end
  ),
  params AS (
    SELECT
      current_start,
      current_end,
      greatest(1, (current_end - current_start + 1))::int AS days
    FROM normalized
  ),
  period_defs AS (
    SELECT
      'current'::text AS period,
      current_start AS start_date,
      current_end AS end_date
    FROM params
    UNION ALL
    SELECT
      'previous'::text AS period,
      current_start - days AS start_date,
      current_start - 1 AS end_date
    FROM params
  ),
  registered AS (
    SELECT id::text AS user_id, created_at
    FROM auth.users
  ),
  activity_events AS (
    SELECT
      ua.user_id::text AS user_id,
      ua.event_type,
      ua.event_name,
      ua.metadata,
      ua.created_at
    FROM public.user_activities ua
    WHERE ua.user_id IS NOT NULL
  ),
  setup_events AS (
    SELECT user_id, min(created_at) AS first_at
    FROM (
      SELECT user_id, created_at
      FROM activity_events
      WHERE event_type IN ('portfolio_uploaded', 'watchlist_created', 'ticker_added')
         OR event_name IN ('portfolio_uploaded', 'watchlist_created', 'ticker_added')
      UNION ALL
      SELECT user_id::text, created_at
      FROM public.user_portfolios
      WHERE coalesce(symbol, '') <> '$CASH'
    ) s
    GROUP BY user_id
  ),
  insight_events AS (
    SELECT user_id, min(created_at) AS first_at
    FROM (
      SELECT user_id, created_at
      FROM activity_events
      WHERE event_type = 'first_insight_generated'
         OR event_name = 'first_insight_generated'
      UNION ALL
      SELECT user_id::text, created_at
      FROM public.agent_session_events
      WHERE event_type = 'assistant_message'
         OR role = 'assistant'
    ) s
    GROUP BY user_id
  ),
  qualified_activity AS (
    SELECT user_id, created_at
    FROM activity_events
    WHERE event_type IN (
      'portfolio_checked',
      'watchlist_checked',
      'chat_message_sent',
      'follow_up_question_sent',
      'first_insight_generated',
      'insight_saved',
      'alert_opened'
    )
       OR event_name IN (
      'portfolio_checked',
      'watchlist_checked',
      'chat_message_sent',
      'follow_up_question_sent',
      'first_insight_generated',
      'insight_saved',
      'alert_opened',
      'ai_research',
      'stock_research',
      'daily_report',
      'morning_report',
      'macro',
      'screener'
    )
    UNION ALL
    SELECT user_id::text, created_at
    FROM public.agent_session_events
    WHERE event_type = 'user_message'
       OR role = 'user'
  ),
  period_registered AS (
    SELECT p.period, count(DISTINCT r.user_id)::numeric AS count
    FROM period_defs p
    LEFT JOIN registered r
      ON (r.created_at AT TIME ZONE 'UTC')::date <= p.end_date
    GROUP BY p.period
  ),
  period_setup AS (
    SELECT p.period, count(DISTINCT s.user_id)::numeric AS count
    FROM period_defs p
    JOIN registered r
      ON (r.created_at AT TIME ZONE 'UTC')::date <= p.end_date
    LEFT JOIN setup_events s
      ON s.user_id = r.user_id
     AND (s.first_at AT TIME ZONE 'UTC')::date <= p.end_date
    GROUP BY p.period
  ),
  period_insights AS (
    SELECT p.period, count(DISTINCT i.user_id)::numeric AS count
    FROM period_defs p
    JOIN registered r
      ON (r.created_at AT TIME ZONE 'UTC')::date <= p.end_date
    LEFT JOIN insight_events i
      ON i.user_id = r.user_id
     AND (i.first_at AT TIME ZONE 'UTC')::date <= p.end_date
    GROUP BY p.period
  ),
  weekly_return AS (
    SELECT
      p.period,
      count(DISTINCT prev.user_id)::numeric AS denominator,
      count(DISTINCT curr.user_id)::numeric AS numerator
    FROM period_defs p
    LEFT JOIN qualified_activity prev
      ON (prev.created_at AT TIME ZONE 'UTC')::date BETWEEN (p.end_date - 13) AND (p.end_date - 7)
    LEFT JOIN qualified_activity curr
      ON curr.user_id = prev.user_id
     AND (curr.created_at AT TIME ZONE 'UTC')::date BETWEEN (p.end_date - 6) AND p.end_date
    GROUP BY p.period
  ),
  session_messages AS (
    SELECT
      p.period,
      ase.user_id::text AS user_id,
      concat(ase.user_id::text, ':', ase.agent_id, ':', ase.session_id) AS session_key,
      count(*)::numeric AS user_messages
    FROM period_defs p
    JOIN public.agent_session_events ase
      ON (ase.created_at AT TIME ZONE 'UTC')::date BETWEEN p.start_date AND p.end_date
     AND (ase.event_type = 'user_message' OR ase.role = 'user')
    GROUP BY p.period, ase.user_id, ase.agent_id, ase.session_id
  ),
  session_stats AS (
    SELECT
      period,
      count(*)::numeric AS sessions,
      count(*) FILTER (WHERE user_messages >= 2)::numeric AS follow_up_sessions,
      coalesce(sum(user_messages), 0)::numeric AS questions
    FROM session_messages
    GROUP BY period
  ),
  ratings AS (
    SELECT
      p.period,
      count(DISTINCT ae.user_id) FILTER (
        WHERE ae.event_type = 'insight_saved'
           OR ae.event_name = 'insight_saved'
      )::numeric AS saved
    FROM period_defs p
    LEFT JOIN activity_events ae
      ON (ae.created_at AT TIME ZONE 'UTC')::date BETWEEN p.start_date AND p.end_date
    GROUP BY p.period
  ),
  answer_feedback AS (
    SELECT
      p.period,
      count(*) FILTER (WHERE ase.feedback_sentiment = 1)::numeric AS useful_answers,
      count(*) FILTER (WHERE ase.feedback_sentiment = -1)::numeric AS thumbs_down_answers,
      count(*) FILTER (WHERE ase.feedback_sentiment IN (1, -1))::numeric AS rated_answers
    FROM period_defs p
    LEFT JOIN public.agent_session_events ase
      ON (ase.created_at AT TIME ZONE 'UTC')::date BETWEEN p.start_date AND p.end_date
     AND ase.event_type = 'assistant_message'
    GROUP BY p.period
  ),
  turn_event_rows AS (
    SELECT
      p.period,
      concat_ws(
        ':',
        ase.user_id::text,
        ase.agent_id,
        ase.session_id,
        coalesce(
          nullif(ase.turn_id, ''),
          nullif(split_part(coalesce(ase.client_event_id, ''), ':', 1), ''),
          ase.id::text
        )
      ) AS turn_key,
      ase.event_type,
      lower(coalesce(ase.payload->>'code', '')) AS error_code
    FROM period_defs p
    JOIN public.agent_session_events ase
      ON (ase.created_at AT TIME ZONE 'UTC')::date BETWEEN p.start_date AND p.end_date
    WHERE ase.event_type IN ('user_message', 'assistant_message', 'error')
  ),
  turn_outcomes AS (
    SELECT
      period,
      turn_key,
      bool_or(event_type = 'error') AS had_error,
      bool_or(event_type = 'error' AND (error_code = 'agent_timeout' OR error_code LIKE '%timeout%')) AS had_timeout
    FROM turn_event_rows
    GROUP BY period, turn_key
  ),
  reliability_stats AS (
    SELECT
      period,
      count(*)::numeric AS turns,
      count(*) FILTER (WHERE had_error)::numeric AS error_turns,
      count(*) FILTER (WHERE had_timeout)::numeric AS timeout_turns
    FROM turn_outcomes
    GROUP BY period
  ),
  assistant_latency_values AS (
    SELECT
      p.period,
      CASE
        WHEN (ase.payload->>'latency_ms') ~ '^[0-9]+(\.[0-9]+)?$'
          THEN (ase.payload->>'latency_ms')::numeric
        WHEN (ase.payload->>'duration_ms') ~ '^[0-9]+(\.[0-9]+)?$'
          THEN (ase.payload->>'duration_ms')::numeric
        ELSE NULL
      END AS latency_ms
    FROM period_defs p
    JOIN public.agent_session_events ase
      ON (ase.created_at AT TIME ZONE 'UTC')::date BETWEEN p.start_date AND p.end_date
     AND ase.event_type = 'assistant_message'
  ),
  latency_stats AS (
    SELECT
      period,
      count(*)::numeric AS samples,
      (percentile_cont(0.50) WITHIN GROUP (ORDER BY latency_ms))::numeric AS p50_latency_ms,
      (percentile_cont(0.75) WITHIN GROUP (ORDER BY latency_ms))::numeric AS p75_latency_ms,
      (percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms))::numeric AS p95_latency_ms,
      (percentile_cont(0.99) WITHIN GROUP (ORDER BY latency_ms))::numeric AS p99_latency_ms
    FROM assistant_latency_values
    WHERE latency_ms IS NOT NULL
    GROUP BY period
  ),
  metric_values AS (
    SELECT
      'portfolio_watchlist_setup_rate' AS key,
      'Activation' AS category,
      'P0' AS priority,
      'Portfolio/watchlist setup rate' AS label,
      'percent' AS format,
      'Users with a portfolio/watchlist setup divided by registered users through period end.' AS description,
      p.period,
      coalesce(ps.count, 0) AS numerator,
      coalesce(pr.count, 0) AS denominator
    FROM period_defs p
    LEFT JOIN period_setup ps USING (period)
    LEFT JOIN period_registered pr USING (period)
    UNION ALL
    SELECT
      'first_insight_generation_rate',
      'Activation',
      'P0',
      'First AI output rate',
      'percent',
      'Users with a first assistant answer or legacy first_insight_generated event divided by registered users through period end.',
      p.period,
      coalesce(pi.count, 0),
      coalesce(pr.count, 0)
    FROM period_defs p
    LEFT JOIN period_insights pi USING (period)
    LEFT JOIN period_registered pr USING (period)
    UNION ALL
    SELECT
      'weekly_return_rate',
      'Retention',
      'P0',
      'Weekly return rate',
      'percent',
      'Users active in the prior 7-day block who were active again in the latest 7-day block.',
      p.period,
      coalesce(wr.numerator, 0),
      coalesce(wr.denominator, 0)
    FROM period_defs p
    LEFT JOIN weekly_return wr USING (period)
    UNION ALL
    SELECT
      'follow_up_question_rate',
      'Depth',
      'P0',
      'Follow-up question rate',
      'percent',
      'Chat sessions with at least two user messages divided by chat sessions with a user message.',
      p.period,
      coalesce(ss.follow_up_sessions, 0),
      coalesce(ss.sessions, 0)
    FROM period_defs p
    LEFT JOIN session_stats ss USING (period)
    UNION ALL
    SELECT
      'questions_per_session',
      'Depth',
      'P1',
      'Questions per session',
      'decimal',
      'User messages divided by chat sessions.',
      p.period,
      coalesce(ss.questions, 0),
      coalesce(ss.sessions, 0)
    FROM period_defs p
    LEFT JOIN session_stats ss USING (period)
    UNION ALL
    SELECT
      'saved_insight_rate',
      'Depth',
      'P1',
      'Saved insight rate',
      'percent',
      'Users who saved at least one insight divided by users with an insight.',
      p.period,
      coalesce(r.saved, 0),
      coalesce(pi.count, 0)
    FROM period_defs p
    LEFT JOIN ratings r USING (period)
    LEFT JOIN period_insights pi USING (period)
    UNION ALL
    SELECT
      'useful_answer_rate',
      'Quality / Trust',
      'P0',
      'Useful answer rate',
      'percent',
      'Positive assistant-answer feedback divided by rated assistant answers.',
      p.period,
      coalesce(af.useful_answers, 0),
      coalesce(af.rated_answers, 0)
    FROM period_defs p
    LEFT JOIN answer_feedback af USING (period)
    UNION ALL
    SELECT
      'thumbs_down_rate',
      'Quality / Trust',
      'P0',
      'Thumbs-down rate',
      'percent',
      'Negative assistant-answer feedback divided by rated assistant answers.',
      p.period,
      coalesce(af.thumbs_down_answers, 0),
      coalesce(af.rated_answers, 0)
    FROM period_defs p
    LEFT JOIN answer_feedback af USING (period)
    UNION ALL
    SELECT
      'error_rate',
      'Quality / Trust',
      'P0',
      'Error rate',
      'percent',
      'Chat turns with an agent runtime error divided by recorded chat turns.',
      p.period,
      coalesce(rs.error_turns, 0),
      coalesce(rs.turns, 0)
    FROM period_defs p
    LEFT JOIN reliability_stats rs USING (period)
    UNION ALL
    SELECT
      'timeout_rate',
      'Quality / Trust',
      'P0',
      'Timeout rate',
      'percent',
      'Chat turns with a timeout error divided by recorded chat turns.',
      p.period,
      coalesce(rs.timeout_turns, 0),
      coalesce(rs.turns, 0)
    FROM period_defs p
    LEFT JOIN reliability_stats rs USING (period)
    UNION ALL
    SELECT
      'p50_latency_ms',
      'Quality / Trust',
      'P1',
      'P50 latency',
      'duration_ms',
      '50th percentile response latency for assistant answers that record latency_ms.',
      p.period,
      coalesce(round(ls.p50_latency_ms, 0), 0),
      coalesce(ls.samples, 0)
    FROM period_defs p
    LEFT JOIN latency_stats ls USING (period)
    UNION ALL
    SELECT
      'p75_latency_ms',
      'Quality / Trust',
      'P1',
      'P75 latency',
      'duration_ms',
      '75th percentile response latency for assistant answers that record latency_ms.',
      p.period,
      coalesce(round(ls.p75_latency_ms, 0), 0),
      coalesce(ls.samples, 0)
    FROM period_defs p
    LEFT JOIN latency_stats ls USING (period)
    UNION ALL
    SELECT
      'p95_latency_ms',
      'Quality / Trust',
      'P1',
      'P95 latency',
      'duration_ms',
      '95th percentile response latency for assistant answers that record latency_ms.',
      p.period,
      coalesce(round(ls.p95_latency_ms, 0), 0),
      coalesce(ls.samples, 0)
    FROM period_defs p
    LEFT JOIN latency_stats ls USING (period)
    UNION ALL
    SELECT
      'p99_latency_ms',
      'Quality / Trust',
      'P1',
      'P99 latency',
      'duration_ms',
      '99th percentile response latency for assistant answers that record latency_ms.',
      p.period,
      coalesce(round(ls.p99_latency_ms, 0), 0),
      coalesce(ls.samples, 0)
    FROM period_defs p
    LEFT JOIN latency_stats ls USING (period)
  ),
  metric_json AS (
    SELECT
      key,
      category,
      priority,
      label,
      format,
      description,
      jsonb_object_agg(
        period,
        jsonb_build_object(
          'numerator', numerator,
          'denominator', denominator,
          'value', CASE
            WHEN denominator = 0 THEN NULL
            WHEN format = 'percent' THEN round((numerator / denominator) * 100, 2)
            WHEN format = 'duration_ms' THEN round(numerator, 0)
            ELSE round(numerator / denominator, 2)
          END
        )
      ) AS periods
    FROM metric_values
    GROUP BY key, category, priority, label, format, description
  )
  SELECT jsonb_build_object(
    'days', (SELECT days FROM params),
    'current', (
      SELECT jsonb_build_object('start_date', start_date, 'end_date', end_date)
      FROM period_defs
      WHERE period = 'current'
    ),
    'previous', (
      SELECT jsonb_build_object('start_date', start_date, 'end_date', end_date)
      FROM period_defs
      WHERE period = 'previous'
    ),
    'metrics', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'key', key,
          'category', category,
          'priority', priority,
          'label', label,
          'format', format,
          'description', description,
          'current', coalesce(periods->'current', '{"numerator":0,"denominator":0,"value":null}'::jsonb),
          'previous', coalesce(periods->'previous', '{"numerator":0,"denominator":0,"value":null}'::jsonb)
        )
        ORDER BY
          CASE category
            WHEN 'Activation' THEN 1
            WHEN 'Retention' THEN 2
            WHEN 'Depth' THEN 3
            WHEN 'Quality / Trust' THEN 4
            WHEN 'Growth' THEN 5
            ELSE 6
          END,
          CASE priority WHEN 'P0' THEN 1 ELSE 2 END,
          label
      ),
      '[]'::jsonb
    )
  )
  FROM metric_json;
$function$
;

-- Function: admin_llm_usage_daily
CREATE OR REPLACE FUNCTION public.admin_llm_usage_daily(since_ts timestamp with time zone, until_ts timestamp with time zone DEFAULT now())
 RETURNS TABLE(day date, feature text, model text, calls bigint, prompt_tokens bigint, output_tokens bigint, cached_tokens bigint, thoughts_tokens bigint, total_tokens bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    date_trunc('day', u.ts)::date as day,
    u.feature,
    u.model,
    count(*)::bigint as calls,
    coalesce(sum(u.prompt_tokens), 0)::bigint as prompt_tokens,
    coalesce(sum(u.output_tokens), 0)::bigint as output_tokens,
    coalesce(sum(u.cached_tokens), 0)::bigint as cached_tokens,
    coalesce(sum(u.thoughts_tokens), 0)::bigint as thoughts_tokens,
    coalesce(sum(u.total_tokens), 0)::bigint as total_tokens
  from public.llm_usage u
  where u.ts >= since_ts
    and u.ts < until_ts
  group by date_trunc('day', u.ts)::date, u.feature, u.model
  order by day desc, coalesce(sum(u.total_tokens), 0) desc;
$function$
;

-- Function: admin_llm_usage_metering_reliability
CREATE OR REPLACE FUNCTION public.admin_llm_usage_metering_reliability(since_ts timestamp with time zone, until_ts timestamp with time zone DEFAULT now())
 RETURNS TABLE(metering_version integer, calls bigint, prompt_tokens bigint, output_tokens bigint, cached_tokens bigint, thoughts_tokens bigint, total_tokens bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    coalesce(u.metering_version, 1)::integer as metering_version,
    count(*)::bigint as calls,
    coalesce(sum(u.prompt_tokens), 0)::bigint as prompt_tokens,
    coalesce(sum(u.output_tokens), 0)::bigint as output_tokens,
    coalesce(sum(u.cached_tokens), 0)::bigint as cached_tokens,
    coalesce(sum(u.thoughts_tokens), 0)::bigint as thoughts_tokens,
    coalesce(sum(u.total_tokens), 0)::bigint as total_tokens
  from public.llm_usage u
  where u.ts >= since_ts
    and u.ts < until_ts
  group by coalesce(u.metering_version, 1)::integer
  order by metering_version desc;
$function$
;

-- Function: admin_llm_usage_reliable_daily
CREATE OR REPLACE FUNCTION public.admin_llm_usage_reliable_daily(since_ts timestamp with time zone, until_ts timestamp with time zone DEFAULT now())
 RETURNS TABLE(day date, feature text, model text, calls bigint, prompt_tokens bigint, output_tokens bigint, cached_tokens bigint, thoughts_tokens bigint, total_tokens bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    date_trunc('day', u.ts)::date as day,
    u.feature,
    u.model,
    count(*)::bigint as calls,
    coalesce(sum(u.prompt_tokens), 0)::bigint as prompt_tokens,
    coalesce(sum(u.output_tokens), 0)::bigint as output_tokens,
    coalesce(sum(u.cached_tokens), 0)::bigint as cached_tokens,
    coalesce(sum(u.thoughts_tokens), 0)::bigint as thoughts_tokens,
    coalesce(sum(u.total_tokens), 0)::bigint as total_tokens
  from public.llm_usage u
  where u.ts >= since_ts
    and u.ts < until_ts
    and coalesce(u.metering_version, 1) >= 2
  group by date_trunc('day', u.ts)::date, u.feature, u.model
  order by day desc, coalesce(sum(u.total_tokens), 0) desc;
$function$
;

-- Function: admin_llm_usage_reliable_route_summary
CREATE OR REPLACE FUNCTION public.admin_llm_usage_reliable_route_summary(since_ts timestamp with time zone, until_ts timestamp with time zone DEFAULT now())
 RETURNS TABLE(route text, feature text, model text, calls bigint, prompt_tokens bigint, output_tokens bigint, cached_tokens bigint, thoughts_tokens bigint, total_tokens bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    coalesce(nullif(u.route, ''), 'unattributed') as route,
    u.feature,
    u.model,
    count(*)::bigint as calls,
    coalesce(sum(u.prompt_tokens), 0)::bigint as prompt_tokens,
    coalesce(sum(u.output_tokens), 0)::bigint as output_tokens,
    coalesce(sum(u.cached_tokens), 0)::bigint as cached_tokens,
    coalesce(sum(u.thoughts_tokens), 0)::bigint as thoughts_tokens,
    coalesce(sum(u.total_tokens), 0)::bigint as total_tokens
  from public.llm_usage u
  where u.ts >= since_ts
    and u.ts < until_ts
    and coalesce(u.metering_version, 1) >= 2
  group by coalesce(nullif(u.route, ''), 'unattributed'), u.feature, u.model
  order by coalesce(sum(u.total_tokens), 0) desc;
$function$
;

-- Function: admin_llm_usage_reliable_user_feature_summary
CREATE OR REPLACE FUNCTION public.admin_llm_usage_reliable_user_feature_summary(since_ts timestamp with time zone, until_ts timestamp with time zone DEFAULT now())
 RETURNS TABLE(user_id text, feature text, model text, calls bigint, prompt_tokens bigint, output_tokens bigint, cached_tokens bigint, thoughts_tokens bigint, total_tokens bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    u.user_id,
    u.feature,
    u.model,
    count(*)::bigint as calls,
    coalesce(sum(u.prompt_tokens), 0)::bigint as prompt_tokens,
    coalesce(sum(u.output_tokens), 0)::bigint as output_tokens,
    coalesce(sum(u.cached_tokens), 0)::bigint as cached_tokens,
    coalesce(sum(u.thoughts_tokens), 0)::bigint as thoughts_tokens,
    coalesce(sum(u.total_tokens), 0)::bigint as total_tokens
  from public.llm_usage u
  where u.ts >= since_ts
    and u.ts < until_ts
    and coalesce(u.metering_version, 1) >= 2
    and nullif(u.user_id, '') is not null
  group by u.user_id, u.feature, u.model
  order by coalesce(sum(u.total_tokens), 0) desc;
$function$
;

-- Function: admin_llm_usage_route_summary
CREATE OR REPLACE FUNCTION public.admin_llm_usage_route_summary(since_ts timestamp with time zone, until_ts timestamp with time zone DEFAULT now())
 RETURNS TABLE(route text, feature text, model text, calls bigint, prompt_tokens bigint, output_tokens bigint, cached_tokens bigint, thoughts_tokens bigint, total_tokens bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    coalesce(nullif(u.route, ''), 'unattributed') as route,
    u.feature,
    u.model,
    count(*)::bigint as calls,
    coalesce(sum(u.prompt_tokens), 0)::bigint as prompt_tokens,
    coalesce(sum(u.output_tokens), 0)::bigint as output_tokens,
    coalesce(sum(u.cached_tokens), 0)::bigint as cached_tokens,
    coalesce(sum(u.thoughts_tokens), 0)::bigint as thoughts_tokens,
    coalesce(sum(u.total_tokens), 0)::bigint as total_tokens
  from public.llm_usage u
  where u.ts >= since_ts
    and u.ts < until_ts
  group by coalesce(nullif(u.route, ''), 'unattributed'), u.feature, u.model
  order by coalesce(sum(u.total_tokens), 0) desc;
$function$
;

-- Function: admin_llm_usage_summary
CREATE OR REPLACE FUNCTION public.admin_llm_usage_summary(since_ts timestamp with time zone, until_ts timestamp with time zone DEFAULT now())
 RETURNS TABLE(feature text, model text, calls bigint, prompt_tokens bigint, output_tokens bigint, cached_tokens bigint, thoughts_tokens bigint, total_tokens bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    u.feature,
    u.model,
    count(*)::bigint as calls,
    coalesce(sum(u.prompt_tokens), 0)::bigint as prompt_tokens,
    coalesce(sum(u.output_tokens), 0)::bigint as output_tokens,
    coalesce(sum(u.cached_tokens), 0)::bigint as cached_tokens,
    coalesce(sum(u.thoughts_tokens), 0)::bigint as thoughts_tokens,
    coalesce(sum(u.total_tokens), 0)::bigint as total_tokens
  from public.llm_usage u
  where u.ts >= since_ts
    and u.ts < until_ts
  group by u.feature, u.model
  order by coalesce(sum(u.total_tokens), 0) desc;
$function$
;

-- Function: admin_llm_usage_user_feature_summary
CREATE OR REPLACE FUNCTION public.admin_llm_usage_user_feature_summary(since_ts timestamp with time zone, until_ts timestamp with time zone DEFAULT now())
 RETURNS TABLE(user_id text, feature text, model text, calls bigint, prompt_tokens bigint, output_tokens bigint, cached_tokens bigint, thoughts_tokens bigint, total_tokens bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    u.user_id,
    u.feature,
    u.model,
    count(*)::bigint as calls,
    coalesce(sum(u.prompt_tokens), 0)::bigint as prompt_tokens,
    coalesce(sum(u.output_tokens), 0)::bigint as output_tokens,
    coalesce(sum(u.cached_tokens), 0)::bigint as cached_tokens,
    coalesce(sum(u.thoughts_tokens), 0)::bigint as thoughts_tokens,
    coalesce(sum(u.total_tokens), 0)::bigint as total_tokens
  from public.llm_usage u
  where u.ts >= since_ts
    and u.ts < until_ts
    and nullif(u.user_id, '') is not null
  group by u.user_id, u.feature, u.model
  order by coalesce(sum(u.total_tokens), 0) desc;
$function$
;

-- Function: admin_llm_usage_user_summary
CREATE OR REPLACE FUNCTION public.admin_llm_usage_user_summary(since_ts timestamp with time zone, until_ts timestamp with time zone DEFAULT now())
 RETURNS TABLE(user_id text, calls bigint, prompt_tokens bigint, output_tokens bigint, cached_tokens bigint, thoughts_tokens bigint, total_tokens bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    u.user_id,
    count(*)::bigint as calls,
    coalesce(sum(u.prompt_tokens), 0)::bigint as prompt_tokens,
    coalesce(sum(u.output_tokens), 0)::bigint as output_tokens,
    coalesce(sum(u.cached_tokens), 0)::bigint as cached_tokens,
    coalesce(sum(u.thoughts_tokens), 0)::bigint as thoughts_tokens,
    coalesce(sum(u.total_tokens), 0)::bigint as total_tokens
  from public.llm_usage u
  where u.ts >= since_ts
    and u.ts < until_ts
    and nullif(u.user_id, '') is not null
  group by u.user_id
  order by coalesce(sum(u.total_tokens), 0) desc;
$function$
;

-- Function: admin_personal_digest_stats
CREATE OR REPLACE FUNCTION public.admin_personal_digest_stats()
 RETURNS TABLE(user_id text, count_30d bigint, last_date date)
 LANGUAGE sql
 STABLE
AS $function$ SELECT user_id::text, COUNT(*) FILTER (WHERE digest_date >= CURRENT_DATE - INTERVAL '30 days') AS count_30d, MAX(digest_date) AS last_date FROM personal_digests GROUP BY user_id $function$
;

-- Function: check_email_exists
CREATE OR REPLACE FUNCTION public.check_email_exists(lookup_email text)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
AS $function$ SELECT EXISTS (SELECT 1 FROM auth.users WHERE email = lookup_email); $function$
;

-- Function: confirm_user_email
CREATE OR REPLACE FUNCTION public.confirm_user_email(lookup_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$ BEGIN UPDATE auth.users SET email_confirmed_at = now() WHERE id = lookup_user_id AND email_confirmed_at IS NULL; END; $function$
;

-- Function: consume_research_quota_if_under_limit
CREATE OR REPLACE FUNCTION public.consume_research_quota_if_under_limit(p_identifier text, p_identifier_type text, p_usage_date date, p_limit integer, p_amount integer DEFAULT 1)
 RETURNS TABLE(consumed boolean, count integer, lim integer)
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_count INT;
BEGIN
  IF p_identifier IS NULL OR p_identifier = '' THEN
    RAISE EXCEPTION 'identifier required';
  END IF;
  IF p_usage_date IS NULL THEN
    RAISE EXCEPTION 'usage_date required';
  END IF;
  IF p_limit IS NULL OR p_limit <= 0 THEN
    RAISE EXCEPTION 'limit must be positive';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('research_quota_consume'),
    hashtext(p_identifier || '|' || p_usage_date::text)
  );

  INSERT INTO research_quota (identifier, identifier_type, usage_date, count)
       VALUES (p_identifier, p_identifier_type, p_usage_date, 0)
  ON CONFLICT (identifier, usage_date) DO NOTHING;

  -- NOTE: must qualify table column with alias `r.count` — the RETURNS
  -- TABLE declaration also names an OUT column `count`, so a bare `count`
  -- in SELECT/UPDATE raises "column reference 'count' is ambiguous".
  SELECT r.count INTO v_count
    FROM research_quota r
   WHERE r.identifier = p_identifier AND r.usage_date = p_usage_date;

  -- Whole-or-nothing: refuse if (current + amount) would exceed limit
  IF v_count + p_amount > p_limit THEN
    RETURN QUERY SELECT FALSE, v_count, p_limit;
    RETURN;
  END IF;

  UPDATE research_quota r
     SET count = COALESCE(r.count, 0) + p_amount,
         updated_at = now()
   WHERE r.identifier = p_identifier AND r.usage_date = p_usage_date;

  SELECT r.count INTO v_count
    FROM research_quota r
   WHERE r.identifier = p_identifier AND r.usage_date = p_usage_date;
  RETURN QUERY SELECT TRUE, v_count, p_limit;
END;
$function$
;

-- Function: create_default_policies
CREATE OR REPLACE FUNCTION public.create_default_policies()
 RETURNS event_trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  obj record;
  table_schema text;
  table_name text;
  has_rls boolean;
BEGIN
  FOR obj IN SELECT * FROM pg_event_trigger_ddl_commands() WHERE command_tag = 'CREATE TABLE'
  LOOP
    -- Extract schema and table name from object_identity
    -- Handle quoted identifiers by removing quotes
    SELECT INTO table_schema, table_name
      split_part(obj.object_identity, '.', 1),
      trim(both '"' from split_part(obj.object_identity, '.', 2));
    -- Check if RLS is enabled on the table
    SELECT INTO has_rls
      rowsecurity
    FROM pg_tables
    WHERE schemaname = table_schema
      AND tablename = table_name;
    -- Only create policies if RLS is enabled
    IF has_rls THEN
      -- Create policy for project_admin role only
      -- Users must define their own policies for anon and authenticated roles
      EXECUTE format('CREATE POLICY "project_admin_policy" ON %s FOR ALL TO project_admin USING (true) WITH CHECK (true)', obj.object_identity);
    END IF;
  END LOOP;
END;
$function$
;

-- Function: create_policies_after_rls
CREATE OR REPLACE FUNCTION public.create_policies_after_rls()
 RETURNS event_trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  obj record;
  table_schema text;
  table_name text;
BEGIN
  FOR obj IN SELECT * FROM pg_event_trigger_ddl_commands() WHERE command_tag = 'ALTER TABLE'
  LOOP
    -- Extract schema and table name
    -- Handle quoted identifiers by removing quotes
    SELECT INTO table_schema, table_name
      split_part(obj.object_identity, '.', 1),
      trim(both '"' from split_part(obj.object_identity, '.', 2));
    -- Check if table has RLS enabled and no policies yet
    IF EXISTS (
      SELECT 1 FROM pg_tables
      WHERE schemaname = table_schema
        AND tablename = table_name
        AND rowsecurity = true
    ) AND NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = table_schema
        AND tablename = table_name
    ) THEN
      -- Create policy for project_admin role only
      -- Users must define their own policies for anon and authenticated roles
      EXECUTE format('CREATE POLICY "project_admin_policy" ON %s FOR ALL TO project_admin USING (true) WITH CHECK (true)', obj.object_identity);
    END IF;
  END LOOP;
END;
$function$
;

-- Function: email
CREATE OR REPLACE FUNCTION public.email()
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  SELECT
  coalesce(
    current_setting('request.jwt.claim.email', true),
    (current_setting('request.jwt.claims', true)::jsonb ->> 'email')
  )::text
$function$
;

-- Function: get_user_email
CREATE OR REPLACE FUNCTION public.get_user_email(lookup_user_id uuid)
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
AS $function$ SELECT email FROM auth.users WHERE id = lookup_user_id LIMIT 1; $function$
;

-- Function: infer_email_event_channel
CREATE OR REPLACE FUNCTION public.infer_email_event_channel(stored_channel text, raw_payload jsonb, subject text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  WITH payload AS (
    SELECT
      coalesce(raw_payload, '{}'::jsonb) AS body,
      nullif(stored_channel, '') AS stored,
      coalesce(subject, '') AS subject_text
  ),
  tags AS (
    SELECT
      stored,
      subject_text,
      body #>> '{data,from}' AS from_text,
      coalesce(
        nullif(body #>> '{data,tags,channel}', ''),
        nullif(body #>> '{data,tags,email_channel}', ''),
        (
          SELECT nullif(tag->>'value', '')
          FROM jsonb_array_elements(
            CASE
              WHEN jsonb_typeof(body #> '{data,tags}') = 'array' THEN body #> '{data,tags}'
              ELSE '[]'::jsonb
            END
          ) AS tag
          WHERE lower(coalesce(tag->>'name', '')) IN ('channel', 'email_channel')
          LIMIT 1
        )
      ) AS tag_channel
    FROM payload
  )
  SELECT
    CASE
      WHEN stored IS NOT NULL AND stored <> 'unknown' THEN stored
      WHEN tag_channel IS NOT NULL THEN tag_channel
      WHEN subject_text ILIKE '%推特日报%' THEN 'twitter_digest'
      WHEN subject_text ILIKE '%专属日报%' THEN 'personal_digest'
      WHEN subject_text ILIKE '%早鸟价%' THEN 'lifecycle_email'
      WHEN subject_text ILIKE '%升级 Max%' THEN 'lifecycle_email'
      WHEN subject_text ILIKE '%早报%' THEN 'morning_report'
      WHEN from_text ILIKE '%morning@themarketbrew.com%' THEN 'morning_report'
      WHEN from_text ILIKE '%weekly@themarketbrew.com%' THEN 'weekly_report'
      ELSE 'unknown'
    END
  FROM tags;
$function$
;

-- Function: list_all_users
CREATE OR REPLACE FUNCTION public.list_all_users()
 RETURNS TABLE(user_id uuid, email text, name text, created_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
AS $function$SELECT id, email, profile->>'name', created_at FROM auth.users ORDER BY created_at DESC;$function$
;

-- Function: list_entitled_users
CREATE OR REPLACE FUNCTION public.list_entitled_users(feature_key text)
 RETURNS TABLE(user_id uuid, email text, first_name text, entitlements jsonb)
 LANGUAGE sql
 SECURITY DEFINER
AS $function$ SELECT s.user_id, au.email, au.profile->>'name', s.entitlements FROM subscriptions s JOIN auth.users au ON au.id = s.user_id WHERE s.entitlements @> jsonb_build_array(feature_key); $function$
;

-- Function: match_vector_chunks
CREATE OR REPLACE FUNCTION public.match_vector_chunks(query_embedding vector, match_count integer DEFAULT 8, match_threshold double precision DEFAULT 0.7, filters jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(id uuid, document_id uuid, source_type text, source_id text, chunk_index integer, content text, title text, url text, symbol text, report_date text, visibility text, user_id text, metadata jsonb, similarity double precision)
 LANGUAGE sql
 STABLE
AS $function$
  select
    c.id,
    c.document_id,
    c.source_type,
    c.source_id,
    c.chunk_index,
    c.content,
    c.title,
    c.url,
    c.symbol,
    c.report_date::text,
    c.visibility,
    c.user_id,
    c.metadata,
    1 - (c.embedding <=> query_embedding) as similarity
  from vector_chunks c
  where c.embedding is not null
    and 1 - (c.embedding <=> query_embedding) >= match_threshold
    and (
      not (filters ? 'source_types')
      or c.source_type in (
        select jsonb_array_elements_text(filters->'source_types')
      )
    )
    and (
      not (filters ? 'symbol')
      or c.symbol = filters->>'symbol'
    )
    and (
      not (filters ? 'visibility')
      or c.visibility = filters->>'visibility'
    )
    and (
      not (filters ? 'user_id')
      or c.user_id = filters->>'user_id'
    )
    and (
      not (filters ? 'date_from')
      or c.report_date >= (filters->>'date_from')::date
    )
    and (
      not (filters ? 'date_to')
      or c.report_date <= (filters->>'date_to')::date
    )
    and (
      not (filters ? 'metadata')
      or c.metadata @> (filters->'metadata')
    )
  order by c.embedding <=> query_embedding
  limit match_count;
$function$
;

-- Function: reconcile_user_portfolio_source
CREATE OR REPLACE FUNCTION public.reconcile_user_portfolio_source(p_user_id text, p_source text, p_rows jsonb, p_clear_source boolean DEFAULT false)
 RETURNS SETOF user_portfolios
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_now  TIMESTAMPTZ := now();
  v_keep TEXT[];
  r      JSONB;
BEGIN
  IF p_user_id IS NULL OR p_user_id = '' THEN
    RAISE EXCEPTION 'user_id required';
  END IF;
  IF p_source IS NULL OR p_source = '' THEN
    RAISE EXCEPTION 'source required';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'rows must be a json array';
  END IF;
  -- 空集会删光整个 source —— 仅显式 clear_source 允许（防"续修发增量"丢数据）
  IF jsonb_array_length(p_rows) = 0 AND NOT p_clear_source THEN
    RAISE EXCEPTION 'empty rows requires clear_source=true';
  END IF;

  -- 串行化同一 (user_id, source) 的并发完整集提交。两个 int4 key 形式降低碰撞。
  PERFORM pg_advisory_xact_lock(
    hashtext('hsync_reconcile'),
    hashtext(p_user_id || '|' || p_source)
  );

  -- 1) 逐条 upsert；P1 (thesis/target/stop_loss/conviction) 永远保留既有行的值，
  --    绝不取自 import payload —— ON CONFLICT 的 SET 列表里**不含** P1 四列，
  --    既有 P1 原样保留；新行 P1 为 NULL（正是 COALESCE-from-existing 语义）。
  --    import 本就不携带 P1（NormalizedHolding 结构上无 P1 字段）。
  FOR r IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    IF COALESCE(r->>'symbol', '') = '' THEN
      CONTINUE;
    END IF;
    INSERT INTO user_portfolios (
      user_id, symbol, weight_pct, shares, cost_basis, entry_price,
      source, source_synced_at, external_account_id
    ) VALUES (
      p_user_id,
      r->>'symbol',
      NULLIF(r->>'weight_pct','')::numeric,
      NULLIF(r->>'shares','')::numeric,
      NULLIF(r->>'cost_basis','')::numeric,
      NULLIF(r->>'entry_price','')::numeric,
      p_source,
      v_now,
      NULLIF(r->>'external_account_id','')
    )
    ON CONFLICT (user_id, symbol) DO UPDATE SET
      weight_pct          = EXCLUDED.weight_pct,
      shares              = EXCLUDED.shares,
      cost_basis          = EXCLUDED.cost_basis,
      entry_price         = EXCLUDED.entry_price,
      source              = EXCLUDED.source,
      source_synced_at    = EXCLUDED.source_synced_at,
      external_account_id = COALESCE(EXCLUDED.external_account_id,
                                     user_portfolios.external_account_id);
  END LOOP;

  -- 2) 源作用域删除：删掉本次 import 不再包含、且属于本 source 的行；
  --    $CASH 是 source-agnostic 单例，永不被源作用域删除。
  SELECT COALESCE(array_agg(elem->>'symbol'), ARRAY[]::TEXT[])
    INTO v_keep
    FROM jsonb_array_elements(p_rows) AS elem
   WHERE COALESCE(elem->>'symbol','') <> '' AND elem->>'symbol' <> '$CASH';

  DELETE FROM user_portfolios
   WHERE user_id = p_user_id
     AND source  = p_source
     AND symbol  <> '$CASH'
     AND symbol  <> ALL(v_keep);

  -- 3) R-2 touch 折叠进同一事务（原子；错误一并回滚，不再单独往返）
  INSERT INTO user_investment_profiles (user_id, portfolio_confirmed_at)
  VALUES (p_user_id, v_now)
  ON CONFLICT (user_id) DO UPDATE SET portfolio_confirmed_at = v_now;

  -- 4) 返回该用户最新全量持仓（PostgREST 序列化为行对象数组）
  RETURN QUERY
    SELECT * FROM user_portfolios WHERE user_id = p_user_id;
END;
$function$
;

-- Function: reload_postgrest_schema
CREATE OR REPLACE FUNCTION public.reload_postgrest_schema()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
    BEGIN
        -- Method 1: Use NOTIFY to signal PostgREST to reload schema
        -- PostgREST listens to 'pgrst' channel for schema changes
        NOTIFY pgrst, 'reload schema';
        
        RAISE NOTICE 'PostgREST schema reload notification sent';
    END
    $function$
;

-- Function: role
CREATE OR REPLACE FUNCTION public.role()
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  SELECT
  coalesce(
    current_setting('request.jwt.claim.role', true),
    (current_setting('request.jwt.claims', true)::jsonb ->> 'role')
  )::text
$function$
;

-- Function: sync_auth_user_to_public
CREATE OR REPLACE FUNCTION public.sync_auth_user_to_public()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.users (id, created_at, updated_at)
  VALUES (NEW.id, NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$
;

-- Function: u0a_set_updated_at
CREATE OR REPLACE FUNCTION public.u0a_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

-- Function: uid
CREATE OR REPLACE FUNCTION public.uid()
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  SELECT
  nullif(
    coalesce(
      current_setting('request.jwt.claim.sub', true),
      (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')
    ),
    ''
  )::uuid
$function$
;

-- Function: update_updated_at_column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;

-- Sequences
CREATE SEQUENCE IF NOT EXISTS access_requests_id_seq START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 NO CYCLE;
CREATE SEQUENCE IF NOT EXISTS ticker_event_candidates_id_seq START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 NO CYCLE;

