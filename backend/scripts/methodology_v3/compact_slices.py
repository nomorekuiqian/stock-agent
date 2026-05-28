"""
Produce compact one-line-per-tweet views of every slice for efficient reading.

Each line:  <tweet_id> | <yyyy-mm-dd> | <content_type> | <key_claim> | <text snippet 240ch>

Output: _distillation_artifacts/qinbafrank-skill-v3/evidence/compact/<slice_name>.txt
"""

from __future__ import annotations

import json
from pathlib import Path

# Both slices/ and compact/ live in the gitignored artifacts dir (large outputs).
ARTIFACTS_EVIDENCE_DIR = (
    Path(__file__).resolve().parents[2]
    / "app" / "features" / "twitter"
    / "_distillation_artifacts"
    / "qinbafrank-skill-v3" / "evidence"
)
SLICES_DIR = ARTIFACTS_EVIDENCE_DIR / "slices"
COMPACT_DIR = ARTIFACTS_EVIDENCE_DIR / "compact"

MAX_TEXT = 280


def compact_line(t: dict) -> str:
    tid = t["tweet_id"]
    created = (t.get("created_at") or "")[:10]
    sym = t.get("symbols") or {}
    ct = sym.get("content_type") or "?"
    claim = (sym.get("key_claim") or "").replace("\n", " ").replace("|", "/")
    text = (t.get("text") or "").replace("\n", " ").replace("|", "/")
    if len(text) > MAX_TEXT:
        text = text[:MAX_TEXT] + "..."
    return f"{tid} | {created} | {ct:18s} | {claim[:120]:120s} | {text}"


def main() -> None:
    COMPACT_DIR.mkdir(exist_ok=True)
    for slice_path in sorted(SLICES_DIR.glob("*.jsonl")):
        out_path = COMPACT_DIR / (slice_path.stem + ".txt")
        with slice_path.open(encoding="utf-8") as src, out_path.open(
            "w", encoding="utf-8"
        ) as dst:
            count = 0
            for line in src:
                t = json.loads(line)
                dst.write(compact_line(t) + "\n")
                count += 1
        print(f"  {slice_path.name}: {count} lines")


if __name__ == "__main__":
    main()
