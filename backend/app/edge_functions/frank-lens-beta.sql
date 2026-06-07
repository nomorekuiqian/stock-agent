-- Market Lens MCP beta access tables for the Frank persona.

CREATE TABLE IF NOT EXISTS frank_lens_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash TEXT UNIQUE NOT NULL,
  label TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  max_uses INTEGER,
  use_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_frank_lens_invites_code_hash
  ON frank_lens_invites (code_hash);

-- Older beta drafts allowed plaintext invite codes. Keep the deployed table
-- hash-only so public anon/database access cannot reveal usable invite codes.
ALTER TABLE frank_lens_invites
  DROP COLUMN IF EXISTS code;

ALTER TABLE frank_lens_invites
  ALTER COLUMN code_hash SET NOT NULL;

CREATE TABLE IF NOT EXISTS frank_lens_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_id UUID REFERENCES frank_lens_invites(id) ON DELETE SET NULL,
  persona_username TEXT NOT NULL DEFAULT 'qinbafrank',
  tool_name TEXT,
  workflow TEXT,
  ticker TEXT,
  tickers JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'unknown',
  latency_ms INTEGER,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_frank_lens_usage_invite_created
  ON frank_lens_usage (invite_id, created_at DESC);
