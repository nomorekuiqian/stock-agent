"""holdings_sync CSV broker registry + generic column mapping — lands in M3.

Deterministic, NEVER calls the LLM (design §3.6). locale-ambiguous single-
separator integer-ish values must be flagged needs_review, never silently
guessed 1000x (§7bis.5).
"""
