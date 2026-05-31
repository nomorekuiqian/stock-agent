# Macro Data Audit - 2026-05-31

## Scope

Audited local backend `http://127.0.0.1:8000/api` and the `macro_data_cache` entries used by `/kol/qinbafrank/macro`.

## Root Cause

1. FRED latest-value requests were returning HTTP 429, so fresh fetches produced `value: null`.
2. Several services only returned DB cache when `is_valid=True`; expired but usable DB data was discarded instead of used as fallback.
3. `fred:liquidity_metrics` was overwritten by an all-null refresh payload, even though `fred:liquidity_history` still had valid observations.
4. `get_inflation_rates()` read `macro:inflation_rates:v2`, while the refresher writes `macro:inflation_rates`.
5. CPI and global liquidity had usable stale cache, but the live endpoints did not reuse it after expiry.

## Fixes Applied

- Liquidity metrics now reject all-null cache/fresh payloads and rebuild current metrics from `fred:liquidity_history`.
- Global liquidity now falls back to stale DB data, then to `fred:global_liquidity_history` partial data.
- Economy and inflation endpoints now hydrate missing indicators from stale DB, `macro:trend_context`, and `macro:treasury_rates`.
- Inflation cache key is aligned to `macro:inflation_rates`.
- CPI breakdown now reuses stale CPI component data instead of replacing it with null values.
- Refresher now avoids writing all-null liquidity/global/CPI payloads when fallback data exists.

## Current Cache Status

| Cache key | Status after refill | Source path |
|---|---:|---|
| `fred:liquidity_metrics` | 8/8 values | FRED history fallback from `fred:liquidity_history` |
| `fred:global_liquidity` | 5/5 values | FRED snapshot / stale DB fallback |
| `macro:economy` | 6/16 values | FRED cache + `macro:trend_context` + FMP treasury curve |
| `macro:inflation_rates` | 4/6 values | FRED cache + `macro:trend_context` + FMP 10Y |
| `fred:cpi_breakdown` | 5/5 components have YoY/MoM | FRED CPI cache fallback |
| `macro:sentiment` | 8/10 values | CNN Fear & Greed + yfinance |
| `macro:treasury_rates` | 12 tenors | FMP treasury rates |

## Page Data Mapping

| Page field | Endpoint/cache | Primary source | Fallback used |
|---|---|---|---|
| Net liquidity | `/liquidity/metrics`, `fred:liquidity_metrics` | FRED WALCL/WDTGAL/RRPONTSYD | `fred:liquidity_history` latest point |
| Bank reserves | `/liquidity/metrics` | FRED WRESBAL | `fred:liquidity_history` |
| TGA | `/liquidity/metrics` | FRED WDTGAL | `fred:liquidity_history` |
| ON RRP | `/liquidity/metrics` | FRED RRPONTSYD | `fred:liquidity_history` |
| SOFR - EFFR | `/liquidity/metrics` | FRED SOFR/EFFR | `fred:liquidity_history` |
| NFCI | `/liquidity/metrics` | FRED NFCI | `fred:liquidity_history` / `macro:trend_context` |
| 10Y Treasury | `/macro-risk/treasury-commodities` | FMP treasury rates | `macro:treasury_rates` |
| 10Y - 2Y spread | `/macro-risk/economy` | FRED T10Y2Y | FMP 10Y minus 2Y |
| CPI / Core PCE | `/macro-risk/inflation-rates` | FRED CPIAUCSL/PCEPILFE | `macro:inflation_rates` / `macro:trend_context` |
| Fed Funds | `/macro-risk/inflation-rates` | FRED FEDFUNDS | `macro:trend_context` |
| Global liquidity | `/liquidity/global`, `fred:global_liquidity` | FRED Fed/ECB/BOJ/TGA/RRP + FX | stale DB / global history |
| USD/JPY | `/liquidity/global` | FRED DEXJPUS | stale DB snapshot |
| VIX/VVIX/SKEW | `/macro-risk/sentiment` | yfinance | none |
| Fear & Greed | `/macro-risk/sentiment` | CNN data API | none |
| DXY | `/macro-risk/treasury-commodities` | yfinance `DX-Y.NYB` | short memory cache |
| Gold/Oil/Copper/Silver | `/macro-risk/treasury-commodities` | FMP commodities | short memory cache |

## Still Missing

These remain `null` because the current database has no usable non-FRED fallback and FRED latest requests are rate-limited:

| Series | Field | Source |
|---|---|---|
| `BAMLH0A0HYM2` | High Yield OAS | FRED-only |
| `BAMLC0A4CBBB` | BBB spread | FRED-only |
| `DRCRELEXFACBS` | CRE delinquency | FRED-only |
| `DRBLACBS` | Business loan delinquency | FRED-only |
| `RECPROUSM156N` | Recession probability | FRED-only |
| `CFNAI` | Chicago Fed activity index | FRED-only |
| `UMCSENT` | Consumer sentiment | FRED-only |
| `PAYEMS` | Nonfarm payrolls | FRED-only |
| `ICSA` | Initial jobless claims | FRED-only |
| `SAHMREALTIME` | Sahm rule | FRED-only |
| `PPIFIS` | PPI | FRED-only |
| `DFII10` | 10Y real rate | FRED-only |

## Verification

- `python -m py_compile` passed for modified macro service files.
- `pytest tests/test_global_liquidity_unit.py tests/test_macro_risk_unit.py tests/test_macro_cache_unit.py -q`: 111 passed.
- Browser spot check on `/kol/qinbafrank/macro` confirms the main cards now have values for liquidity, global liquidity, 10Y, yield curve, CPI/Core PCE, Fed Funds, sentiment, VIX, DXY, and USD/JPY. The only visible remaining `N/A` in the tested pillar set is HY OAS (`BAMLH0A0HYM2`), listed above as FRED-only with no current fallback.
