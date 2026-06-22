-- Apply in Insforge SQL editor / `insforge db sql -f` before deploying zsxq-ingest-store.js.

create table if not exists zsxq_credentials (
  group_id text primary key,
  cookie text not null,
  status text not null default 'active',   -- active | cookie_expired | access_denied | membership_expired
  updated_at timestamptz not null default now(),
  updated_by text
);

create table if not exists zsxq_ingest_state (
  group_id text primary key,
  last_success_at timestamptz,
  last_seen_create_time text,
  last_seen_topic_id text,
  last_input_hash text,
  last_summary jsonb not null default '{}'::jsonb
);

create table if not exists zsxq_ingest_runs (
  run_id uuid primary key default gen_random_uuid(),
  group_id text not null,
  crawl_type text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',   -- running|done|degraded|failed|auth_failed
  pages_fetched int default 0,
  topics_seen int default 0,
  topics_new int default 0,
  topics_updated int default 0,
  comments_fetched int default 0,
  files_downloaded int default 0,
  indexed int default 0,
  skipped int default 0,
  failed int default 0,
  error_message text,
  report jsonb not null default '{}'::jsonb
);

create table if not exists zsxq_thread_ledger (
  group_id text not null,
  topic_id text not null,
  first_seen_run_id uuid,
  last_run_id uuid,
  topic_type text,
  author_role text,
  create_time text,
  content_hash text,
  stage_crawled text default 'pending',
  stage_comments text default 'pending',
  stage_binaries text default 'pending',
  stage_normalized text default 'pending',
  stage_indexed text default 'pending',
  drop_reason text,
  binaries_total int default 0,
  binaries_failed int default 0,
  storage_keys jsonb not null default '[]'::jsonb,   -- bucket keys for raw json + binaries (download/delete)
  last_error text,
  updated_at timestamptz not null default now(),
  primary key (group_id, topic_id)
);

create index if not exists zsxq_ledger_run_idx on zsxq_thread_ledger (last_run_id);
create index if not exists zsxq_ledger_stage_idx on zsxq_thread_ledger (group_id, stage_indexed);
