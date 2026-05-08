# Twitter KOL Source Research

Updated: 2026-05-04

Purpose: expand the KOL input universe for `/twitter-digest` with higher-quality U.S. equity, macro, earnings, and technology sources. This is a research shortlist, not an automatic approval list. Add accounts to `backend/app/shared/twitter_kol_config.py` only after manual review of recent posts.

## Selection Criteria

Score candidates on five dimensions:

1. Signal density: posts include data, charts, earnings quotes, reasoning chains, or falsifiable claims.
2. U.S. equity relevance: directly useful for U.S. stocks, macro regime, rates, liquidity, earnings, AI / semis, or valuation.
3. Verifiability: posts link to source data, company filings, earnings calls, public models, or named charts.
4. Cadence: active enough for a 24-36 hour digest window.
5. Risk: lower promotional, political, meme, hindsight, and single-position talking-book risk.

Do not optimize for follower count alone. The digest should prefer accounts that produce machine-curatable evidence.

## Recommended First Batch

These accounts are most aligned with the current prompt quality bar and should be reviewed first.

| Handle | Area | Why Add | Guardrail |
|--------|------|---------|-----------|
| `@charliebilello` | Market charts, cross-asset, valuation | Creative Planning Chief Market Strategist; chart-heavy posts are easy for the LLM to verify and summarize. | Avoid generic asset-return trivia unless tied to current regime. |
| `@LizAnnSonders` | U.S. economy, flows, labor, Schwab strategy | High-cadence macro and market data from Schwab's chief strategist. | Many posts are single-chart updates; require interpretation or surprise vs consensus. |
| `@TimmerFidelity` | Global macro, asset allocation | Fidelity Director of Global Macro; useful for cycle, valuation, and risk appetite context. | May be more strategic than tactical; keep only posts with charts or clear thesis. |
| `@RyanDetrick` | Market history, seasonality, breadth | Carson Chief Market Strategist; good for historical market analogues and investor-friendly context. | Seasonality can become pattern trivia; require concrete relevance. |
| `@callieabost` | Market strategy, investor behavior | Ritholtz Chief Market Strategist; accessible market research for retail readers. | Lower posting cadence during breaks; monitor activity. |
| `@LynAldenContact` | Macro, liquidity, dollar, Bitcoin | Strong macro/liquidity framing with engineering-style explanations. | Crypto weighting is high; classify BTC/ETH under industry `加密`, not stock. |
| `@biancoresearch` | Inflation, rates, fixed income, positioning | Bianco Research has institutional macro pedigree and data-driven fixed income / inflation commentary. | Can be opinionated; require source chart or explicit mechanism. |
| `@FedGuy12` | Fed plumbing, Treasury issuance, liquidity | Former NY Fed trader Joseph Wang; differentiated financial plumbing signal. | Posts can be technical; LLM should explain mechanism in plain Chinese. |
| `@BobEUnlimited` | Macro regime, portfolios, Bridgewater-style analysis | Unlimited Funds CEO/CIO; useful for regime and asset allocation thinking. | Treat fund/product references as promotional unless analysis stands alone. |
| `@SoberLook` | Global macro chart feed | The Daily Shot is a concise macro chart source; useful for daily top-down context. | Often reposts third-party charts; preserve source attribution where visible. |
| `@bespokeinvest` | U.S. market statistics, breadth, sector data | Bespoke is a long-running market research shop with clean market-stat posts. | Prefer factual market stats over premium-service promotion. |
| `@DataTrekMB` | Markets, data, disruption | DataTrek combines daily markets, data, and disruption; useful bridge between macro and tech. | Account represents a firm, not one voice; keep attribution clear. |
| `@TheTranscript_` | Earnings call quotes | High-signal company management quotes from earnings calls; extremely useful for stock and sector buckets. | It is excerpting management speech; do not treat as independent endorsement. |
| `@Quartr_App` | Earnings calls, IR events | First-party company-event access and transcripts; useful as event/source discovery. | Mostly source feed; pair with interpretation from other KOLs when possible. |
| `@SemiAnalysis_` | AI infrastructure, semiconductors | Deep AI/semiconductor supply-chain research; directly relevant to NVDA, AMD, AVGO, TSM, cloud capex. | Potential conflict/commercial research; require hard data and avoid drama. |
| `@dylan522p` | AI infrastructure, semiconductors | Dylan Patel is SemiAnalysis founder/CEO/chief analyst; very high signal on AI compute, GPUs, neoclouds. | Tone can be informal; filter out jokes, replies, and unsourced claims. |
| `@fabknowledge` | Semiconductor investing explainers | Plain-English semiconductor investing and industry primer content. | Some posts are educational rather than daily market-moving; classify as industry. |
| `@Beth_Kindig` | AI / tech growth stocks | I/O Fund lead analyst; useful for AI infrastructure, NVDA, AMD, AVGO, TSM, hyperscaler capex. | Clear talking-book risk; require data, named customer/capex/catalyst, or earnings evidence. |
| `@AswathDamodaran` | Valuation, corporate finance | NYU valuation professor; strong for grounding valuation debates in cash flows and assumptions. | Low daily cadence; keep as quality anchor rather than daily volume source. |

