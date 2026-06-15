---
name: kol-methodology-distillation
description: Project workflow for Stock Agent KOL methodology distillation and chat. Use when working on qinbafrank or other KOL tweet distillation, methodology YAML extraction, evidence validation, KOL chat behavior, live market context injection, KOL conversation persistence, Twitter digest enrichment, or related backend/frontend/docs changes in this repository.
---

# KOL Methodology Distillation

Use this skill to preserve the project-specific way this repo turns KOL tweets into reusable methodology artifacts and a chat product.

## Operating Principles

- Treat distillation as extracting "how the analyst thinks", not summarizing "what the analyst said".
- Never impersonate the KOL. Answers should say they are based on the distilled methodology / public tweet evidence.
- Preserve attribution. Methodology artifacts and chat responses must cite tweet evidence with `tweet_id` and a source quote when possible.
- Separate layers:
  - Historical KOL corpus and methodology: `backend/app/features/twitter/`
  - Daily KOL digest product: `backend/app/features/twitter_digest/`
  - Live market context for chat: `backend/app/features/twitter/live_context.py`
  - Persisted chat history: `kol_methodology_conversations`
- Follow repo rules from `AGENTS.md`: active backend code is under `backend/app/features/` and `backend/app/shared/`; do not import from dead `backend/app/services/` or `backend/app/models/`.

## First Reads

Read these before editing:

1. `backend/app/features/twitter/.context.md`
2. `backend/app/features/twitter_digest/.context.md` if touching digest/enrichment.
3. `frontend/src/app/kol-chat/page.tsx` and `frontend/src/lib/api.ts` if touching chat UI/API calls.
4. `references/project-map.md` in this skill for paths, endpoints, data tables, and validation commands.

For design intent, read `backend/app/features/twitter/methodologies/.context.md`
and `docs/reference/twitter-kol-source-research.md`.

## Task Workflow

### 1. Classify The Request

Use this decision tree:

- User asks to extract/update qinbafrank methodology: work in `methodology_models.py`, `methodology_prompts.py`, `methodology_extractor.py`, `router.py`, and `methodologies/<username>/`.
- User asks to improve KOL chat answers: work in `methodology_chat.py`, `live_context.py`, `/api/twitter/methodology-chat/stream`, `frontend/src/app/kol-chat/page.tsx`, and `frontend/src/lib/api.ts`.
- User asks to persist or reload chat history: work in `conversation_db.py`, `kol-methodology-conversations` edge function, and `kol-chat/page.tsx`.
- User asks about KOL digest generation or tweet enrichment: work in `backend/app/features/twitter_digest/`, `backend/app/edge_functions/kol-tweets.js`, and frontend `twitter-digest` components.
- User asks for production DB/Insforge changes: read the `insforge-cli` skill and create/deploy Edge Function/table changes deliberately.

### 2. Preserve The Data Contract

For methodology chat:

- Request body uses `username`, `message`, optional `category`, and bounded `history`.
- `category=null` is routed by `choose_methodology_category()`.
- Streaming endpoint emits SSE events: `status`, `live_context`, `final`, `error`.
- Frontend stop button aborts the stream with `AbortController`.
- Reload loads latest persisted conversation, but the current UI intentionally displays only the newest 3 user turns while preserving the full saved history when updating.

For methodology YAML:

- YAML lives in `backend/app/features/twitter/methodologies/<username>/<category>.yaml`.
- Evidence quotes must be short source-text quotes, not paraphrases.
- Extraction logs should keep prompt, raw JSON, review report, and holdout samples under `extraction_log/`.

### 3. Keep Live Context Bounded

Live context is a supplement, not the source of truth:

- Prefer FMP first for quotes, recent stock news, earnings calendar, and economic calendar.
- Include latest daily/morning report cache when useful.
- Keep prompt payload small: symbols, a few quotes/news/events, sources, limitations, and timestamp.
- If data is missing, return limitations instead of inventing current market facts.

### 4. Update Documentation

After code changes, update the closest `.context.md`:

- `backend/app/features/twitter/.context.md` for methodology/chat/live-context/history changes.
- `backend/app/features/twitter_digest/.context.md` for digest/enrichment changes.
- `frontend/src/lib/.context.md` for shared API client changes.
- `frontend/src/app/kol-chat/.context.md` if that file exists; otherwise update twitter context.

## Validation

Run the narrowest checks that match the change:

```bash
cd backend
source venv/bin/activate
python -m py_compile app/features/twitter/router.py app/features/twitter/methodology_chat.py app/features/twitter/live_context.py
pytest tests/test_twitter_live_context_unit.py -q
```

For frontend KOL chat changes:

```bash
cd frontend
npx eslint src/app/kol-chat/page.tsx src/lib/api.ts
npm run build
```

For digest/enrichment changes:

```bash
cd backend
source venv/bin/activate
python -m py_compile app/features/twitter_digest/*.py app/features/twitter/*.py
pytest tests/test_twitter_digest_enrichment.py -q
```

If testing local UI, use:

- Frontend: `http://localhost:3000/kol-chat`
- Backend health: `http://localhost:8000/health`
- API base: `http://localhost:8000/api`

Remember that `/api/health` is not a valid health path in this app.
