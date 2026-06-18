-- Add per-tweet media metadata captured from TwitterAPI.io.
-- Files themselves should live in object storage if downloaded; this column
-- only stores stable metadata and source/storage URLs.

ALTER TABLE public.kol_tweets
ADD COLUMN IF NOT EXISTS media JSONB NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS content_parts JSONB NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS canonical_text TEXT,
ADD COLUMN IF NOT EXISTS canonical_status TEXT NOT NULL DEFAULT 'raw_only',
ADD COLUMN IF NOT EXISTS canonical_hash TEXT,
ADD COLUMN IF NOT EXISTS canonical_extracted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS canonical_extracted_model TEXT;
