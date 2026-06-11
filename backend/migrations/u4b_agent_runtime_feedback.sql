-- U4-B Agent Runtime Feedback
-- Store per-answer thumbs feedback on the assistant_message event row.

ALTER TABLE agent_session_events
  ADD COLUMN IF NOT EXISTS feedback_sentiment SMALLINT;

ALTER TABLE agent_session_events
  ADD COLUMN IF NOT EXISTS feedback_reason TEXT;

ALTER TABLE agent_session_events
  ADD COLUMN IF NOT EXISTS feedback_at TIMESTAMPTZ;

ALTER TABLE agent_session_events
  ADD COLUMN IF NOT EXISTS feedback_payload JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_agent_session_events_feedback_recent
  ON agent_session_events(user_id, agent_id, feedback_at DESC)
  WHERE event_type = 'assistant_message'
    AND feedback_sentiment IS NOT NULL;
