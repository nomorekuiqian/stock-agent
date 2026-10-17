## Engineering Plans

Use an engineering plan for substantial features with unresolved requirements or architecture, or when requested. Store it in `docs/plans/`; ordinary fixes do not need a plan lifecycle. Template: `docs/plans/_template.md`.

**File naming**: `docs/plans/active/{feature-name}.md`, English kebab-case.

**Lifecycle**: Create in `docs/plans/active/` -> Update progress during dev -> Distill knowledge into `.context.md` -> Move to `docs/plans/completed/`.

## Project Overview

Full-stack macro market analysis app using Google ADK AI Agents for market data fetching, news analysis, and investment report generation.

**Tech Stack:**
- Frontend: Next.js 16 + React 19 + TypeScript + Tailwind CSS 4
- Backend: FastAPI + Google ADK（默认 `gemini-3.8-flash`；主生成模型由 `app.core.ai_models.GENERATIVE_MODEL` 管理；KOL 推文分类由同模块 `CLASSIFICATION_MODEL` 管理，使用 `gemini-3.5-flash-lite` + minimal thinking）+ yfinance + FMP API + FRED API
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
DEEPSEEK_BASE_URL=xxx           # DeepSeek/OpenAI-compatible base URL override
FMP_API_KEY=xxx                 # Required - Treasury rates, news
FRED_API_KEY=xxx                # Liquidity indicators
TAVILY_API_KEY=xxx              # Watchlist monitor news enrichment
TWITTER_API_KEY=xxx             # KOL tweet ingestion
STRIPE_SECRET_KEY=xxx           # Stripe payments
STRIPE_LEGACY_SECRET_KEY=xxx    # Legacy Stripe account key for migration fallback
STRIPE_MIGRATION_SOURCE_SECRET_KEY=xxx       # Explicit source Stripe account key
STRIPE_MIGRATION_DESTINATION_SECRET_KEY=xxx  # Explicit destination Stripe account key
STRIPE_WEBHOOK_SECRET=xxx       # Stripe Webhook signature
STRIPE_PRO_PRICE_ID=xxx         # Pro subscription price ID
STRIPE_MAX_PRICE_ID=xxx         # Max subscription price ID
STRIPE_MIGRATION_DESTINATION_MAX_PRICE_ID=xxx  # Destination-account Max price override
STRIPE_MIGRATION_DESTINATION_PRO_PRICE_ID=xxx  # Destination-account Pro price override
STRIPE_ULTRA_PRICE_ID=xxx       # Ultra subscription price ID (Max + Qinbafrank pack)
STRIPE_CREATOR_MAX_QINBAFRANK_PRICE_ID=xxx  # Legacy fallback alias for STRIPE_ULTRA_PRICE_ID
OKX_API_KEY=xxx                 # OKX Onchain OS Web3 API key for app.okx_main x402 middleware
OKX_SECRET_KEY=xxx              # OKX Onchain OS Web3 API secret for app.okx_main
OKX_PASSPHRASE=xxx              # OKX Onchain OS Web3 API passphrase for app.okx_main
OKX_BASE_URL=https://web3.okx.com
OKX_MCP_PAYMENT_ENABLED=false   # Enable OKX x402 middleware only for isolated OKX service
OKX_MCP_PAYMENT_MODE=sdk        # sdk or external proxy
OKX_MCP_NETWORK=eip155:196
OKX_MCP_PAY_TO_ADDRESS=0x...
OKX_MCP_PERSONA_CONTEXT_PRICE=$0.05
OKX_MCP_MARKET_DATA_PRICE=$0.03
OKX_MCP_MAX_TIMEOUT_SECONDS=300
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
WATCHLIST_MONITOR_GENERATION_CONCURRENCY=3  # Parallel ticker generation cap
# WATCHLIST_MONITOR_LLM_MODEL 已退休；统一使用 app.core.ai_models.GENERATIVE_MODEL
WATCHLIST_MONITOR_LLM_MAX_TOKENS=2400
WATCHLIST_MONITOR_LLM_RETRIES=2
WATCHLIST_MONITOR_LLM_TEMPERATURE=0.2
# WATCHLIST_MONITOR_MODEL_VERSION 固定为 watchlist-monitor-v2-gemini-3.8-flash
WATCHLIST_MONITOR_TAVILY_ENABLED=true
WATCHLIST_MONITOR_TAVILY_RESULTS_PER_QUERY=8
WATCHLIST_MONITOR_TAVILY_TIMEOUT_S=8.0
WATCHLIST_MONITOR_TAVILY_TOPIC=general
WATCHLIST_MONITOR_TAVILY_INCLUDE_DOMAINS=xxx  # Optional comma-separated allowlist
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
│   ├── for_you/         # For-You aggregation and action bar
│   ├── stock/           # Individual stock research
│   ├── macro/           # Macro system (risk/ + liquidity/ + weekly/ + cache/)
│   ├── screener/        # Stock Screener (tvscreener full market screening)
│   ├── twitter_digest/  # Twitter/KOL daily digest
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
├── app/             # Next.js App Router pages and route handlers
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
    model="gemini-3.8-flash",
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


## Local debug fixture

For local debugging only, the existing test account is `voya.technologies@gmail.com` / `123456`. This is not authorization to access production or create external side effects.
