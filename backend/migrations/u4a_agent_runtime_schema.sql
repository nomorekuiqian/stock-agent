-- U4-A Agent Runtime Schema
-- Tables: agent_sessions, agent_session_events

CREATE TABLE IF NOT EXISTS agent_sessions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     TEXT NOT NULL,
  user_id        TEXT NOT NULL,
  agent_id       TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'active',
  title          TEXT,
  metadata       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, agent_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_sessions_user_recent
  ON agent_sessions(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_sessions_lookup
  ON agent_sessions(user_id, agent_id, session_id);

CREATE TABLE IF NOT EXISTS agent_session_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     TEXT NOT NULL,
  user_id        TEXT NOT NULL,
  agent_id       TEXT NOT NULL,
  event_type     TEXT NOT NULL,
  role           TEXT CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content        TEXT,
  payload        JSONB NOT NULL DEFAULT '{}'::jsonb,
  token_estimate INTEGER,
  turn_id        TEXT,
  client_event_id TEXT,
  client_ts      TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE agent_session_events
  ADD COLUMN IF NOT EXISTS turn_id TEXT;

ALTER TABLE agent_session_events
  ADD COLUMN IF NOT EXISTS client_event_id TEXT;

ALTER TABLE agent_session_events
  ADD COLUMN IF NOT EXISTS client_ts TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_agent_session_events_session_recent
  ON agent_session_events(user_id, agent_id, session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_session_events_type_recent
  ON agent_session_events(user_id, agent_id, event_type, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_session_events_client_event
  ON agent_session_events(user_id, agent_id, session_id, client_event_id)
  WHERE client_event_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_session_events_client_event_full
  ON agent_session_events(user_id, agent_id, session_id, client_event_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_session_events_turn_message
  ON agent_session_events(user_id, agent_id, session_id, turn_id, event_type, role)
  WHERE turn_id IS NOT NULL
    AND client_event_id IS NULL
    AND event_type IN ('user_message', 'assistant_message', 'context_snapshot', 'error');

CREATE INDEX IF NOT EXISTS idx_agent_session_events_cursor
  ON agent_session_events(user_id, agent_id, session_id, created_at ASC, id ASC);
