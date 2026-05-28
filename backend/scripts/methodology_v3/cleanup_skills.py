"""
One-off cleanup pass on v3 skill md files.

1. Remove the "## 输出模板" section from sector/*.md and ticker/*.md (the
   answer skeleton has moved to framework/*.md).
2. Replace academic vocabulary with the agreed Chinese alternatives:
     "falsifiability"  -> "打脸条件"
     "Falsifiability"  -> "打脸条件"
     "可证伪锚"        -> "打脸条件"
     "可证伪句式"      -> "打脸条件句式"
     "可证伪判断"      -> "打脸条件"
   Heading line "## 可证伪句式" is renamed to "## 打脸条件".
3. Reports a diff summary at the end.
"""

from __future__ import annotations

import re
from pathlib import Path

V3_ROOT = (
    Path(__file__).resolve().parents[2]
    / "app" / "features" / "twitter"
    / "methodologies" / "_drafts"
    / "qinbafrank-skill-v3"
)


def remove_output_template(text: str) -> tuple[str, bool]:
    """Drop the '## 输出模板' section (up to next ## or end)."""
    marker = "\n## 输出模板"
    if marker not in text:
        return text, False
    idx = text.find(marker)
    rest = text[idx + 1 :]
    next_h2 = re.search(r"\n##\s", rest)
    if next_h2:
        end = idx + 1 + next_h2.start() + 1
        return text[:idx] + text[end:], True
    # output template was the last section
    return text[:idx].rstrip() + "\n", True


# Replacement order matters: longer patterns first.
TEXT_REPLACEMENTS: list[tuple[str, str]] = [
    ("## 可证伪句式", "## 打脸条件"),
    ("## 可证伪锚", "## 打脸条件"),
    ("falsifiability 锚", "打脸条件"),
    ("Falsifiability 锚", "打脸条件"),
    ("falsifiability 判断", "打脸条件"),
    ("可证伪判断", "打脸条件"),
    ("可证伪锚", "打脸条件"),
    ("可证伪条件", "打脸条件"),
    ("falsifiability", "打脸条件"),
    ("Falsifiability", "打脸条件"),
    # "可证伪句式" without ## prefix
    ("可证伪句式", "打脸条件"),
    # "可证伪" as a standalone term (verb-like usage)
    # — only replace when it stands alone (not part of "可证伪性" or original quote phrases)
    # Use a careful regex
]


def apply_text_replacements(text: str) -> tuple[str, int]:
    n = 0
    for old, new in TEXT_REPLACEMENTS:
        if old in text:
            n += text.count(old)
            text = text.replace(old, new)
    # Handle standalone "可证伪" that isn't part of "可证伪性" or "证伪 X":
    # only replace when followed by punctuation / whitespace / end.
    # Skip: keep "证伪 (X 的)" patterns intact as they're often within quoted body.
    return text, n


def process_file(path: Path) -> dict:
    original = path.read_text(encoding="utf-8")
    text = original

    text, removed_template = remove_output_template(text)
    text, replacements = apply_text_replacements(text)

    if text != original:
        path.write_text(text, encoding="utf-8")
    return {
        "path": str(path.relative_to(V3_ROOT)),
        "removed_template": removed_template,
        "replacements": replacements,
        "changed": text != original,
    }


def main() -> None:
    targets: list[Path] = []
    for sub in ("ticker", "sector", "core", "macro"):
        sub_dir = V3_ROOT / sub
        if sub_dir.is_dir():
            targets.extend(sorted(sub_dir.glob("*.md")))

    total_removed_template = 0
    total_replacements = 0
    changed_files = 0
    for path in targets:
        result = process_file(path)
        if result["removed_template"]:
            total_removed_template += 1
        if result["replacements"]:
            total_replacements += result["replacements"]
        if result["changed"]:
            changed_files += 1
            marks = []
            if result["removed_template"]:
                marks.append("template")
            if result["replacements"]:
                marks.append(f"{result['replacements']} repls")
            print(f"  ✓ {result['path']:50s} {' / '.join(marks)}")

    print()
    print(f"Files changed: {changed_files}")
    print(f"Files with '## 输出模板' removed: {total_removed_template}")
    print(f"Total falsifiability/可证伪 replacements: {total_replacements}")


if __name__ == "__main__":
    main()
