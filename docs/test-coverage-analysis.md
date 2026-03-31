# Test Coverage Analysis

Date: 2026-03-31

## Overview

This document analyzes the current test coverage across the full stack and identifies priority areas for improvement.

---

## Backend Coverage Summary

### Feature Modules vs Tests

| Feature Module | Unit Tests | E2E Tests | Integration | Gaps |
|----------------|-----------|-----------|-------------|------|
| `daily_report` | `test_daily_report_unit.py` | `test_daily_report_e2e.py` | - | Good coverage |
| `brew` | `test_brew_router_unit.py` | `test_brew_e2e.py` | - | Missing service/agent unit tests |
| `stock` | `test_stock_agent.py`, `test_stock_service_unit.py`, `test_stock_cache.py`, `test_stock_agent_technical_unit.py`, `test_technical_unit.py`, `test_target_price_unit.py` | `test_stock_e2e.py`, `test_stock_technical_e2e.py` | - | Best covered module |
| `macro/risk` | `test_macro_risk_unit.py` | `test_macro_risk_e2e.py` | - | Good coverage |
| `macro/liquidity` | `test_global_liquidity_unit.py` | `test_global_liquidity_e2e.py`, `test_liquidity_e2e.py` | - | Good coverage |
| `macro/weekly` | `test_weekly_report_unit.py` | `test_weekly_report_e2e.py` | - | Good coverage |
| `macro/cache` | `test_macro_cache_unit.py` | `test_macro_cache_e2e.py` | - | Good coverage |
| `morning_report` | `test_morning_report_unit.py` | `test_morning_report_e2e.py` | - | Good coverage |
| `screener` | `test_screener_unit.py` | - | - | **Missing E2E tests** |
| `notification` | `test_broadcast_send.py`, `test_broadcast_batch.py`, `test_email_rendering.py`, `test_newsletter_unit.py` | `test_broadcast_e2e.py`, `test_newsletter_e2e.py` | - | Good coverage |
| `subscription` | `test_subscription_unit.py`, `test_email_preferences_unit.py` | `test_subscription_weekly_e2e.py` | - | Good coverage |
| `feedback` | - | - | - | **No tests at all** |
| `payment` | - | - | - | **No tests at all** |
| `invites` | - | - | - | **No tests at all** |

### Shared Layer

| Module | Tests | Status |
|--------|-------|--------|
| `shared/data_tools` | `test_api_transforms.py`, `test_data_cleaning.py`, `test_fmp_news.py`, `test_fmp_key_metrics_unit.py`, `test_yfinance_ticker_metrics_unit.py` | Partial - transforms and FMP covered |
| `shared/insforge_service` | - | **No unit tests** (only used via fixture in conftest) |
| `shared/fmp_service` | `test_fmp_news.py`, `test_fmp_key_metrics_unit.py` | Partial |
| `shared/yfinance_service` | `test_yfinance_ticker_metrics_unit.py` | Partial |
| `core/` (config, logging, rate_limit) | `test_infrastructure_unit.py` | Partial |

### Other Backend Tests

- `test_conversation_unit.py` - Research/conversation feature
- `test_research_unit.py` + `test_research_e2e.py` - Research feature
- `integration/test_database_operations.py` - DB integration

---

## Frontend Coverage Summary

### By Category

| Category | Total Files | Tested | Coverage | Status |
|----------|------------|--------|----------|--------|
| Pages (`app/**/page.tsx`) | ~35 | 4 | ~11% | **Critical gap** |
| Components (top-level) | ~55 | 9 | ~16% | **Low** |
| Query Hooks | 11 | 4 | 36% | Medium |
| Lib Utilities | 12 | 6 | 50% | Medium |
| Contexts | 2 | 2 | 100% | Complete |
| E2E Specs (Playwright) | 6 | 6 | N/A | Good |

### Tested Areas (strengths)

- **Auth flow**: Login, signup, forgot-password, verify-email pages + E2E login spec (558 lines)
- **Core hooks**: `useStockSearch`, `useWatchlist`, `useStockData`, `useDigestData`, `query-keys`
- **Business components**: `PaywallGuard`, `ReportContent`, `StockCard`, `Navbar`, `AuthSubscriptionSync`
- **Utilities**: `timezone`, `digest-utils`, `auth-*`, `api.ts`
- **Contexts**: Both `AuthContext` and `SubscriptionContext` fully tested
- **E2E**: Login, research, navigation, stock, today, macro

### Untested Areas (gaps)