## Second Batch

Add after observing first-batch output quality for 1-2 weeks.

| Handle | Area | Why Consider | Guardrail |
|--------|------|--------------|-----------|
| `@awealthofcs` | Market history, investor behavior | Ben Carlson writes clear long-term market context and investor psychology. | Often evergreen; keep only current-market posts. |
| `@dollarsanddata` | Data-driven investing, household finance | Nick Maggiulli's posts are data-friendly and usually clear. | Personal finance / housing posts may be less relevant to stock digest. |
| `@MebFaber` | Global asset allocation, factors, trend following | Strong cross-asset / factor / allocation perspective. | May be ETF/product oriented; avoid sales-heavy posts. |
| `@EddyElfenbein` | U.S. equities, buy-list style investing | Long-running stock blogger with concise market commentary. | Verify current activity and avoid bare picks without thesis. |
| `@SamRo` | Macro / economy digest | Useful for turning economic data into market context. | Some content duplicates mainstream macro feeds. |
| `@PatrickMoorhead` | Enterprise tech, semis, cloud, AI | Industry analyst with long tech operating background and public-market relevance. | More industry analyst than investor; classify as industry unless ticker-specific. |
| `@DanielTNiles` | Tech investing, semis, market risk | Longtime tech investor and portfolio manager. | Strong position bias; require explicit thesis and risk framing. |
| `@TheStalwart` | Macro, markets, financial journalism | Good for identifying market narratives and macro debate. | News/commentary, not always investment thesis. |
| `@tracyalloway` | Macro, market structure, odd lots | Strong market-structure and macro story discovery. | Similar to journalism; use as topic discovery more than final opinion. |

## Optional High-Risk Bucket

These can surface important fraud / short-thesis signals, but should not be mixed into the normal daily digest without separate labeling.

| Handle | Area | Why Consider | Guardrail |
|--------|------|--------------|-----------|
| `@muddywatersre` | Activist short research | Known for forensic short reports and accounting allegations. | Always label as short seller / conflicted source; require source report link. |
| `@KerrisdaleCap` | Activist long/short research | Publishes long/short theses on public companies. | Treat as position advocacy, not neutral analysis. |
| `@John_Hempton` | Short selling, fraud detection | Bronte Capital founder; useful for forensic skepticism. | Verify current account activity and avoid personality disputes. |

Do not add `@HindenburgRes` as an active source. Hindenburg Research announced it was shutting down in January 2025 after finishing its pipeline of work.

## Suggested Rollout

1. Add 10-12 accounts first: `@charliebilello`, `@LizAnnSonders`, `@TimmerFidelity`, `@RyanDetrick`, `@LynAldenContact`, `@biancoresearch`, `@FedGuy12`, `@SoberLook`, `@TheTranscript_`, `@SemiAnalysis_`, `@dylan522p`, `@Beth_Kindig`.
2. Run `fetch-configured-kols` for 3-5 business days without sending to users.
3. Generate daily digests with `persist=false` and manually grade:
   - evidence quality
   - duplicate topics
   - promotional leakage
   - Chinese translation quality
   - bucket correctness
