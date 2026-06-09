"""
Evidence audit for v3 skill md files.

Verifies every tweet_id referenced in skill md files actually exists in
all-tweets.jsonl. Prints a report of missing or mismatched references.

Run:
    cd backend && source venv/bin/activate
    python -m app.features.twitter.methodology_v3.evidence_audit
    python -m app.features.twitter.methodology_v3.evidence_audit --persona-key serenity-skill-v1
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from app.core.logging import get_logger
from app.features.twitter.methodology_v3.personas import get_persona

logger = get_logger(__name__)

# Tweet ID format: 18-19 digit integer
TWEET_ID_RE = re.compile(r"\b(\d{18,19})\b")


def _v3_root(draft_dir: str) -> Path:
    return (
        Path(__file__).resolve().parents[1]
        / "methodologies" / "_drafts"
        / draft_dir
    )


def load_corpus_ids(v3_root: Path) -> set[str]:
    ids = set()
    with (v3_root / "evidence" / "all-tweets.jsonl").open(encoding="utf-8") as f:
        for line in f:
            t = json.loads(line)
            ids.add(t["tweet_id"])
    return ids


def run(persona_key: str) -> None:
    cfg = get_persona(persona_key)
    v3_root = _v3_root(cfg["draft_dir"])
    corpus_ids = load_corpus_ids(v3_root)
    logger.info("[%s] Corpus: %s tweet_ids loaded", persona_key, len(corpus_ids))

    total_refs = 0
    missing_refs = 0
    files_with_missing: dict[str, list[str]] = {}

    for path in sorted(v3_root.rglob("*.md")):
        if "evidence/" in str(path) or "eval/" in str(path):
            continue
        content = path.read_text(encoding="utf-8")
        ids_in_file = set(TWEET_ID_RE.findall(content))
        if not ids_in_file:
            continue
        rel = path.relative_to(v3_root)
        missing = ids_in_file - corpus_ids
        total_refs += len(ids_in_file)
        if missing:
            missing_refs += len(missing)
            files_with_missing[str(rel)] = sorted(missing)
            logger.info(
                "  %s %s: %s refs, %s missing",
                "✗",
                rel,
                len(ids_in_file),
                len(missing),
            )
        else:
            logger.info(
                "  %s %s: %s refs all valid",
                "✓",
                rel,
                len(ids_in_file),
            )

    logger.info("")
    logger.info("Total references: %s", total_refs)
    logger.info("Missing references: %s", missing_refs)

    audit_out = {
        "persona_key": persona_key,
        "corpus_size": len(corpus_ids),
        "total_references": total_refs,
        "missing_references": missing_refs,
        "files_with_missing": files_with_missing,
    }
    (v3_root / "eval").mkdir(exist_ok=True)
    (v3_root / "eval" / "evidence-audit.json").write_text(
        json.dumps(audit_out, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    logger.info("Wrote audit to %s", v3_root / "eval" / "evidence-audit.json")


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
