# AGENTS.md

Project instructions for AI coding agents (Codex, etc.) working with this repository.

## Critical Rules

- **No automatic Git operations**: Never auto-commit or auto-push. All git operations require explicit user confirmation.
- **Dead code zones**: `backend/app/services/` and `backend/app/models/` are pre-refactor dead code. Never import from these paths. Active code lives in `app/features/` and `app/shared/`.
- **Email broadcast safety**: When `ENVIRONMENT` is not `"production"`, all broadcasts auto-route to Resend test segment (`1c300c45-49a7-479e-a4c2-1ed5cfccda1e`). After calling broadcast API in dev, verify the returned `audience_id` is the test segment.
- **Logging**: Use `get_logger(__name__)`, never `print()`. Use `%s` lazy formatting, not f-strings.
- **Auth patterns**: User endpoints use `Depends(verify_user_token)`, cron jobs use `Depends(verify_cron_secret)`. Full auth flow in `docs/constraints/auth.md`.
- **Test account** (local debugging): Email `voya.technologies@gmail.com`, password `123456`.
- **Default AI model**: Always use `gemini-3.5-flash` in Google ADK agents.
- **No emoji in code**: Never write emoji characters in source code files.

## Language

- **Default response language**: Use Simplified Chinese by default for user-facing explanations and summaries.
- **English only when requested**: Switch to English only if the user explicitly asks for English.
- **Keep technical literals unchanged**: Code, commands, logs, error messages, API names, and identifiers should remain in original language when needed for accuracy.

### Documentation Maintenance

After completing tasks, update relevant docs based on change type:

| Change Type | Update Target | Trigger |
|-------------|---------------|---------|
| New/modified API endpoints | Corresponding `.context.md` | router.py changed |
| Auth changes | `docs/constraints/auth.md` | verify_user_token usage changed |
| DB table/Edge Function changes | Feature's `.context.md` | db.py or edge function changed |
| Frontend page logic changes | Page's `.context.md` | page.tsx data flow changed |
| New feature module | This file's module doc list | New `.context.md` created |

## Module Documentation

Each module has a `.context.md` file. **Read it before modifying code** to understand functionality, data flow, dependencies, and gotchas.

**Backend**:
- `backend/app/core/.context.md` -- Core infrastructure
- `backend/app/edge_functions/.context.md` -- Insforge Edge Functions
- `backend/app/frank_mcp/.context.md` -- Market Lens MCP server
- `backend/app/utils/.context.md` -- Backend time/date utilities
- `backend/app/shared/.context.md` -- Cross-module shared services
- `backend/app/shared/data_tools/.context.md` -- Data fetching tool layer
- `backend/app/shared/kol_persona/.context.md` -- KOL persona registry and tools
- `backend/app/features/admin/.context.md` -- Admin dashboard and CRM APIs
- `backend/app/features/agent_runtime/.context.md` -- Shared Agent runtime/session/context layer
- `backend/app/features/brew/.context.md` -- Personalized summary (Brew)
- `backend/app/features/daily_report/.context.md` -- Market daily report
- `backend/app/features/feedback/.context.md` -- User feedback
- `backend/app/features/flags/.context.md` -- Feature flags
- `backend/app/features/for_you/.context.md` -- For-You action bar aggregation
- `backend/app/features/holdings_sync/.context.md` -- Holdings statement sync
- `backend/app/features/invites/.context.md` -- Invite codes and trial access
- `backend/app/features/kol_research/.context.md` -- KOL persona research APIs
- `backend/app/features/morning_report/.context.md` -- Pre-market morning report
- `backend/app/features/macro/cache/.context.md` -- Macro data cache system
- `backend/app/features/macro/liquidity/.context.md` -- Liquidity monitoring
- `backend/app/features/macro/risk/.context.md` -- Macro risk assessment
- `backend/app/features/macro/weekly/.context.md` -- Macro weekly report
- `backend/app/features/memory/.context.md` -- User memory and feedback learning
- `backend/app/features/notification/.context.md` -- Email sending & broadcast
- `backend/app/features/onboarding/.context.md` -- User onboarding status
- `backend/app/features/payment/.context.md` -- Stripe payments
- `backend/app/features/portfolio/.context.md` -- Portfolio holdings/profile
- `backend/app/features/portfolio_health/.context.md` -- Portfolio health analysis
- `backend/app/features/quota/.context.md` -- Usage quota enforcement
- `backend/app/features/research_kb/.context.md` -- Research knowledge-base chat
- `backend/app/features/screener/.context.md` -- Stock Screener data layer
- `backend/app/features/stock/.context.md` -- Individual stock research
- `backend/app/features/stock/agent/.context.md` -- Stock AI analysis agents
- `backend/app/features/subscription/.context.md` -- Email subscription management
- `backend/app/features/twitter/.context.md` -- KOL tweet ingestion and methodology extraction
- `backend/app/features/twitter/methodologies/.context.md` -- KOL methodology distillation artifacts
- `backend/app/features/twitter/methodology_v3/.context.md` -- Persona methodology v3 offline scripts
- `backend/app/features/twitter_digest/.context.md` -- Twitter/KOL daily digest
- `backend/app/features/vector/.context.md` -- Generic vector indexing and retrieval
- `backend/app/features/webhooks/.context.md` -- Third-party webhook ingestion
- `backend/app/features/wechat/.context.md` -- WeChat Mini Program auth

