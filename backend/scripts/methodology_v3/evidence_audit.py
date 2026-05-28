"""
Evidence audit for v3 skill md files.

Verifies every tweet_id referenced in skill md files actually exists in
all-tweets.jsonl. Prints a report of missing or mismatched references.

Run:
    cd backend && source venv/bin/activate
    python -m app.features.twitter.methodology_v3.evidence_audit
"""

from __future__ import annotations

import json
import re
from pathlib import Path

# Production V3 root (sector/, ticker/, etc. with embedded tweet_id refs).
V3_ROOT = (
    Path(__file__).resolve().parents[2]
    / "app" / "features" / "twitter"
    / "methodologies" / "_drafts"
    / "qinbafrank-skill-v3"
)
# Artifacts root: source corpus + eval outputs (gitignored).
ARTIFACTS_ROOT = (
    Path(__file__).resolve().parents[2]
    / "app" / "features" / "twitter"
    / "_distillation_artifacts"
    / "qinbafrank-skill-v3"
)

# Tweet ID format: 19-digit integer
TWEET_ID_RE = re.compile(r"\b(\d{18,19})\b")


def load_corpus_ids() -> set[str]:
    ids = set()
    with (ARTIFACTS_ROOT / "evidence" / "all-tweets.jsonl").open(encoding="utf-8") as f:
        for line in f:
            t = json.loads(line)
            ids.add(t["tweet_id"])
    return ids


def main() -> None:
    corpus_ids = load_corpus_ids()
    print(f"Corpus: {len(corpus_ids)} tweet_ids loaded")

    total_refs = 0
    missing_refs = 0
    files_with_missing: dict[str, list[str]] = {}

    for path in sorted(V3_ROOT.rglob("*.md")):
        if "evidence/" in str(path) or "eval/" in str(path):
            continue
        content = path.read_text(encoding="utf-8")
        ids_in_file = set(TWEET_ID_RE.findall(content))
        if not ids_in_file:
            continue
        rel = path.relative_to(V3_ROOT)
        missing = ids_in_file - corpus_ids
        total_refs += len(ids_in_file)
        if missing:
            missing_refs += len(missing)
            files_with_missing[str(rel)] = sorted(missing)
            print(f"  ✗ {rel}: {len(ids_in_file)} refs, {len(missing)} missing")
        else:
            print(f"  ✓ {rel}: {len(ids_in_file)} refs all valid")

    print()
    print(f"Total references: {total_refs}")
    print(f"Missing references: {missing_refs}")

    audit_out = {
        "corpus_size": len(corpus_ids),
        "total_references": total_refs,
        "missing_references": missing_refs,
        "files_with_missing": files_with_missing,
    }
    (ARTIFACTS_ROOT / "eval").mkdir(parents=True, exist_ok=True)
    (ARTIFACTS_ROOT / "eval" / "evidence-audit.json").write_text(
        json.dumps(audit_out, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"Wrote audit to {ARTIFACTS_ROOT / 'eval' / 'evidence-audit.json'}")


if __name__ == "__main__":
    main()
