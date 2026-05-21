# qinbafrank Retail V2 Framework

Status: draft, not loaded by the current persona registry.

This folder is a productized re-distillation of the existing qinbafrank methodology. It does not replace the current `methodologies/qinbafrank/` output. The goal is to turn the existing "how the analyst thinks" framework into a retail-user decision framework that is useful, bounded, and evidence-aware.

## Why This Exists

The current methodology captures qinbafrank's macro and industry thinking well, but it tends to produce long narrative answers. For retail users, a good answer must do more than explain why a stock is interesting. It must help the user decide what to do next:

- Is this a stock to avoid, watch, hold, or only consider after a reset?
- Is the current setup a story, an investable thesis, or a high-expectation trap?
- What evidence is direct, adjacent, or inferred?
- Which data points would prove the thesis wrong?
- What should a retail user track before taking action?

## Framework Files

- `evidence-policy.md` — evidence hierarchy and citation rules.
- `applicability-boundaries.md` — what the methodology can and cannot infer.
- `retail-decision-framework.md` — default decision postures for retail users.
- `lens-stock-retail.md` — stock-specific retail lens.
- `lens-ai-infrastructure-retail.md` — AI infrastructure retail lens.
- `response-contract.md` — expected answer structure for the agent.
- `system-prompt-overlay.md` — draft prompt block to layer into `kol_research`.
- `eval-cases.md` — regression cases for MRVL and other stock questions.

## Core Change From V1

V1 asks: "How would qinbafrank analyze this?"

V2 asks: "Using qinbafrank's methodology, what decision-quality information can a retail user safely extract from this?"

The difference matters. A stock can have a strong industry story and still be a poor retail entry because valuation, expectations, timing, or evidence quality are weak.

## Default Product Standard

Every answer should give the user:

1. A decision posture: avoid, watch, hold, small position, add only on pullback, or reduce risk.
2. Evidence classification: direct, adjacent, inferred.
3. The strongest bull case and the strongest bear case.
4. The next validation window.
5. Three to five concrete metrics to track.
6. A falsifiability trigger with sourced thresholds only.
7. A position-size caution matched to evidence quality.

If the agent cannot produce those elements from available evidence, it should say so clearly instead of filling space with narrative.

