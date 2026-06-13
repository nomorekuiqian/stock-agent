-- TheMarketBrew MCP account authorization and usage metering.
--
-- Edge Function: backend/app/edge_functions/mcp-auth.js

CREATE TABLE IF NOT EXISTS mcp_device_authorizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_code_hash TEXT NOT NULL UNIQUE,
  user_code_hash TEXT NOT NULL UNIQUE,
  client_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  authorized_at TIMESTAMPTZ,
  authorized_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  denied_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  poll_interval_s INTEGER NOT NULL DEFAULT 2
);

CREATE INDEX IF NOT EXISTS idx_mcp_device_authorizations_user_code_hash
  ON mcp_device_authorizations(user_code_hash);

CREATE INDEX IF NOT EXISTS idx_mcp_device_authorizations_device_code_hash
  ON mcp_device_authorizations(device_code_hash);

CREATE INDEX IF NOT EXISTS idx_mcp_device_authorizations_expires_at
  ON mcp_device_authorizations(expires_at);

CREATE TABLE IF NOT EXISTS mcp_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scopes JSONB NOT NULL DEFAULT '["mcp:persona", "mcp:data"]'::jsonb,
  client_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  usage_counters JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_mcp_tokens_user_id
  ON mcp_tokens(user_id);

CREATE INDEX IF NOT EXISTS idx_mcp_tokens_token_hash
  ON mcp_tokens(token_hash);

CREATE INDEX IF NOT EXISTS idx_mcp_tokens_active
  ON mcp_tokens(user_id, expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS mcp_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_id UUID REFERENCES mcp_tokens(id) ON DELETE SET NULL,
  tool TEXT NOT NULL,
  endpoint TEXT,
  symbols JSONB NOT NULL DEFAULT '[]'::jsonb,
  sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  latency_ms INTEGER,
  success BOOLEAN NOT NULL DEFAULT true,
  error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mcp_usage_events_user_created
  ON mcp_usage_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mcp_usage_events_tool_created
  ON mcp_usage_events(tool, created_at DESC);