**Frontend**:
- `frontend/src/app/.context.md` -- App Router shell, root layout, home page
- `frontend/src/app/admin/.context.md` -- Admin dashboard pages
- `frontend/src/app/api/auth/.context.md` -- Server Proxy auth routes
- `frontend/src/app/auth/.context.md` -- OAuth callback route
- `frontend/src/app/contact/.context.md` -- Contact/feedback form
- `frontend/src/app/dev/.context.md` -- Local development helper pages
- `frontend/src/app/email-test/.context.md` -- Email preview/test page
- `frontend/src/app/feedback/.context.md` -- Email feedback landing page
- `frontend/src/app/forgot-password/.context.md` -- Password reset request page
- `frontend/src/app/qinbafrank/.context.md` -- Qinbafrank legacy redirect
- `frontend/src/app/today/.context.md` -- Market daily report page
- `frontend/src/app/morning/.context.md` -- Pre-market morning report page
- `frontend/src/app/for-you/.context.md` -- Personalized Brew page
- `frontend/src/app/kol/.context.md` -- KOL persona pages
- `frontend/src/app/login/.context.md` -- Login/register page
- `frontend/src/app/macro/.context.md` -- Macro dashboard page
- `frontend/src/app/onboarding/.context.md` -- New-user onboarding page
- `frontend/src/app/pricing/.context.md` -- Pricing and checkout success pages
- `frontend/src/app/profile/.context.md` -- User profile and subscription settings
- `frontend/src/app/request-access/.context.md` -- Invite/access request page
- `frontend/src/app/research/.context.md` -- Research Desk page
- `frontend/src/app/reset-password/.context.md` -- Password reset completion page
- `frontend/src/app/settings/.context.md` -- User settings page
- `frontend/src/app/stock/.context.md` -- Stock research page
- `frontend/src/app/twitter-digest/.context.md` -- Twitter/KOL digest pages
- `frontend/src/app/unsubscribe/.context.md` -- Email unsubscribe page
- `frontend/src/app/verify-email/.context.md` -- Email verification page
- `frontend/src/app/webview-check/.context.md` -- WebView session diagnostics
- `frontend/src/lib/.context.md` -- Shared utilities (api/auth/insforge)
- `frontend/src/components/.context.md` -- Shared component library
- `frontend/src/contexts/.context.md` -- React Context (Auth/Subscription)
- `frontend/src/hooks/.context.md` -- Custom Hooks (search/React Query)
- `frontend/src/test/.context.md` -- Test system (Vitest + Playwright)

**Other docs**:
- `docs/constraints/reliability.md` -- Engineering reliability
- `docs/constraints/auth.md` -- Auth flow
- `docs/reference/pages.md` -- Frontend page routes
- `docs/reference/components.md` -- Frontend components & libraries
- `docs/constraints/design-system.md` -- Design system spec
- `mcp/themarketbrew/.context.md` -- Market Lens MCP installable package

## Engineering Plans

