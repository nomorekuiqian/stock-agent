"""holdings_sync ADK LLM extraction (vision + paste text) — lands in M2.

Model is FIXED to gemini-3.1-flash-lite-preview (design §5: cheapest Gemini-3
multimodal tier; NOT pro). PoC hard constraint (RESULTS.md): the response
schema sent to Gemini MUST NOT carry `maxItems` together with multiple
nullable numeric fields (returns 400) — emit an explicit nullable schema
WITHOUT maxItems and enforce the 60 cap post-parse in code.

Reference implementation proven in backend/scripts/holdings_sync_poc/extract.py.
"""

MODEL = "gemini-3.1-flash-lite-preview"  # do not change to pro (design §5)
