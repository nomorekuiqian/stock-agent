"""
Produce compact one-line-per-tweet views of every slice for efficient reading.

Each line:  <tweet_id> | <yyyy-mm-dd> | <content_type> | <key_claim> | <text snippet>

Output: <draft>/evidence/compact/<slice_name>.txt
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from app.core.logging import get_logger
from app.features.twitter.methodology_v3.personas import get_persona

logger = get_logger(__name__)

MAX_TEXT = 280


def _evidence_dir(draft_dir: str) -> Path:
    return (
        Path(__file__).resolve().parents[1]
        / "methodologies" / "_drafts"
        / draft_dir / "evidence"
    )


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


def run(persona_key: str) -> None:
    cfg = get_persona(persona_key)
    evidence_dir = _evidence_dir(cfg["draft_dir"])
    slices_dir = evidence_dir / "slices"
    compact_dir = evidence_dir / "compact"
    compact_dir.mkdir(exist_ok=True)

    for slice_path in sorted(slices_dir.glob("*.jsonl")):
        out_path = compact_dir / (slice_path.stem + ".txt")
        with slice_path.open(encoding="utf-8") as src, out_path.open(
            "w", encoding="utf-8"
        ) as dst:
            count = 0
            for line in src:
                t = json.loads(line)
                dst.write(compact_line(t) + "\n")
                count += 1
        logger.info("  %s: %s lines", slice_path.name, count)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--persona-key",
        default="qinbafrank-skill-v3",
        help="Persona key from methodology_v3/personas.py",
    )
    args = parser.parse_args()
    run(args.persona_key)


if __name__ == "__main__":
    main()
