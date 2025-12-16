# Liquidity Monitor - Design Document

## Overview

A dashboard page for monitoring macroeconomic liquidity indicators, helping users interpret market liquidity conditions independently.

## Core Liquidity Indicators

### 1. Fed Balance Sheet Components

| Indicator | Description | FRED Code | Impact |
|-----------|-------------|-----------|--------|
| **Fed Total Assets** | Federal Reserve balance sheet size | `WALCL` | Base |
| **TGA Balance** | Treasury General Account | `WDTGAL` | TGA up = Liquidity down |
| **ON RRP Balance** | Overnight Reverse Repo | `RRPONTSYD` | RRP up = Liquidity down |
| **Bank Reserves** | Deposits at Fed | `WRESBAL` | Direct liquidity |

**Net Liquidity Formula**: `Net Liquidity = WALCL - TGA - RRP`

### 2. Money Market Rates

| Indicator | Description | FRED Code |
|-----------|-------------|-----------|
| **SOFR** | Secured Overnight Financing Rate | `SOFR` |
| **EFFR** | Effective Federal Funds Rate | `EFFR` |

### 3. Financial Conditions Index

| Indicator | Description | FRED Code |
|-----------|-------------|-----------|
| **NFCI** | Chicago Fed National Financial Conditions Index | `NFCI` |
| **ANFCI** | Adjusted NFCI (economic factors removed) | `ANFCI` |

> NFCI > 0 = Tightening, NFCI < 0 = Loosening

---

## Technical Architecture

### Hybrid Approach

| Data Type | Tool | Reason |
|-----------|------|--------|
| Raw FRED data | TradingView Widget | Free, real-time, zero maintenance |
| Calculated metrics | Lightweight Charts | Custom formula support |
| Status cards | Custom React | Brand consistency |
| AI interpretation | Existing Agent | Reuse backend capability |

### Component Stack

```
Frontend (Next.js)
├── TradingView Widgets (react-tradingview-embed)
│   └── Direct FRED data display (WALCL, TGA, RRP, etc.)
├── Lightweight Charts (lightweight-charts-react-wrapper)
│   └── Calculated net liquidity chart
├── Custom Components
│   ├── LiquidityCard - Key metrics display
│   ├── NFCIGauge - Financial conditions indicator
│   └── LiquidityAnalysis - AI interpretation
└── Backend API
    ├── FRED API Service - Data fetching
    ├── Liquidity Calculator - Net liquidity computation
    └── LiquidityAgent - AI analysis
```

---

## Page Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  Liquidity Monitor                                        [Refresh] │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  [Metric Cards Row]                                                 │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │
│  │ Net Liq.    │ │ Fed Assets  │ │ TGA         │ │ RRP         │   │
│  │ $5.82T      │ │ $7.04T      │ │ $722B       │ │ $498B       │   │
│  │ +2.1%       │ │ -0.3%       │ │ +5.2%       │ │ -12.4%      │   │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘   │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  [Net Liquidity Trend - Lightweight Charts]                         │
│  Calculated: WALCL - TGA - RRP                                      │
│  Time range selector: [1M|3M|6M|1Y]                                 │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  [Fed Balance Sheet Components - TradingView Widgets]               │
│  2x2 Grid: WALCL | TGA | RRP | Reserves                            │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  [Money Market & Financial Conditions]                              │
│  Left: SOFR/EFFR rates | Right: NFCI Gauge                         │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  [AI Liquidity Analysis]                                            │
│  Generated interpretation of current liquidity conditions           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Plan

### Phase 1: Page Skeleton + TradingView Widgets (2h)
- [ ] Create `/liquidity` page route
- [ ] Install `react-tradingview-embed`
- [ ] Implement TradingView widget components for FRED data
- [ ] Basic page layout with Tailwind CSS

### Phase 2: FRED API Service + Net Liquidity Calculation (3h)
- [ ] Create FRED API service in backend
- [ ] Implement net liquidity calculation endpoint
- [ ] Add historical data fetching
- [ ] Create API client in frontend

### Phase 3: Lightweight Charts Integration (2h)
- [ ] Install `lightweight-charts` and React wrapper
- [ ] Create NetLiquidityChart component
- [ ] Implement time range selector
- [ ] Connect to backend data

### Phase 4: Custom Cards + NFCI Gauge (2h)
- [ ] Create LiquidityCard component
- [ ] Create NFCIGauge component
- [ ] Implement data refresh logic
- [ ] Add loading states

### Phase 5: AI Liquidity Analysis Agent (3h)
- [ ] Create LiquidityAgent in backend
- [ ] Define analysis prompt template
- [ ] Add analysis endpoint
- [ ] Integrate with frontend

---

## Data Sources

| Source | URL | Update Frequency |
|--------|-----|------------------|
| FRED API | https://fred.stlouisfed.org/docs/api/fred/ | Weekly (most series) |
| TradingView | Direct widget embed | Real-time |
| NY Fed (RRP) | https://www.newyorkfed.org/markets/desk-operations/reverse-repo | Daily |
| Treasury (TGA) | https://fiscaldata.treasury.gov/datasets/daily-treasury-statement/ | Daily |

---

## Dependencies

### Frontend
```json
{
  "react-tradingview-embed": "^1.x",
  "lightweight-charts": "^5.x"
}
```

### Backend
```
fredapi  # FRED API Python client
```

---

## References

- [FRED API Documentation](https://fred.stlouisfed.org/docs/api/fred/)
- [TradingView Widget Docs](https://www.tradingview.com/widget-docs/widgets/charts/advanced-chart/)
- [Lightweight Charts GitHub](https://github.com/tradingview/lightweight-charts)
- [Chicago Fed NFCI](https://www.chicagofed.org/research/data/nfci/current-data)
- [NY Fed SOFR Data](https://www.newyorkfed.org/markets/reference-rates/sofr)
