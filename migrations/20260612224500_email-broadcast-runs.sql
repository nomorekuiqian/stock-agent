CREATE TABLE IF NOT EXISTS public.email_broadcast_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_key TEXT NOT NULL UNIQUE,
  channel TEXT NOT NULL,
  broadcast_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  lock_token TEXT NOT NULL,
  broadcast_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_broadcast_runs_channel_date
  ON public.email_broadcast_runs(channel, broadcast_date);
