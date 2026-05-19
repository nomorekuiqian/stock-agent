"""Guard: holdings_sync must never import the DEAD zones (CLAUDE.md rule 2).

`backend/app/services/` and `backend/app/models/` are dead code. Cheap static
grep so a regression is caught in CI, not review.
"""

import os
import re

_HS_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "app", "features", "holdings_sync",
)
_FORBIDDEN = re.compile(r"^\s*(from|import)\s+app\.(services|models)\b", re.M)


def test_holdings_sync_does_not_import_dead_zones():
    offenders = []
    for fn in os.listdir(_HS_DIR):
        if not fn.endswith(".py"):
            continue
        with open(os.path.join(_HS_DIR, fn), encoding="utf-8") as f:
            if _FORBIDDEN.search(f.read()):
                offenders.append(fn)
    assert not offenders, f"DEAD-zone import in holdings_sync: {offenders}"
