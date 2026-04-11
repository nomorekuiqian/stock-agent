# Engineering Reliability Guide

This document describes the reliability mechanisms built into the application. It is written for both human developers and AI assistants who need to debug issues, extend these systems, or understand why certain behaviors exist.

## Overview

These mechanisms do NOT increase raw throughput or concurrency. They solve a different problem: **when something goes wrong under load, you can see it, diagnose it, and the user experience degrades gracefully instead of catastrophically.**

Without these mechanisms:
- An unhandled exception leaks Python stack traces to users
- One user spamming AI endpoints burns through Gemini API quota for everyone
- You have no idea what happened because 685 `print()` calls are mixed in unstructured stdout
- A single JS error on the frontend causes a white screen with no recovery
- The service goes down and nobody knows until users complain

## Backend: Error Handling

### Global Exception Handlers

**File**: `backend/app/main.py` (lines 48-68)

Two FastAPI exception handlers catch everything that individual route handlers miss:

```python
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    # Logs full traceback server-side, returns generic error to client
    return JSONResponse(status_code=500, content={"error": "Internal server error"})

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    # Pydantic validation failures - returns 422 with structured error details
    return JSONResponse(status_code=422, content={"error": "Validation error", "details": exc.errors()})
```

**Why this matters**: Without these, FastAPI's default handler returns the full Python exception and stack trace in the response body. In production, this leaks internal file paths, variable names, and potentially sensitive data.

**How to debug**:
- Client gets `500 {"error": "Internal server error"}` -> check server logs for the full traceback (search for `Unhandled exception:` at ERROR level)
- Client gets `422` -> the `details` field contains Pydantic validation errors showing exactly which fields failed and why

**Extending**: If you add a new custom exception type that should return a specific status code (e.g., 404 for "report not found"), add a new `@app.exception_handler(YourException)` in `main.py`.

### Health Check Endpoints

**File**: `backend/app/main.py` (lines 133-159)

Two endpoints for monitoring:

| Endpoint | Purpose | Returns |
|----------|---------|---------|
| `GET /health` | Liveness probe - is the process alive? | `{"status": "ok", "timestamp": ...}` always 200 |
| `GET /ready` | Readiness probe - are dependencies working? | `{"status": "ready/degraded", "checks": {...}}` 200 or 503 |

**`/ready` checks**:
- `insforge`: Is the Insforge HTTP client connected and open?
- `google_api_key`: Is GOOGLE_API_KEY configured?
- `fmp_api_key`: Is FMP_API_KEY configured?

If any check fails, status becomes `"degraded"` and HTTP status is 503.

**How to use**:
```bash
# Quick check - is it running?
curl http://localhost:8000/health

# Detailed check - are dependencies ok?
curl http://localhost:8000/ready
```

**Extending**: To add a new dependency check (e.g., Redis, external API), add a new try/except block inside `readiness()` that sets `checks["your_service"] = "ok"` or `"error"`.

**Note**: These endpoints are excluded from request logging middleware to avoid log noise.

## Backend: Rate Limiting

**Library**: `slowapi` (wraps `limits`)

**File**: `backend/app/main.py` (limiter setup), individual routers (decorators)

### Configuration

The limiter uses client IP address (`get_remote_address`) as the rate limit key:

```python
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
```

### Current Rate Limits

| Endpoint | Limit | Why |
|----------|-------|-----|
| `POST /api/market` | 5/minute | Triggers Gemini AI generation - expensive |
| `POST /api/digest` | 5/minute | Triggers Gemini AI generation - expensive |
| `POST /api/stocks/{symbol}/analysis` | 5/minute | Triggers Gemini AI generation - expensive |
| `POST /api/stocks/{symbol}/technical` | 5/minute | Triggers Gemini AI generation - expensive |
| `GET /api/stocks/search` | 20/minute | Calls external FMP API |
| `GET /api/stocks/quotes` | 30/minute | Calls yfinance |

### How it works

Each rate-limited endpoint has:
1. A `limiter` instance imported from `slowapi`
2. A `@limiter.limit("N/minute")` decorator
3. A `request: Request` parameter (slowapi requires this to extract the client IP)

When a client exceeds the limit, slowapi returns HTTP 429 with a `Retry-After` header.

**Important implementation detail**: In routers where the endpoint already had a parameter named `request` for the Pydantic body (e.g., `DigestRequest`), we renamed the body parameter to `body` to free up `request` for the FastAPI `Request` object that slowapi needs:

```python
# Before (no rate limiting):
async def generate_digest(request: DigestRequest):
    request.user_id ...

# After (with rate limiting):
async def generate_digest(request: Request, body: DigestRequest):
    body.user_id ...
```

