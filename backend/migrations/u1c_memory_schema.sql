-- U1-C Memory/Feedback Schema
-- Tables: ai_feedback, suggestion_tracking

CREATE TABLE IF NOT EXISTS ai_feedback (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT NOT NULL,
  target_type   TEXT NOT NULL,
  target_id     TEXT NOT NULL,
  sentiment     SMALLINT NOT NULL,
  reason        TEXT,
  snapshot      JSONB,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_user_recent ON ai_feedback(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_user_type ON ai_feedback(user_id, target_type, created_at DESC);

CREATE TABLE IF NOT EXISTS suggestion_tracking (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          TEXT NOT NULL,
  source           TEXT NOT NULL,
  source_ref_id    TEXT,
  suggestion_text  TEXT NOT NULL,
  suggestion_date  DATE NOT NULL DEFAULT current_date,
  symbols          TEXT[] DEFAULT '{}',
  sectors          TEXT[] DEFAULT '{}',
  follow_up_at     DATE NOT NULL,
  outcome          JSONB,
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tracking_followup ON suggestion_tracking(follow_up_at) WHERE outcome IS NULL;
CREATE INDEX IF NOT EXISTS idx_tracking_user ON suggestion_tracking(user_id, suggestion_date DESC);