4. Add `@DataTrekMB`, `@bespokeinvest`, `@Quartr_App`, `@fabknowledge`, and `@AswathDamodaran` if first batch is too macro-light or too AI-heavy.
5. Keep short sellers in a separate watchlist until the UI can label conflicts and position bias.

## Prompt / Pipeline Notes

- The current quality gate is suitable for these sources, but add one more prompt rule before onboarding short sellers: "If the account has a disclosed long/short position, include that conflict in `tldr_zh` when visible in the tweet."
- For earnings feeds such as `@TheTranscript_`, the LLM should distinguish "management said" from "KOL believes".
- For `@SemiAnalysis_`, `@dylan522p`, and `@Beth_Kindig`, increase protection against AI-capex duplicate clustering. Same ticker + same KOL dedup is not enough; multiple KOLs may all cover the same NVDA / hyperscaler capex story.
- For chart accounts, require the TLDR to mention the chart's axis / metric / time window. Otherwise chart posts degrade into vague macro statements.

## Sources

- Charlie Bilello profile, Creative Planning: https://creativeplanning.com/team/charlie-bilello/
- Ryan Detrick profile, Carson Group / Carson Wealth: https://www.carsonwealth.com/team-members/ryan-detrick/
- Callie Cox profile, Ritholtz: https://www.ritholtzwealth.com/team/callie-cox
- Callie Cox MoneyShow profile with X handle: https://www.moneyshow.com/expert/D185B9F725504E648AA6C18F6156F9B7/
- Lyn Alden official site and X profile: https://www.lynalden.com/ and https://x.com/LynAldenContact
- Aswath Damodaran NYU Stern profile and X profile: https://www.stern.nyu.edu/faculty/bio/aswath-damodaran and https://x.com/aswathdamodaran
- Ben Carlson / A Wealth of Common Sense contact page: https://awealthofcommonsense.com/contact/
- Nick Maggiulli / Of Dollars And Data about page: https://ofdollarsanddata.com/about/
- Bianco Research official profile and X references: https://www.biancoresearch.com/visitor-home/ and https://x.com/biancoresearch/articles
- Joseph Wang profile: https://www.finnotes.org/people/joseph-wang
- Bob Elliott / Unlimited Funds macro webinars: https://unlimitedfunds.com/macro-webinars/
- The Daily Shot overview and X terms: https://thedailyshot.com/overview-of-the-daily-shot/ and https://thedailyshot.com/terms-of-use/
- DataTrek Research about page: https://datatrekresearch.com/about/
- Bespoke Investment Group bios: https://www.bespokepremium.com/about/bios/
- The Transcript X profile and Substack reference: https://twstalker.com/TheTranscript_ and https://thetranscript.substack.com/
- Quartr platform and App Store listing: https://quartr.com/ and https://apps.apple.com/us/app/quartr-investment-insights/id1552412128
- Dylan Patel / SemiAnalysis profile and Substack: https://semianalysis.com/dylan-patel/ and https://newsletter.semianalysis.com/
- Fabricated Knowledge about page: https://www.fabricatedknowledge.com/about
- Beth Kindig / I/O Fund profile and Twitter page: https://io-fund.com/beth-kindig and https://io-fund.com/twitter
- Dan Niles CNBC profile: https://www.cnbc.com/dan-niles/
- Patrick Moorhead profile: https://moorinsightsstrategy.com/team/patrick-moorhead/
- Carson Block / Muddy Waters references: https://www.finnotes.org/people/carson-block and https://www.cnbc.com/2021/03/10/muddy-waters-carson-block-defends-short-selling-as-pretty-american.html
- Kerrisdale Twitter disclaimer: https://www.kerrisdalecap.com/gsat-twitter-disclaimer/
- Hindenburg closure, CNBC: https://www.cnbc.com/2025/01/15/hindenburg-research-founder-says-hes-closing-short-seller-research-shop.html