**How to add rate limiting to a new endpoint**:
```python
from slowapi import Limiter
from slowapi.util import get_remote_address
from fastapi import Request

limiter = Limiter(key_func=get_remote_address)

@router.post("/your-endpoint")
@limiter.limit("10/minute")
async def your_endpoint(request: Request, body: YourModel):
    ...
```

**How to debug 429 errors**: The `Retry-After` header tells the client how many seconds to wait. Check if a single IP is legitimately hitting the limit (e.g., a shared office network) or if it's abuse.

**Limitations**: Rate limiting is per-process and in-memory. If you run multiple uvicorn workers, each worker has its own counter. For production with multiple workers, you would need a shared backend like Redis (configure via `limiter = Limiter(key_func=get_remote_address, storage_uri="redis://...")`)

## Backend: Startup & Shutdown

**File**: `backend/app/main.py` (lines 166-206)

### Startup (`_startup`)

1. Validates required API keys (GOOGLE_API_KEY, FMP_API_KEY) - logs WARNING if missing, does NOT block startup
2. Pre-warms the weekly report cache as a non-blocking background task

**Why warning instead of blocking**: Some endpoints work without all API keys (e.g., stock quotes don't need GOOGLE_API_KEY). Blocking startup would prevent the entire API from serving any request.

### Shutdown (`_shutdown`)

Closes the Insforge HTTP client connection pool:

```python
await get_insforge_service().close()
```

**Why this matters**: Without this, the `httpx.AsyncClient` inside InsforgeService would leak TCP connections on every restart. Over many restarts (e.g., during development with `--reload`), this causes file descriptor exhaustion.

## Backend: Logging System

### Infrastructure

**File**: `backend/app/core/logging.py`

Two functions:
- `setup_logging(level=None)`: Configures the root logger. Called once in `main.py` at import time.
- `get_logger(name)`: Returns a named logger. Every module calls this with `__name__`.

**Configuration**:
- Log level controlled by `LOG_LEVEL` environment variable (default: `INFO`)
- Format: `2025-01-15 10:30:00,123 [INFO] app.features.stock.router: message`
- Output: stdout (captured by any hosting platform's log aggregation)
- Noisy third-party loggers (httpx, httpcore, google, openai) are set to WARNING

**How to change log level at runtime**:
```bash
# In .env or environment
LOG_LEVEL=DEBUG  # See all debug messages
LOG_LEVEL=WARNING  # Only warnings and errors
```

### Request Logging Middleware

**File**: `backend/app/main.py` (lines 75-94)

Every HTTP request is logged with method, path, status code, and duration:

```
2025-01-15 10:30:00 [INFO] app.main: GET /api/stocks/AAPL 200 45ms
2025-01-15 10:30:01 [WARNING] app.main: POST /api/market 200 8234ms [SLOW]
```

- Requests taking >5 seconds are automatically logged at WARNING level with `[SLOW]` tag
- `/health`, `/ready`, `/favicon.ico` are excluded to reduce noise

**How to use for debugging**:
```bash
# Find slow endpoints
grep "SLOW" app.log

# Find all errors
grep "ERROR" app.log

# Find specific module issues
grep "app.features.stock" app.log
```

### Module Loggers

Every module uses a named logger:

```python
from app.core.logging import get_logger
logger = get_logger(__name__)
# __name__ becomes e.g. "app.features.stock.router"
```

**Log level conventions used across all modules**:
| Level | When to use |
|-------|-------------|
| `logger.info()` | Normal operations: cache hits, data fetched, report generated |
| `logger.warning()` | Degraded but functional: empty API response, missing optional data, slow operation |
| `logger.error()` | Failure that's handled: API call failed with fallback, invalid data skipped |
| `logger.exception()` | Exception caught with traceback: replaces old `traceback.print_exc()` |

**Formatting convention**: All logger calls use `%s` lazy formatting (not f-strings) for performance:
```python
# Correct - string formatting is skipped if log level filters the message
logger.info("Fetched %s quotes for %d symbols", source, count)

# Avoid - f-string is always evaluated even if message is filtered
logger.info(f"Fetched {source} quotes for {count} symbols")
```

## Frontend: Error Boundary

**File**: `frontend/src/app/error.tsx`

Next.js App Router error boundary that catches any unhandled client-side JavaScript error. Without this, a JS error in any component causes a white screen.

**Behavior**:
- Shows a terminal-card styled error page with "Something went wrong"
- In development mode (`NODE_ENV=development`): also shows the error message in a red box
- In production: only shows the generic message (no error details leaked to users)
- "Try Again" button calls Next.js `reset()` to re-render the error boundary's children
- "Back to Home" link provides a way out

**How it works**: Next.js automatically wraps each route segment with this error boundary. When a component throws during rendering, React catches it and renders `error.tsx` instead.

**Limitations**: This does NOT catch:
- Errors in root layout (`layout.tsx`) - those need `global-error.tsx`
- Server-side errors (those are caught by the backend global exception handler)
- Errors in event handlers that don't affect rendering (those just appear in console)

## Frontend: 404 Page

**File**: `frontend/src/app/not-found.tsx`

Custom 404 page with terminal-card styling. Replaces Next.js default 404.

Links to home (`/`) and daily report (`/today`).

## Frontend: Chart Lazy Loading

**Problem**: `lightweight-charts` and `TradingViewWidget` are heavy JavaScript libraries (~200KB). Loading them on every page hurts first-page load time, especially on mobile.

**Solution**: All chart components are wrapped with `next/dynamic` + `ssr: false`:

```typescript
import dynamic from 'next/dynamic';

const StockPriceChart = dynamic(
  () => import('@/components/StockPriceChart').then(mod => mod.StockPriceChart),
  { ssr: false, loading: () => <div className="h-[400px] bg-card animate-pulse rounded-lg" /> }
);
```

**What this does**:
1. Chart JS is NOT included in the initial page bundle
2. It loads asynchronously when the component is first rendered
3. While loading, a pulsing skeleton placeholder is shown
4. `ssr: false` prevents server-side rendering (these charts need browser APIs like `window`)

**Components lazily loaded**:

| Component | Used In |
|-----------|---------|
| `StockPriceChart` | `/stock/[symbol]/page.tsx` |
| `TradingViewWidget` | `TechnicalChart.tsx`, macro pages (economy, sentiment, liquidity, inflation-rates) |
| `NetLiquidityChart` | `/macro/liquidity/page.tsx` |
| `GlobalLiquidityChart` | `/macro/liquidity/page.tsx` |
| `IndexAreaChart` | `/macro/sentiment/page.tsx` |
| `CommodityAreaChart` | `/macro/inflation-rates/page.tsx` |
| `YieldCurveChart` | `/macro/inflation-rates/page.tsx` |

**Additionally**: `next.config.ts` has `optimizePackageImports: ['lightweight-charts']` which tells Next.js to tree-shake this package more aggressively.

**How to add a new chart component with lazy loading**:
```typescript
import dynamic from 'next/dynamic';

const NewChart = dynamic(
  () => import('@/components/NewChart').then(mod => mod.NewChart),
  {
    ssr: false,
    loading: () => <div className="h-[400px] bg-card animate-pulse rounded-lg" />,
  }
);
```

## Debugging Playbook

### User reports "Internal server error"

1. Check backend logs for `Unhandled exception:` at ERROR level
2. The log entry includes the full traceback, request method, and path
3. Fix the root cause in the handler, or add specific error handling

### User reports "too many requests" / 429

1. Check which endpoint they're hitting and the current limit (see rate limit table above)
2. If legitimate use: consider increasing the limit in the router's `@limiter.limit()` decorator
3. If abuse: the rate limiter is working as intended

### "Something went wrong" on frontend

1. Check browser console for the error (error.tsx logs it via `console.error`)
2. If it's an API error: check backend logs
3. If it's a rendering error: check the component that failed

### Slow response times

1. Check request logs for `[SLOW]` entries
2. Common causes:
   - AI generation endpoints (Gemini) are inherently slow (5-30s)
   - FMP API rate limiting on their side
   - Insforge Edge Function cold starts

### Service health check

```bash
# Is it alive?
curl localhost:8000/health

# Are dependencies working?
curl localhost:8000/ready
# If "degraded": check which service shows "error" or "missing" in the checks object
```

### Finding module-specific logs

Logger names follow the Python module hierarchy:
```
app.main                          - Request logs, startup/shutdown
app.core.database                 - Insforge HTTP client operations
app.features.stock.router         - Stock endpoint handlers
app.features.stock.agent          - Stock AI agent operations
app.features.stock.service        - Stock data aggregation
app.features.daily_report.agent   - Market report AI generation
app.shared.fmp_service            - FMP API calls
app.shared.insforge_service       - Insforge data operations
app.shared.yfinance_service       - yfinance data fetching
```

Filter with:
```bash
grep "app.features.stock" server.log
grep "ERROR" server.log | grep "app.shared"
```

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `LOG_LEVEL` | `INFO` | Controls logging verbosity (DEBUG/INFO/WARNING/ERROR) |

Rate limiting and slow-request thresholds are currently hardcoded. To make them configurable, add environment variables in `core/config.py` and reference them in `main.py` / routers.

## What Is NOT Covered (Future Phases)

These are documented but not yet implemented:

- **Phase 4**: Email service retry with exponential backoff, increased brew concurrency
- **Phase 5**: GitHub Actions CI pipeline, pytest coverage reporting
- **Phase 6**: Database call retries, per-query logging for Insforge Edge Functions
- **External monitoring**: No Sentry/DataDog integration (stdout logs are sufficient for current scale)
- **Multi-worker rate limiting**: Current rate limits are per-process; Redis backend needed for multi-worker deployments
