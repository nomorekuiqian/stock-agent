-- Generic vector store schema for Insforge/Postgres pgvector.
-- Apply this in the Insforge SQL editor before deploying vector-store.js.

create extension if not exists vector;

create table if not exists vector_documents (
  id uuid primary key default gen_random_uuid(),
  source_type text not null,
  source_id text not null,
  title text,
  url text,
  symbol text,
  report_date date,
  visibility text not null default 'public',
  user_id text,
  metadata jsonb not null default '{}'::jsonb,
  content_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_type, source_id, content_hash)
);

create table if not exists vector_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references vector_documents(id) on delete cascade,
  source_type text not null,
  source_id text not null,
  chunk_index int not null,
  content text not null,
  content_hash text not null,
  token_count int,
  title text,
  url text,
  symbol text,
  report_date date,
  visibility text not null default 'public',
  user_id text,
  metadata jsonb not null default '{}'::jsonb,
  embedding vector(1536),
  embedding_model text not null,
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index)
);

create index if not exists vector_documents_source_idx
  on vector_documents (source_type, source_id);

create index if not exists vector_chunks_source_idx
  on vector_chunks (source_type, source_id);

create index if not exists vector_chunks_symbol_idx
  on vector_chunks (symbol);

create index if not exists vector_chunks_report_date_idx
  on vector_chunks (report_date);

create index if not exists vector_chunks_visibility_user_idx
  on vector_chunks (visibility, user_id);

create index if not exists vector_chunks_metadata_gin_idx
  on vector_chunks using gin (metadata);

-- HNSW is preferred for larger stores.
create index if not exists vector_chunks_embedding_hnsw_idx
  on vector_chunks using hnsw (embedding vector_cosine_ops);

create or replace function match_vector_chunks(
  query_embedding vector(1536),
  match_count int default 8,
  match_threshold float default 0.7,
  filters jsonb default '{}'::jsonb
)
returns table (
  id uuid,
  document_id uuid,
  source_type text,
  source_id text,
  chunk_index int,
  content text,
  title text,
  url text,
  symbol text,
  report_date text,
  visibility text,
  user_id text,
  metadata jsonb,
  similarity float
)
language sql stable
as $$
  select
    c.id,
    c.document_id,
    c.source_type,
    c.source_id,
    c.chunk_index,
    c.content,
    c.title,
    c.url,
    c.symbol,
    c.report_date::text,
    c.visibility,
    c.user_id,
    c.metadata,
    1 - (c.embedding <=> query_embedding) as similarity
  from vector_chunks c
  where c.embedding is not null
    and 1 - (c.embedding <=> query_embedding) >= match_threshold
    and (
      not (filters ? 'source_types')
      or c.source_type in (
        select jsonb_array_elements_text(filters->'source_types')
      )
    )
    and (
      not (filters ? 'symbol')
      or c.symbol = filters->>'symbol'
    )
    and (
      not (filters ? 'visibility')
      or c.visibility = filters->>'visibility'
    )
    and (
      not (filters ? 'user_id')
      or c.user_id = filters->>'user_id'
    )
    and (
      not (filters ? 'date_from')
      or c.report_date >= (filters->>'date_from')::date
    )
    and (
      not (filters ? 'date_to')
      or c.report_date <= (filters->>'date_to')::date
    )
    and (
      not (filters ? 'metadata')
      or c.metadata @> (filters->'metadata')
    )
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

create or replace function search_vector_chunks_text(
  keywords text[],
  match_count int default 8,
  filters jsonb default '{}'::jsonb
)
returns table (
  id uuid,
  document_id uuid,
  source_type text,
  source_id text,
  chunk_index int,
  content text,
  title text,
  url text,
  symbol text,
  report_date text,
  visibility text,
  user_id text,
  metadata jsonb,
  similarity float
)
language sql stable
as $$
  with clean_keywords as (
    select trim(kw) as kw
    from unnest(keywords) as kw
    where trim(kw) <> ''
  ),
  matched as (
    select distinct on (c.id)
      c.*,
      case
        when c.title ilike '%' || ck.kw || '%' then 1.0
        when c.content ilike '%' || ck.kw || '%' then 0.95
        when c.metadata::text ilike '%' || ck.kw || '%' then 0.9
        else 0.0
      end as text_score,
      length(ck.kw) as keyword_length,
      case
        when (c.metadata->>'created_at') ~ '^\d{4}-\d{2}-\d{2}'
          then (c.metadata->>'created_at')::timestamptz
        else null
      end as source_created_at
    from vector_chunks c
    join clean_keywords ck
      on c.title ilike '%' || ck.kw || '%'
      or c.content ilike '%' || ck.kw || '%'
      or c.metadata::text ilike '%' || ck.kw || '%'
    where (
        not (filters ? 'source_types')
        or c.source_type in (
          select jsonb_array_elements_text(filters->'source_types')
        )
      )
      and (
        not (filters ? 'symbol')
        or c.symbol = filters->>'symbol'
      )
      and (
        not (filters ? 'visibility')
        or c.visibility = filters->>'visibility'
      )
      and (
        not (filters ? 'user_id')
        or c.user_id = filters->>'user_id'
      )
      and (
        not (filters ? 'date_from')
        or c.report_date >= (filters->>'date_from')::date
      )
      and (
        not (filters ? 'date_to')
        or c.report_date <= (filters->>'date_to')::date
      )
      and (
        not (filters ? 'metadata')
        or c.metadata @> (filters->'metadata')
      )
    order by
      c.id,
      case
        when c.title ilike '%' || ck.kw || '%' then 1.0
        when c.content ilike '%' || ck.kw || '%' then 0.95
        when c.metadata::text ilike '%' || ck.kw || '%' then 0.9
        else 0.0
      end desc,
      length(ck.kw) desc
  )
  select
    m.id,
    m.document_id,
    m.source_type,
    m.source_id,
    m.chunk_index,
    m.content,
    m.title,
    m.url,
    m.symbol,
    m.report_date::text,
    m.visibility,
    m.user_id,
    m.metadata,
    m.text_score::float as similarity
  from matched m
  order by
    m.text_score desc,
    m.source_created_at desc nulls last,
    m.report_date desc nulls last,
    m.created_at desc,
    m.keyword_length desc
  limit match_count;
$$;
