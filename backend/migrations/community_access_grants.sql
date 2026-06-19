-- Community access grants for partner-scoped Agents.
-- MVP use case: Panda Agent access granted by email from a knowledge-planet signup thread.

CREATE TABLE IF NOT EXISTS community_access_grants (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id         TEXT NOT NULL,
  email              TEXT NOT NULL,
  email_normalized   TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'revoked')),
  grant_source       TEXT,
  granted_by         TEXT,
  granted_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at         TIMESTAMPTZ,
  revoked_by         TEXT,
  user_id            TEXT,
  first_seen_user_id TEXT,
  last_seen_at       TIMESTAMPTZ,
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (partner_id, email_normalized)
);

CREATE INDEX IF NOT EXISTS idx_community_access_grants_partner_status
  ON community_access_grants (partner_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_community_access_grants_email
  ON community_access_grants (email_normalized);

