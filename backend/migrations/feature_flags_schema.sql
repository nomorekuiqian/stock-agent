-- Feature flags: per-user gradual rollout
-- Run via Insforge Dashboard → SQL Editor

CREATE TABLE IF NOT EXISTS feature_flags (
  user_id    TEXT        NOT NULL,
  flag       TEXT        NOT NULL,
  enabled    BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, flag)
);

CREATE INDEX IF NOT EXISTS idx_feature_flags_flag
  ON feature_flags (flag);
