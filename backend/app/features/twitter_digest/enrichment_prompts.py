"""
Per-tweet enrichment prompt (Step 1).

Run by flash-lite once a day on every unenriched tweet in the last ~24h. Output
populates `kol_tweets.symbols` JSONB so the downstream daily digest can:
  1. Drop low-quality / no-thesis tweets via `quality = "keep" | "drop"`.
  2. Cluster the rest by `ticker × stance` (bull / bear / neutral) for the
     "who is calling buy / sell on what" reader view.

Design notes:
  - One LLM call per batch of tweets. The model returns a parallel list of
    EnrichmentOutput, indexed by input order.
  - Output is intentionally minimal — no summary, no quality_features, no
    events. Anything not strictly needed by the downstream digest is removed
    to reduce hallucination surface.
  - Ticker extraction is conservative; backend post-processing re-validates
    every ticker against the source text and a denylist.
"""

ENRICH_INSTRUCTION = """
You enrich KOL stock tweets with minimal metadata for a daily digest that
groups tweets by ticker × stance (bull / bear / neutral).

You will receive a JSON payload with:
  - tweets: [{id, author_username, text, tweet_type, created_at, url,
              quoted_tweet_text, in_reply_to_username,
              like_count, retweet_count, reply_count}]

You return a JSON object:
  {"enrichments": [EnrichmentOutput, ...]}

The list MUST have the same length as the input `tweets` and be in the same
order. If you cannot enrich a tweet, return:
  {"quality": "drop", "ticker_stances": [], "sectors": []}
Never skip an item.

# Step 1 — Quality: keep or drop

The downstream digest is for retail investors. They want a mix of thesis-grade
analysis AND "what is the crowd doing / what's on the calendar / who flipped"
signals. The bar for `keep` is therefore deliberately wide.

You output `quality = "keep"` if the tweet has AT LEAST ONE of these:

  1. **specific data** — actual numbers: P/E, revenue $, growth %, capex,
     shipment counts, market share, financial-model variables, subscriber counts.
  2. **reasoning chain** — explicit multi-step logic the reader can follow
     (A → B → therefore C). Not a single assertion.
  3. **falsifiable catalyst** — a specific upcoming event or testable claim
     ("若 RPO 环比 < 8% 则证伪共识", "下周三盘后看 [指标]", "等 Stage 3 客户官宣").
  4. **comparison** — A vs B side-by-side; historical analogue ("this is 2018 except…").
  5. **risk callout** — author flags what would break their own thesis,
     or seriously acknowledges a counter-argument.
  6. **narrative / 叙事** — a market story the author is laying out, even
     without numbers ("AI 算力还远没到顶 / 中国消费正在底部反转 / power 已经
     超过 GPU 成为 AI 真正瓶颈"). Retail decisions are driven by stories.
  7. **behavior signal** — author reports their own position change:
     新建仓 / 加仓 / 减仓 / 清仓 / 翻多 / 翻空 / 重新建仓. Even "卖光 TSLA 了"
     with no reason is informative — it's a tracked KOL's revealed preference.
  8. **specific event / calendar item** — a concrete company or macro event
     with a time anchor: 财报日, 评级变动, 监管投票, FOMC, CPI, 产品发布,
     重大并购, IPO 日程. Author's own take is not required — just naming the
     event puts it on the watchpoint radar.
  9. **explicit directional stance on a ticker** — "我看多 $NVDA 到年底",
     "$TSLA 看到 200 不卖". Even with light reasoning, this counts as a vote
     in the bull/bear tally and a citation point in the ticker thesis. The
     downstream curator decides whether it carries a card argument or just
     a stance frequency.

You output `quality = "drop"` ONLY for tweets that match all of:
  - no ticker, no event, no narrative, no position move; AND
  - no falsifiable claim or directional stance

Concretely, drop:

  - Pure price播报 with no commentary: "NVDA +5%", "broke through 410"
    (price + sentence about WHY → keep)
  - Pure trade celebration looking backward: "$TSLA 447 ✅",
    "called this last week" with no forward-looking statement
  - Cycle psychology / motivational / philosophy with no ticker or event
  - Pure quote-tweets / retweet-with-no-added-text
  - Off-topic content (politics-only with no investment angle, personal life)
  - Pure ticker-only list with no take and no time anchor:
    "$HIMS $ASTS $RGTI" alone → drop; "Today after the bell: $HIMS $ASTS $RGTI"
    → KEEP (it's a calendar item — event #8)

Borderline rule: when in doubt, KEEP. Curator downstream filters again with
stricter criteria for what gets a card-level argument vs. what's just a
stance/event/signal datapoint. Being liberal here lets the crowd-signal
features (stance tallies, watchpoint coverage) work.

# Step 2 — Per-ticker stance (only when quality = "keep")

For each ticker explicitly discussed in the tweet, classify the AUTHOR'S
DIRECTIONAL VIEW on that specific ticker:

  - **bull**:  author supports owning / adding / breaking out / squeezing higher
  - **bear**:  author supports selling / avoiding / shorting / sees downside
  - **neutral**: factual reporting (earnings recap, news), data dump,
                 or no clear directional claim

A single tweet can carry multiple ticker_stances with DIFFERENT directions
(e.g. "$NVDA still has runway but $AMD looks expensive" → NVDA bull, AMD bear).

Ticker rules:
  - Uppercase 2-5 chars (NVDA, AMD, META, GOOG) OR 6-digit all-numeric
    A-share codes (600519, 688041).
  - NEVER include Twitter usernames (don't output "DCA" because handle
    contains "dca").
  - NEVER infer tickers — only what's EXPLICITLY mentioned in the text.
  - Crypto single-asset views (SOL, ARB) are OK as tickers. BTC/ETH go to
    `sectors` as "加密" instead.

When quality = "drop", `ticker_stances` MUST be empty `[]`.

# Step 3 — Sectors

Chinese sector / theme labels, 1-3 per tweet, used for hot-list tallies.
Examples: "AI 算力", "半导体", "锂电", "光通信", "金融科技", "消费",
"医药生物", "加密", "宏观". Empty list is fine when no sector view.

# Output

Output ONLY the structured JSON:
  {"enrichments": [EnrichmentOutput, ...]}

Each EnrichmentOutput:
  {
    "quality": "keep" | "drop",
    "ticker_stances": [
      {"ticker": "<SYMBOL>", "stance": "bull" | "bear" | "neutral"},
      ...
    ],
    "sectors": [<sector labels>]
  }

`enrichments` length MUST equal `tweets` length, same order.
"""
