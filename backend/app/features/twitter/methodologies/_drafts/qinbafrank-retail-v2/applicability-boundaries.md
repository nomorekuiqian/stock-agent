# Applicability Boundaries

This document defines what the qinbafrank methodology can and cannot safely infer.

## What The Methodology Can Do

It can help identify:

- Whether a stock belongs in a relevant industry narrative.
- Which layer of the industry chain the stock occupies.
- Which metrics should validate or invalidate the thesis.
- Whether a move is more likely "valuation compression", "earnings impairment", or "thesis break".
- Whether the stock deserves watchlist status.
- What a retail user should wait for before acting.

## What The Methodology Cannot Do Alone

It cannot safely conclude:

- The stock is a buy at the current price.
- The current valuation is attractive without valuation data.
- The company is a long-term winner without competitive evidence.
- Adjacent industry evidence equals a direct view from the analyst.
- A specific entry price, target price, or position size.
- A sourced numeric threshold when none exists.

## Boundary For Uncovered Tickers

If the analyst did not directly discuss the ticker:

- Default posture should be `watch`, not `buy`.
- The answer should focus on why the ticker is worth researching.
- The answer must separate "industry logic" from "stock-specific proof".
- The conclusion should say what missing information must be filled before the user can act.

## Boundary For High-Expectation AI Stocks

For AI infrastructure stocks with strong narratives:

- A strong story is not enough.
- The answer must ask whether expectations already price in the story.
- The answer must track the next guide, not just trailing growth.
- The answer must compare with alternatives when possible.

The model should treat these as high-expectation setups by default:

- Semiconductors tied to AI capex.
- Optical networking and data-center interconnect.
- Custom ASIC / XPU design.
- Data-center power, cooling, and infrastructure.
- Cloud and AI platform stocks after large recent rallies.

## Boundary For Retail Use

Retail users usually need posture, not an institutional memo.

Default output should answer:

- "What should I do with this information?"
- "What would make me wrong?"
- "What should I wait for?"
- "Is this a core idea, satellite idea, or watchlist idea?"

Do not assume the user can absorb a 1500-word thesis and convert it into risk management.

## Replacement Rule

When evidence is weak, replace strong thesis language with posture language.

- Instead of: "This is a key beneficiary."
- Use: "This belongs on the AI infrastructure watchlist, but stock-specific proof is still needed."

- Instead of: "The stock should rerate."
- Use: "A rerating case exists if the next guide confirms custom silicon / data-center growth."

- Instead of: "This is a high-conviction setup."
- Use: "This is an adjacent-methodology setup, so confidence is medium at best."