**Pages (31 untested):** `/today`, `/for-you`, `/stock/[symbol]`, `/macro/*`, `/morning/*`, `/research`, `/profile`, `/screener`, `/reports/*`, `/market`, etc.

**Components (46 untested):**
- All chart/visualization components (13): `StockPriceChart`, `YieldCurveChart`, `GlobalLiquidityChart`, `RiskGauge`, etc.
- UI components: `MobileMenu`, `NavAuth`, `WatchlistPanel`, `SubscribeForm`, `InviteCodeModal`
- Feature components: `/for-you/_components/*`, `/stock/[symbol]/_components/*`, `/today/_components/*`

**Query Hooks (7 untested):** `use-liquidity-data`, `use-macro-data`, `use-morning-report-data`, `use-preferences`, `use-report-data`, `use-weekly-report`, `query-client`

**Lib (6 untested):** `auth-cookies`, `insforge-server`, `insforge`, `portfolio-templates`, `stock-names`, `utils`

---

## Priority Recommendations

### P0 - High Impact, Should Add Now

1. **Backend: `payment` module tests**
   - Why: Payment logic is critical and errors mean revenue loss. Stripe webhook handling, subscription state transitions, and edge cases (failed payments, upgrades/downgrades) need coverage.
   - Scope: Unit tests for service logic + E2E tests for webhook endpoints.

2. **Backend: `feedback` module tests**
   - Why: Zero test coverage. Simple module but validates data persistence works.
   - Scope: Unit tests for input validation + E2E for the feedback submission endpoint.

3. **Frontend: Query hooks error/loading states**
   - Why: 7 untested query hooks handle data fetching for major pages. Error handling and retry logic bugs surface in production as blank screens.
   - Scope: Tests for `use-macro-data`, `use-morning-report-data`, `use-report-data`, `use-preferences` (focus on error/empty states).

### P1 - Important Gaps

4. **Backend: `screener` E2E tests**
   - Why: Has unit tests but no E2E. The screener is a user-facing feature that should validate the full request/response cycle.

5. **Backend: `insforge_service` unit tests**
   - Why: This is the central database abstraction layer used by all features. Currently only tested indirectly through feature E2E tests.

6. **Frontend: `PaywallGuard` / subscription flow integration**
   - Why: The paywall component has unit tests, but the full subscription check flow (context -> API -> gate) lacks integration-level testing. Bugs here = users seeing wrong content.

7. **Frontend: Chart components smoke tests**
   - Why: 13 chart components with zero tests. Don't need pixel-perfect testing, but smoke tests (renders without crashing given valid/empty/error data) prevent regressions.
   - Approach: Simple render tests with mocked data; use Playwright visual snapshots for regression.

### P2 - Nice to Have

8. **Frontend: Page-level render tests for data pages**
   - Why: Only 11% coverage. Even basic "renders loading state" and "renders with mocked data" tests catch import/wiring bugs.
   - Priority pages: `/today`, `/for-you`, `/stock/[symbol]`, `/macro`

9. **Backend: `invites` module tests**
   - Why: No tests, but likely a simpler module. Add basic unit tests.

10. **Frontend: `auth-cookies` and `insforge` client tests**
    - Why: Auth cookie handling is security-sensitive. The Insforge client is the DB layer. Both deserve unit tests.

11. **Backend: Rate limiting and error handling tests**
    - Why: `test_infrastructure_unit.py` exists but should be expanded to cover rate limit behavior, CORS configuration, and global error handlers under different scenarios.

---

## Structural Observations

### Strengths
- Good test infrastructure: conftest.py with DB write protection, proper markers, clear test categories
- Strong auth testing across both frontend (unit + E2E) and backend
- Stock module is the best-tested feature end-to-end
- E2E tests use smart mocking (Playwright route interception, no backend dependency for auth tests)

### Weaknesses
- **No backend router-level unit tests for most modules** - E2E tests hit real endpoints but don't test request validation, error responses, or edge cases at the router level
- **No test coverage measurement** - Neither `pytest-cov` nor Vitest coverage reports are configured. Adding coverage reporting would make gaps visible and trackable.
- **Frontend page tests are almost nonexistent** - Relies heavily on E2E, which is slow and fragile. Basic render tests would catch wiring issues faster.
- **No contract tests** between frontend API client (`lib/api.ts`) and backend routers - schema changes could break the frontend silently.

### Quick Wins
1. Add `pytest-cov` and Vitest `--coverage` to CI to track coverage over time
2. Add smoke render tests for the 5 most-used pages
3. Add `payment` webhook handler tests (highest business risk)
4. Add `insforge_service` unit tests (highest blast radius for regressions)
