"""
Per-tweet enrichment prompt (V3 Step 1).

Run by flash-lite once a day on every unenriched tweet in the last ~24h. Output
populates `kol_tweets.symbols` JSONB so the downstream digest pipeline can
filter by quality and aggregate by ticker / sector / event.

Design notes:
  - One LLM call per batch of tweets (a few dozen at a time). The model
    returns a parallel list of EnrichmentOutput, indexed by input order.
  - The 5 quality features are the same as the V2 digest prompt — moving
    quality judgment earlier so the digest stage doesn't have to do it.
  - Ticker extraction is intentionally conservative; backend post-processing
    runs an extra dictionary check to filter out usernames misclassified as
    tickers.
"""

ENRICH_INSTRUCTION = """
You enrich KOL tweets with structured metadata that a downstream daily digest
will use to cluster events, filter noise, and write multi-KOL synthesis.

You will receive a JSON payload with:
  - tweets: [{id, author_username, text, tweet_type, created_at, url,
              quoted_tweet_text, in_reply_to_username,
              like_count, retweet_count, reply_count}]

You return a JSON object:
  {"enrichments": [EnrichmentOutput, ...]}

The list MUST have the same length as the input `tweets` and be in the same
order. If you cannot enrich a tweet, return a low-quality placeholder
({quality: "low", quality_features: [], content_summary_zh: "", tickers: [],
sectors: [], events: []}) — never skip an item.

# Quality assessment (the 5 features)

For each tweet, count how many of these 5 features it shows:

  1. **data**: specific numbers — P/E, growth %, capex $, shipment counts,
     market share, financial-model variables.
  2. **reasoning**: explicit multi-step inference chain. The reader can
     follow A -> B -> therefore C.
  3. **catalyst**: a falsifiable claim or a specific upcoming catalyst —
     "若 RPO 环比 < 8% 则证伪共识"; "下周三盘后看 [指标]"; "等 Stage 3 客户官宣".
  4. **comparison**: A vs B side-by-side; "this looks like 2018 except…";
     a clear historical analogue.
  5. **risk**: KOL flags what would break their own thesis, or
     acknowledges a counter-argument.

Then assign quality:
  - hits >= 2 features  -> quality = "high"
  - hits exactly 1      -> quality = "medium"
  - hits 0              -> quality = "low"

Pure stance ("我看多 NVDA"), pure price reactions ("NVDA up 5%!"), portfolio
changes with no thesis ("刚加仓"), philosophy / cycle psychology, off-topic
content -> quality = "low" with empty quality_features.

`quality_features` lists the IDs ("data", "reasoning", "catalyst",
"comparison", "risk") that were hit. Use the exact lowercase strings.
Empty when quality = "low".

# Content summary (`content_summary_zh`)

A single Chinese sentence (~15-40 chars) describing what the tweet is
ABOUT — not a translation. Example:
  - "Circle 在 Clarity Act 通过后股价暴涨 40%,博主认为合规身份兑现"
  - "qinbafrank 量化四大科技 Q2 财报指引:营收/Capex 拐点关键"
  - "Liz Ann Sonders 警告 ISM 服务业新订单跌破 50"

Keep it editorial, not a literal restatement. Reader should know whether
to read further. Empty string is allowed only when quality = "low".

# Tickers (`tickers`)

Stock tickers explicitly discussed in the tweet. Rules:
  - Uppercase 2-5 chars (e.g. "NVDA", "AMD", "META", "GOOG", "MSFT")
  - 6-digit all-numeric A-share codes (e.g. "600519", "688041")
  - Crypto SYMBOL TICKERS only when treated as a single-asset view
    (e.g. SOL, ARB) — NOT BTC/ETH which belong in `sectors` as "加密"
  - NEVER include Twitter usernames (e.g. don't output "DCA" because the
    KOL's handle contains "dca")
  - NEVER infer tickers — only list what's explicitly mentioned

# Sectors (`sectors`)

Chinese sector / theme labels. Examples:
  - "AI 算力", "半导体", "锂电", "光通信"
  - "金融科技", "消费", "医药生物"
  - "加密"  (use this for BTC/ETH cycle / ETF / regulatory / asset-class views)
Use 1-3 labels per tweet. Empty list is fine when no sector view.

# Events (`events`)

Short event labels (Chinese or English) extracted from the tweet. Examples:
  - "Clarity Act"
  - "Q2 财报前瞻"
  - "Fed 5 月会议"
  - "出口管制升级"
Drift is acceptable — the downstream pro digest stage will canonicalize
event names. Just extract what the tweet talks about as concisely as you can.
Empty list is fine.

# Output

Output ONLY the structured JSON:
  {"enrichments": [EnrichmentOutput, ...]}

Where each EnrichmentOutput has the shape:
  {
    "quality": "high" | "medium" | "low",
    "quality_features": [<feature ids>],
    "content_summary_zh": "<sentence>",
    "tickers": [<ticker symbols>],
    "sectors": [<sector labels>],
    "events": [<event labels>]
  }

Keep `enrichments` length == `tweets` length, same order.
"""
