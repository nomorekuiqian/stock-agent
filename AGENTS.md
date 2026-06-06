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
- `backend/app/features/agent_runtime/.context.md` -- Shared Agent runtime/session/context layer
- `backend/app/features/daily_report/.context.md` -- Market daily report
- `backend/app/features/morning_report/.context.md` -- Pre-market morning report
- `backend/app/features/brew/.context.md` -- Personalized summary (Brew)
- `backend/app/features/stock/.context.md` -- Individual stock research
- `backend/app/features/macro/liquidity/.context.md` -- Liquidity monitoring
- `backend/app/features/macro/weekly/.context.md` -- Macro weekly report
- `backend/app/features/macro/cache/.context.md` -- Macro data cache system
- `backend/app/features/macro/risk/.context.md` -- Macro risk assessment
- `backend/app/features/screener/.context.md` -- Stock Screener data layer
- `backend/app/features/sector/.context.md` -- Sector analysis
- `backend/app/features/subscription/.context.md` -- Email subscription management
- `backend/app/features/notification/.context.md` -- Email sending & broadcast
- `backend/app/features/feedback/.context.md` -- User feedback
- `backend/app/features/payment/.context.md` -- Stripe payments
- `backend/app/edge_functions/.context.md` -- Insforge Edge Functions
- `backend/app/shared/.context.md` -- Cross-module shared services
- `backend/app/shared/data_tools/.context.md` -- Data fetching tool layer

**Frontend**:
- `frontend/src/app/today/.context.md` -- Market daily report page
- `frontend/src/app/morning/.context.md` -- Pre-market morning report page
- `frontend/src/app/for-you/.context.md` -- Personalized Brew page
- `frontend/src/app/stock/.context.md` -- Stock research page
- `frontend/src/app/kol/.context.md` -- KOL persona pages
- `frontend/src/app/macro/.context.md` -- Macro dashboard page
- `frontend/src/app/sectors/.context.md` -- Sector analysis page
- `frontend/src/app/screener/.context.md` -- Stock screener page
- `frontend/src/app/api/auth/.context.md` -- Server Proxy auth routes
- `frontend/src/lib/.context.md` -- Shared utilities (api/auth/insforge)
- `frontend/src/components/.context.md` -- Shared component library
- `frontend/src/contexts/.context.md` -- React Context (Auth/Subscription)
- `frontend/src/hooks/.context.md` -- Custom Hooks (search/React Query)
- `frontend/src/test/.context.md` -- Test system (Vitest + Playwright)

**Other docs**:
- `docs/constraints/reliability.md` -- Engineering reliability
- `docs/constraints/auth.md` -- Auth flow
- `docs/references/pages.md` -- Frontend page routes
- `docs/references/components.md` -- Frontend components & libraries
- `docs/constraints/design-system.md` -- Design system spec
- `mcp/frank-lens/.context.md` -- Frank Lens MCP installable package

## Engineering Plans

Design documents before feature development, stored in `docs/plans/`. Template at `docs/plans/_template.md`.

**File naming**: `docs/plans/active/{feature-name}.md`, English kebab-case.

**Lifecycle**: Create in `docs/plans/active/` -> Update progress during dev -> Distill knowledge into `.context.md` -> Move to `docs/plans/completed/`.

## Project Overview

Full-stack macro market analysis app using Google ADK AI Agents for market data fetching, news analysis, and investment report generation.

**Tech Stack:**
- Frontend: Next.js 16 + React 19 + TypeScript + Tailwind CSS 4
- Backend: FastAPI + Google ADK (gemini-3.1-flash-lite-preview) + yfinance + FMP API + FRED API
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
FMP_API_KEY=xxx                 # Required - Treasury rates, news
FRED_API_KEY=xxx                # Liquidity indicators
STRIPE_SECRET_KEY=xxx           # Stripe payments
STRIPE_WEBHOOK_SECRET=xxx       # Stripe Webhook signature
STRIPE_PRO_PRICE_ID=xxx         # Pro subscription price ID
RESEND_API_KEY=xxx              # Resend email
CRON_SECRET=xxx                 # Cron job auth
INSFORGE_ANON_KEY=xxx           # Insforge anon key
ENVIRONMENT=production          # Required - affects broadcast safety routing
FRONTEND_URL=https://xxx        # Production CORS
INSFORGE_BASE_URL=https://xxx   # Insforge instance URL
```

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
├── app/             # Next.js App Router (31 page.tsx files)
├── components/      # Shared component library
├── contexts/        # AuthContext + SubscriptionContext
├── hooks/           # useStockSearch + hooks/queries/ (TanStack Query)
└── lib/             # api.ts / auth.ts / insforge.ts / utils
```

- Route table: `docs/references/pages.md`
- Auth flow: `docs/constraints/auth.md`
- Component list: `docs/references/components.md`
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
    model="gemini-3.1-flash-lite-preview",
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
