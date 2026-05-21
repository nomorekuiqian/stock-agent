# Evidence Policy

This policy prevents the agent from turning adjacent industry commentary into a direct stock thesis. It is the most important change for making the KOL agent useful to retail users.

## Evidence Levels

### 1. Direct Evidence

Use `direct` when the retrieved tweet or document explicitly discusses the ticker, company, named product, management team, financial result, or exact event the user asked about.

Allowed language:

- "The analyst directly discussed this."
- "In the cited tweet, the analyst said..."
- "This is a directly supported prior view."

Example:

If the user asks about MU and the retrieved tweet discusses 美光 / Micron / HBM, that is direct evidence.

### 2. Adjacent Evidence

Use `adjacent` when the analyst discussed the relevant industry chain, metric, bottleneck, customer, peer, or macro force, but did not directly discuss the requested company.

Allowed language:

- "This is adjacent evidence, not a direct view on the stock."
- "The methodology can be transferred cautiously."
- "This supports why the stock belongs on the watchlist, not why it is automatically buyable."

Example:

If the user asks about MRVL and retrieved tweets discuss AI optical modules, custom silicon, data-center capex, or bottleneck components, that is adjacent evidence.

### 3. Inferred Evidence

Use `inferred` when there is no direct or adjacent historical evidence, and the agent is only applying the methodology.

Allowed language:

- "No direct historical view was found."
- "The following is a methodology-based inference."
- "Confidence should be lower because the analyst did not cover this directly."

Forbidden language:

- "The analyst believes..."
- "The analyst would definitely..."
- "This is a core holding / core thesis."

## Citation Rules

Every cited claim must be traceable to one of these sources:

- KOL tweet citation: `[#{n}]`, author, date, and quote.
- Data tool output: source name, as-of date, and metric definition.
- Company filing / press release: company name, filing type or release title, date.
- User-provided context.

Do not cite a tweet for a claim it does not support. A tweet about AI capex cannot support a direct claim that a specific uncovered stock is undervalued.

## Numeric Threshold Rules

The agent must not invent thresholds.

Allowed thresholds:

- A threshold stated in a retrieved KOL tweet.
- A threshold present in the methodology document and backed by evidence.
- A threshold from official company data or a cited external source.
- A threshold explicitly provided by the user.

If no sourced threshold exists, write a qualitative trigger instead:

- Good: "If custom silicon revenue guidance is revised down materially, the thesis weakens."
- Bad: "If custom silicon revenue growth falls below 18%, the thesis is invalidated."

## Confidence Labels

Every answer should label confidence:

- High confidence: direct evidence plus current data.
- Medium confidence: adjacent evidence plus current data.
- Low confidence: methodology-only inference or missing data.

Confidence is about evidence quality, not how exciting the stock story sounds.

## Handling No Direct Coverage

When no direct KOL coverage exists:

1. Say that in the first three sentences.
2. State whether adjacent evidence exists.
3. Downgrade the posture to `watch` unless current data creates a clear, sourced setup.
4. Avoid "buy", "core", "must own", "absolute", "monopoly", or "inevitable".

