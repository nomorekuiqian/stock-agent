CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS kol_methodology_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  message_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kol_methodology_conversations_user_username_updated
  ON kol_methodology_conversations (user_id, username, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_kol_methodology_conversations_username_updated
  ON kol_methodology_conversations (username, updated_at DESC);