Design documents before feature development, stored in `docs/plans/`. Template at `docs/plans/_template.md`.

**File naming**: `docs/plans/active/{feature-name}.md`, English kebab-case.

**Lifecycle**: Create in `docs/plans/active/` -> Update progress during dev -> Distill knowledge into `.context.md` -> Move to `docs/plans/completed/`.

## Project Overview

Full-stack macro market analysis app using Google ADK AI Agents for market data fetching, news analysis, and investment report generation.

**Tech Stack:**
- Frontend: Next.js 16 + React 19 + TypeScript + Tailwind CSS 4
- Backend: FastAPI + Google ADK（默认 `gemini-3.5-flash`，部分结构化/低成本任务使用 `gemini-3.1-flash-lite(-preview)`）+ yfinance + FMP API + FRED API
- Payments: Stripe (subscription)
- Email: Resend API
- Database: Insforge (PostgreSQL)
- Brand: TheMarketBrew (#059669 emerald) / https://themarketbrew.com

## Development Commands

### Frontend (frontend/)
```bash
npm run dev          # http://localhost:3000
npm run build && npm run lint
npm test             # Vitest unit/component tests
npm run test:e2e     # Playwright E2E (requires backend running)
```

### Backend (backend/)
```bash
source venv/bin/activate
uvicorn app.main:app --reload   # http://localhost:8000

# Tests
pytest                              # Default tests (e2e + integration)
pytest tests/test_xxx.py -v         # Single test file
pytest tests/test_xxx.py::TestClass::test_method  # Single test
pytest -v --run-generate            # Include AI generation tests (slow)
```

### Code Quality (git hooks)
`git commit` triggers husky pre-commit -> lint-staged:
- Frontend: ESLint --fix + tsc --noEmit
- Backend: Python AST syntax check

## Workflow Skills

- `ready-to-ship`: Review current diff, fill obvious test gaps, run relevant verification, and summarize whether the change is safe to commit. It does **not** auto-commit, auto-push, auto-merge, or auto-deploy.
- Typical trigger phrases: `ready to ship`, `ship check`, `pre-commit check`

## Environment Variables

Backend `backend/.env` (full definitions in `backend/app/core/config.py`):
```
GOOGLE_API_KEY=xxx              # Required - Google ADK Agent
OPENAI_API_KEY=xxx              # OpenAI (backup)
OPENROUTER_API_KEY=xxx          # OpenRouter / embedding gateway
DEEPSEEK_API_KEY=xxx            # DeepSeek backup/experiments
FMP_API_KEY=xxx                 # Required - Treasury rates, news
FRED_API_KEY=xxx                # Liquidity indicators
TWITTER_API_KEY=xxx             # KOL tweet ingestion
STRIPE_SECRET_KEY=xxx           # Stripe payments
STRIPE_WEBHOOK_SECRET=xxx       # Stripe Webhook signature
STRIPE_PRO_PRICE_ID=xxx         # Pro subscription price ID
STRIPE_MAX_PRICE_ID=xxx         # Max subscription price ID
STRIPE_ULTRA_PRICE_ID=xxx       # Ultra subscription price ID (Max + Qinbafrank pack)
RESEND_API_KEY=xxx              # Resend email
RESEND_WEBHOOK_SECRET=xxx       # Resend webhook signature
RESEND_SEGMENT_MORNING=xxx      # Resend morning report segment
RESEND_SEGMENT_EVENING=xxx      # Resend daily/evening report segment
RESEND_SEGMENT_WEEKLY=xxx       # Resend weekly report segment
RESEND_SEGMENT_DAILY_FREE_CTA=xxx   # Free daily CTA segment
RESEND_SEGMENT_DAILY_PAID_CTA=xxx   # Paid daily CTA segment
RESEND_AUDIENCE_TWITTER_DIGEST=xxx  # Twitter digest audience
RESEND_SEGMENT_TWITTER_DIGEST=xxx   # Twitter digest segment
CRON_SECRET=xxx                 # Cron job auth
INSFORGE_ANON_KEY=xxx           # Insforge anon key
INSFORGE_SERVICE_KEY=xxx        # Insforge service/admin key
EDGE_FUNCTION_SECRET=xxx        # Internal edge function secret (defaults to CRON_SECRET)
ENVIRONMENT=production          # Required - affects broadcast safety routing
FRONTEND_URL=https://xxx        # Production CORS
INSFORGE_BASE_URL=https://xxx   # Insforge instance URL
CORS_ALLOWED_ORIGIN_REGEX=xxx   # Vercel preview CORS regex
POSTHOG_PROJECT_TOKEN=xxx       # PostHog analytics
POSTHOG_HOST=https://xxx        # PostHog host
WECHAT_APP_ID=xxx               # WeChat Mini Program app id
WECHAT_APP_SECRET=xxx           # WeChat Mini Program secret
WECHAT_JWT_SECRET=xxx           # WeChat JWT signing secret
INVITE_CODES=xxx                # Comma-separated invite codes
FRANK_LENS_DEV_INVITE_CODE=xxx  # Frank Lens dev invite code
ADMIN_EMAILS=xxx                # Comma-separated admin email whitelist
EMAIL_PRO_GATE=false            # Restrict broadcasts to Pro/Max when true
AGENT_RUNTIME_REQUEST_HISTORY=fallback
AGENT_RUNTIME_INMEMORY_MAX_SESSIONS=256
AGENT_RUNTIME_INMEMORY_MAX_TRANSCRIPT=64
AGENT_RUNTIME_PROMPT_CHAR_SOFT_LIMIT=60000
AGENT_RUNTIME_TOOL_CACHE_TTL=300
AGENT_RUNTIME_TOOL_CACHE_MAXSIZE=2048
AGENT_RUNTIME_MAX_GOOGLE_SEARCH_PER_TURN=1
AGENT_RUNTIME_MAX_KOL_TWEET_SEARCH_PER_TURN=3
AGENT_RUNTIME_RESEARCH_TIMEOUT_S=75
AGENT_RUNTIME_KOL_TIMEOUT_S=120
AGENT_RUNTIME_HISTORY_FETCH_LIMIT=200
AGENT_RUNTIME_TOOL_RESULT_MAX_CHARS=1024
AGENT_RUNTIME_BUDGET_INPUT_GUARD=6000
AGENT_RUNTIME_BUDGET_ACTIVE_MEMORY=1800
AGENT_RUNTIME_BUDGET_ATTACHED_WORKSPACE=6000
AGENT_RUNTIME_BUDGET_HISTORY=20000
AGENT_RUNTIME_BUDGET_CONTENT_CONTEXT=8000
AGENT_RUNTIME_BUDGET_INFERRED_MEMORY=800
VECTOR_EMBEDDING_MODEL=openai/text-embedding-3-small
RAG_EMBEDDING_MODEL=openai/text-embedding-3-small  # Legacy fallback for VECTOR_EMBEDDING_MODEL
```

`GOOGLE_GENAI_API_KEY` is auto-derived from `GOOGLE_API_KEY` when absent.

Frontend `frontend/.env.local`:
```
NEXT_PUBLIC_API_URL=http://localhost:8000/api
NEXT_PUBLIC_INSFORGE_URL=https://9wmhxyi4.us-east.insforge.app
NEXT_PUBLIC_INSFORGE_ANON_KEY=xxx
```

## Backend Architecture

Feature-modular architecture:

```
backend/app/
├── main.py              # FastAPI entry, registers all feature routers
├── core/                # Core infrastructure (config / database / logging / rate_limit)
├── features/            # Feature modules (active code)
│   ├── daily_report/    # Market daily report
│   ├── brew/            # Personalized summary
│   ├── stock/           # Individual stock research
│   ├── macro/           # Macro system (risk/ + liquidity/ + weekly/ + cache/)
│   ├── screener/        # Stock Screener (tvscreener full market screening)
│   ├── sector/          # Sector analysis
│   ├── subscription/    # Subscription management
│   ├── notification/    # Email sending & broadcast
│   ├── feedback/        # User feedback
│   └── payment/         # Stripe payments
├── shared/              # Cross-module shared (fmp / yfinance / openbb / insforge / data_tools/)
├── utils/               # Utilities (timezone)
├── edge_functions/      # Insforge Edge Functions (JavaScript)
├── services/            # [DEAD] DO NOT import
└── models/              # [DEAD] DO NOT import
```

### Feature Module Standard Structure

Each feature follows the same pattern:
- `router.py` - FastAPI route definitions
- `agent.py` - AI Agent wrapper (if applicable)
- `service.py` - Business logic (if applicable)
- `models.py` - Pydantic models
- `db.py` - Database operations (calls edge_functions)

### Data Flow

```
Python Data Fetching Layer (shared/data_tools)
         |
         | JSON data
         v
  Feature Agent (LLM analysis)
         |
         | Structured output (Pydantic)
         v
  Feature DB (save to Insforge)
```

### API Endpoints

All endpoints in `backend/app/features/*/router.py`, registered in `main.py`.
Run backend then visit http://localhost:8000/docs for OpenAPI docs.

Auth types: Bearer = User JWT (`verify_user_token`), Cron = Admin key (`verify_cron_secret`), unmarked = public.
Find auth endpoints: `grep -r "verify_user_token" backend/app/features/*/router.py`

## Frontend Architecture

```
frontend/src/
├── app/             # Next.js App Router (59 page.tsx files)
├── components/      # Shared component library
├── contexts/        # AuthContext + SubscriptionContext
├── hooks/           # useStockSearch + hooks/queries/ (TanStack Query)
└── lib/             # api.ts / auth.ts / insforge.ts / utils
```

- Route table: `docs/reference/pages.md`
- Auth flow: `docs/constraints/auth.md`
- Component list: `docs/reference/components.md`
- Design spec: `docs/constraints/design-system.md`

## Testing Architecture

### Backend (pytest)

```
backend/tests/
├── conftest.py                 # Test config, markers + DB write interception
├── test_*_unit.py              # Pure logic unit tests
├── e2e/test_*_e2e.py           # API endpoint E2E tests
└── integration/                # Database integration tests
```

Markers: `@pytest.mark.e2e`, `@pytest.mark.integration`, `@pytest.mark.generate` (skipped by default, needs `--run-generate`)

### Frontend (Vitest + Playwright)

Detailed docs: `frontend/src/test/.context.md`

- **Vitest**: Unit tests (`src/*/__tests__/`) + component tests
- **Playwright**: E2E page tests (`e2e/*.spec.ts`), requires backend running
- New tests in `__tests__/` subdirs, E2E in `e2e/`
- Mock patterns: `vi.mock('@/lib/api')` for API layer, `globalThis.fetch = vi.fn()` for network, `vi.mock('next/navigation')` for routing

## Agent Development

**Google ADK Agent standard pattern:**
```python
from google.adk.agents import LlmAgent
from google.adk.runners import InMemoryRunner

agent = LlmAgent(
    model="gemini-3.5-flash",
    name="analyst",
    instruction=ANALYST_INSTRUCTION,
    output_schema=MarketReportOutput,
)
runner = InMemoryRunner(agent=agent, app_name="market")
```

## Engineering Reliability

Global error handling, rate limiting (slowapi), health checks, structured logging. See `docs/constraints/reliability.md`.

## Design System

Financial Terminal + Editorial Luxury style. Primary `emerald-500`, accent `amber-400`. See `docs/constraints/design-system.md`.

## Known Gotchas & Production Lessons

Critical lessons from production incidents. **Read these before making changes to related areas.**

### Auth & Security

- **`verify_user_token` is the standard pattern**: In `core/deps.py`, use `Depends(verify_user_token)` on endpoints. Frontend sends Bearer token via `_authHeaders()`. Token cached 60s in memory.
- **Insforge is NOT Supabase**: API paths differ. Login: `POST /api/auth/sessions`. Verify: `GET /api/auth/sessions/current`. Refresh: `POST /api/auth/refresh` with Cookie + X-CSRF-Token + Authorization Bearer anonKey. Check SDK source (`node_modules/@insforge/sdk/dist/index.js`) for actual paths.
- **Refresh tokens come in Set-Cookie header, not response body**: Login response body only has `{ accessToken, user, csrfToken }`. Cross-origin fetch can't read Set-Cookie, so server proxy is required.
- **SDK `reloadAuth()` doesn't work with server proxy login**: Use `sdk.setUser()` instead to directly inject user state.
- **Token expiry check is mandatory**: `getAccessToken()` must check JWT `exp` field. "Having a session object" != "having a valid token".
- **Auth state recovery race condition**: `isRecovering` state must initialize as `true`, so `isLoading` stays true until cookie recovery completes. Otherwise auth guard incorrectly redirects for one frame.
- **Page refresh token persistence**: On refresh, SDK memory is cleared. Tokens from server-side cookies are injected into localStorage in `Providers.tsx` before SDK init, so `tokenManager.loadFromStorage()` finds the session.

### Data Flow

- **Three-layer chain**: Edge Function (JS) -> db.py (Python) -> router.py -> Frontend. Changes to any layer require checking upstream/downstream. Common mistake: edge function returns new fields but db.py drops them.
- **Distinguish "empty result" from "query failure"**: `data === null` (network/token failure) != "user has no data". Treating failures as empty data causes data loss (e.g., watchlist overwritten with `[]`).

### Broadcasting & Notifications

- **Never use URL matching to determine environment**: Use explicit `ENVIRONMENT` env var. URL strings (`www.` vs no `www.`) silently break matching.
- **Agent exceptions must not produce "fake success"**: If AI agent fails, return `None` / raise, never stuff error messages into content fields. Broadcast pipelines need independent content quality gates.
- **External service calls need retry**: Transient network failures are normal. Without retry on `get_user_watchlist()`, 17/22 users missed their daily report. Use 2 retries + 3s interval on critical paths.
- **Re-sends need idempotency**: Before re-sending, check delivery records to confirm the user hasn't already received the email.

### General

- **`.env.local` is a single point of failure**: Gitignored, can't recover via `git checkout`. After worktree ops or file cleanup, verify `.env*` files exist.
- **Use `logger.exception` not `logger.error`**: Only `exception` captures full traceback.
- **Production domain**: Brand domain is `themarketbrew.com` (frontend Vercel). Backend Railway: `stock-agent-production.up.railway.app`. No other domains should appear in code.

### Insforge Auth API Reference

- Login: `POST /api/auth/sessions` -> `{ accessToken, user, csrfToken }`
- Verify user: `GET /api/auth/sessions/current` + `Authorization: Bearer <token>` -> `{ user: { id, email } }`
- Refresh: `POST /api/auth/refresh` + Cookie `insforge_refresh_token` + `X-CSRF-Token` + `Authorization: Bearer <anonKey>`
- Logout: `POST /api/auth/logout`
- Profiles: `GET /api/auth/profiles/{userId}`, `PUT /api/auth/profiles/current`
- All requests need `apikey` header (anon key)

<!-- INSFORGE:START -->
## InsForge backend

This project uses [InsForge](https://insforge.dev): an all-in-one, open-source Postgres-based backend (BaaS) that gives this app a database, authentication, file storage, edge functions, realtime, an AI model gateway, and payments through one platform.

- **Project:** **TheMarketBrew Production** (API base `https://9wmhxyi4.us-east.insforge.app`)
- **Skills:** these InsForge skills are installed for supported coding agents. Reach for them before implementing any InsForge feature instead of guessing the API:
  - `insforge`: app code with the `@insforge/sdk` client (database CRUD, auth, storage, edge functions, realtime, AI, email, and Stripe payments).
  - `insforge-cli`: backend and infrastructure via the `insforge` CLI (projects, SQL, migrations, RLS policies, storage buckets, functions, secrets, payment setup, schedules, deploys).
  - `insforge-debug`: diagnosing failures (SDK/HTTP errors, RLS denials, auth and OAuth issues) and running security or performance audits.
  - `insforge-integrations`: wiring external auth providers (Clerk, Auth0, WorkOS, Better Auth, etc.) for JWT-based RLS, or the OKX x402 payment facilitator.
  - `find-skills`: discovering additional skills on demand.
- **Credentials:** app code reads keys from `.env.local`; the CLI reads `.insforge/project.json`. Never hardcode or commit keys.

Key patterns:

- Database inserts take an array: `insert([{ ... }])`.
- Reference users with `auth.users(id)`; use `auth.uid()` in RLS policies.
- For storage uploads, persist both the returned `url` and `key`.
<!-- INSFORGE:END -->
