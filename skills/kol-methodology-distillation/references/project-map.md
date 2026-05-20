# KOL Methodology Project Map

## Core Backend Paths

Twitter/KOL methodology:

- `backend/app/features/twitter/router.py` — endpoints for tweet ops, extraction, methodology chat, streaming chat, conversation CRUD.
- `backend/app/features/twitter/methodology_models.py` — structured schema for category methodology extraction.
- `backend/app/features/twitter/methodology_prompts.py` — extraction prompt.
- `backend/app/features/twitter/methodology_extractor.py` — reads categorized tweets, calls Gemini, validates evidence, writes artifacts.
- `backend/app/features/twitter/methodology_chat.py` — loads methodology YAML and answers user questions with citations.
- `backend/app/features/twitter/live_context.py` — detects topic/tickers and fetches current context from FMP/report caches.
- `backend/app/features/twitter/conversation_db.py` — persists KOL methodology chat history through Insforge.
- `backend/app/features/twitter/methodologies/qinbafrank/` — current qinbafrank YAML and extraction logs.
- `backend/app/edge_functions/kol-methodology-conversations.js` — Insforge Edge Function for chat history.

Twitter digest/enrichment:

- `backend/app/features/twitter_digest/enrichment.py`
- `backend/app/features/twitter_digest/enrichment_prompts.py`
- `backend/app/features/twitter_digest/service.py`
- `backend/app/features/twitter_digest/router.py`
- `backend/app/features/twitter_digest/models.py`
- `backend/app/edge_functions/kol-tweets.js`

Shared catalog:

- `backend/app/shared/twitter_kol_config.py` — KOL directory.

## Frontend Paths

- `frontend/src/app/kol-chat/page.tsx` — qinbafrank chat UI, stop button, streaming progress, reload history.
- `frontend/src/lib/api.ts` — `api.twitterMethodology` methods and SSE parser.
- `frontend/src/components/Navbar.tsx` and `frontend/src/components/MobileMenu.tsx` — KOL chat navigation.
- `frontend/src/app/twitter-digest/` — digest page and components.

## Important Endpoints

Methodology extraction:

- `POST /api/twitter/extract-methodology` — cron-secret protected.

Methodology chat:

- `POST /api/twitter/methodology-chat` — user token.
- `POST /api/twitter/methodology-chat/stream` — user token, SSE.
- `GET /api/twitter/methodology-conversations/latest?username=qinbafrank` — user token.
- `POST /api/twitter/methodology-conversations` — user token.
- `GET/PUT /api/twitter/methodology-conversations/{id}` — user token.

KOL tweet/digest:

- `POST /api/twitter/fetch-configured-kols` — cron-secret protected.
- `GET /api/twitter/kol-accounts` — user token.
- `GET /api/twitter/tweets` — user token.
- `POST /api/twitter-digest/enrich`
- `POST /api/twitter-digest/enrich-backfill?username=&limit=`
- `GET /api/twitter-digest/latest`

## Data Tables

`kol_tweets`:

- Primary tweet corpus.
- Important fields: `id`, `author_username`, `text`, `tweet_type`, `conversation_id`, `quoted_tweet_text`, `created_at`, `url`, `category`, `symbols`.
- `category` is a top-level text column used by methodology extraction.
- `symbols` is JSONB for enrichment payload (`quality`, `quality_features`, `content_summary_zh`, `tickers`, `sectors`, `events`, timestamps/model).

`kol_methodology_conversations`:

- Stores KOL chat history.
- Important fields: `id`, `user_id`, `username`, `title`, `message_count`, `data`, `created_at`, `updated_at`.
- `data` shape: `{ username, category, messages }`.

`kol_daily_digests`:

- Stores generated Twitter/KOL digest output.

## qinbafrank Current L1 Methodology Package

Generated categories:

- `stock_analysis.yaml`
- `macro_analysis.yaml`
- `sector_analysis.yaml`
- `methodology.yaml`
- `trading_strategy.yaml`

Known weak category:

- `risk_management` has too few source tweets for a strong standalone methodology.

## Product Decisions To Preserve

- MVP includes L1 methodology YAML, historical-view RAG later, live data lens, and source list.
- MVP excludes prediction tracking, entity dictionary, stance profile, and explicit style corpus until needed.
- Chat must cite methodology evidence and surface live data limitations.
- Live/current environment should come from FMP first; Finnhub/web/ChromaDB are future supplements.
- Chat history reload displays newest 3 user turns, but persistence keeps full conversation history.

## Common Failure Modes

- Backend appears to listen on `8000` but app import failed. Check `/private/tmp/backend.log` and `http://localhost:8000/health`.
- `http://localhost:8000/api/health` returns 404; use `/health`.
- Auth-protected endpoints return 401 without a bearer token; that means route and port are correct.
- After rebase, ordinary `git pull` against an old feature branch upstream can replay old commits and create many conflicts. Prefer explicit `git rebase origin/master` or force-with-lease push after history rewrite.
