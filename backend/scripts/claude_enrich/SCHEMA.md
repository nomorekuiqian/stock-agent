# KOL methodology-v3 enrichment schema

This file is the source of truth for what Claude has to output when classifying
a batch of tweets fetched by `fetch_for_enrich.py`. `push_enrichments.py` reads
the output, validates against this schema, and writes the result to the
`kol_tweets.symbols` JSONB column via the `kol-tweets` edge function's
`upsert_enrichment` action.

## Input format

`fetch_for_enrich.py` writes one tweet per JSONL line:

```json
{
  "id": "1947437369134927931",
  "created_at": "2025-07-21",
  "tweet_type": "original",
  "text": "印象中应该是第一次美国SEC主席说以太坊不是证券，对以太坊意义重大",
  "quoted_excerpt": null,
  "reply_to": null
}
```

- `text`: full tweet text (not truncated).
- `quoted_excerpt`: ≤220 chars (already truncated).
- `created_at`: date only (`YYYY-MM-DD`).
- `tweet_type`: `original | reply | retweet | quote`.
- `reply_to`: in_reply_to_username if reply, else null.

## Output format

Classify each input line into one output line, **same `id`, schema below**:

```json
{
  "id": "1947437369134927931",
  "content_type": "macro_view",
  "tickers": [],
  "sectors": ["crypto"],
  "stance": "bull",
  "key_claim": "宏观分析: SEC 首次表态以太坊非证券，对加密监管框架是重大突破"
}
```

Required keys (all of them, even if empty): `id`, `content_type`, `tickers`,
`sectors`, `stance`, `key_claim`.

## Enum: content_type

| value | when to pick |
| --- | --- |
| `thesis` | Long-form investment argument for an industry / company (>200 chars body) |
| `trade_action` | Author reports their own position change (加仓/减仓/止盈/建仓/清仓) |
| `catalyst` | Earnings / product launch / partnership / analyst rating / contract / policy landing |
| `sector_framework` | Value-chain map, supply-chain breakdown, leader list for a sector |
| `risk_flag` | Risk warning, overvaluation concern, bubble worry |
| `macro_view` | Pure macro: Fed / CPI / rates / tariffs / liquidity / fiscal — no specific stock |
| `noise` | Chit-chat, greetings, life updates, retweets unrelated to investing |

When a tweet straddles two, pick the **dominant argument**. A long thesis that
mentions one catalyst → `thesis`. A short tweet announcing earnings beat with
no other framing → `catalyst`.

## Enum: sectors

Use only these slugs (anything else is silently dropped by `push_enrichments.py`):

```
CPO photonics AI_infra substrates optical_transceiver
defense space power_semi macro neocloud
crypto stablecoin rwa
```

Multiple allowed. Leave empty `[]` if no clear sector (e.g. pure macro_view
without industry angle, or noise).

## Enum: stance

`bull | bear | neutral`. Default to `neutral` for catalysts you can't tell
direction on. For `noise`, use `neutral`.

## Field: tickers

Real US-style 2-5 alpha tickers (NVDA, AMD, AVGO, PLTR, ASML, TSM) or 6-digit
A-share codes (002475). **Skip generic acronyms** that aren't tickers — these
are sectors or noise, not symbols:

```
AI ETF CEO CFO CTO COO IPO GDP CPI FED CPU GPU RAM SSD API SDK
LLM RAG AGI ML DL NLP CV RL VR AR XR IoT CRM ERP SaaS PaaS IaaS
HTTP HTML CSS US EU UK CN JP KR DE FR USD EUR JPY
BTC ETH SOL DOGE  ← these are crypto sectors, not tickers
```

If you mention `$NVDA` or "英伟达 NVDA" in the text, include it. If you only say
"AI infra is overheating" with no specific company, leave `tickers: []` and
put `AI_infra` in sectors.

When `content_type == "noise"`, leave `tickers: []`.

## Field: key_claim

Chinese, ≤80 chars, with the prefix from this table:

| content_type | prefix |
| --- | --- |
| `thesis` | `投资逻辑:` |
| `trade_action` | `交易操作:` |
| `catalyst` | `催化剂:` |
| `sector_framework` | `板块框架:` |
| `risk_flag` | `风险提示:` |
| `macro_view` | `宏观分析:` |
| `noise` | `非投资内容` (exact, no colon, no suffix) |

The body after the prefix should distill the load-bearing point, not summarize
the entire tweet. Aim for ≤60 chars after the prefix.

## What push_enrichments.py does on top

It takes your output and adds the storage-side fields:

```jsonc
{
  // your fields:
  "content_type": "thesis",
  "tickers": ["NVDA"],
  "sectors": ["AI_infra"],
  "stance": "bull",
  "key_claim": "投资逻辑: ...",
  // derived for twitter_digest compatibility:
  "quality": "drop",                 // "drop" iff content_type=="noise" else "keep"
  "ticker_stances": [                // expanded from tickers + stance
    { "ticker": "NVDA", "stance": "bull" }
  ],
  // metadata:
  "enriched_at": "2026-05-31T...Z",
  "enriched_model": "claude-opus-4-7"
}
```

The `quality` field is what makes `list_unenriched` skip the row on its next
sweep — without it, the same tweets get re-queued forever.

## Validation rules push_enrichments.py enforces

- `id` non-empty string → else row dropped, counted as `bad`.
- `content_type` ∈ VALID_CONTENT_TYPES → else row dropped.
- `sectors`: drop unknown slugs silently; keep valid ones; allow empty.
- `tickers`: regex `^[A-Z]{2,5}$` OR `^\d{6}$`; reject blacklisted acronyms.
- `stance` ∈ {bull, bear, neutral} → else default `neutral`.
- `key_claim`: if missing, replace with `"非投资内容"` for noise, else
  `"投资逻辑: (missing)"` placeholder.
