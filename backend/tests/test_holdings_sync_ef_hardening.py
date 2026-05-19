"""Codex adversarial-review [high] fixes — static EF contract guards.

The two hardened paths live in JS Edge Functions (Deno) and a Postgres
function, so they are NOT Python-unit-testable (same boundary note as
test_holdings_sync_reconcile.py). These cheap static guards lock the
contracts so a regression is caught in CI, not after a deploy:

  ① reconcile is ATOMIC — portfolio.js delegates to the single Postgres
     function `reconcile_user_portfolio_source`, and that function is
     serialized by a (user_id, source) pg_advisory_xact_lock. The old
     non-atomic per-row upsert-then-delete dance must NOT be back.
  ② symbol-cache.js is FAIL-CLOSED — a missing EDGE_FUNCTION_SECRET must
     refuse all traffic (500), never fall through to open GET/POST on the
     cross-user shared write cache.
"""

import os
import re

_EF_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "app", "edge_functions",
)
_MIG_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "migrations",
)


def _read(*parts):
    with open(os.path.join(*parts), encoding="utf-8") as f:
        return f.read()


# --------------------------------------------------------------------------- #
# ① reconcile atomicity (Codex [high] #1)
# --------------------------------------------------------------------------- #


def test_portfolio_js_reconcile_delegates_to_atomic_rpc():
    src = _read(_EF_DIR, "portfolio.js")
    assert 'action === "reconcile"' in src
    reconcile = src.split('action === "reconcile"', 1)[1].split(
        'action === "patch"', 1)[0]
    # The reconcile action must call the atomic Postgres function via RPC.
    assert ".rpc(" in reconcile and '"reconcile_user_portfolio_source"' in reconcile, \
        "reconcile must delegate to the atomic reconcile_user_portfolio_source RPC"


def test_portfolio_js_reconcile_has_no_nonatomic_dance():
    """The old multi-step read→loop-upsert→scoped-delete→touch dance (the
    source of the concurrent-interleave data loss) must be gone from the
    reconcile block (bulk may still legitimately use it)."""
    src = _read(_EF_DIR, "portfolio.js")
    reconcile = src.split('action === "reconcile"', 1)[1].split(
        'action === "patch"', 1)[0]
    # No per-row upsert loop, no source-scoped not.in delete inside reconcile.
    assert ".upsert(" not in reconcile, \
        "reconcile must not hand-roll per-row upserts (use the atomic RPC)"
    assert "not.in" not in reconcile, \
        "reconcile must not hand-roll the source-scoped delete (atomic RPC owns it)"


def test_reconcile_sql_function_is_lock_serialized():
    sql = _read(_MIG_DIR, "u0a_portfolio_schema.sql")
    assert "CREATE OR REPLACE FUNCTION reconcile_user_portfolio_source" in sql
    assert "pg_advisory_xact_lock" in sql, \
        "atomic reconcile must serialize concurrent same (user_id,source) commits"
    # empty-set guard preserved at the SQL layer (defense in depth)
    assert "empty rows requires clear_source" in sql
    # P1 columns must NOT appear in the ON CONFLICT SET list (preserved, never
    # taken from import). Scan the upsert SET block only.
    set_block = sql.split("ON CONFLICT (user_id, symbol) DO UPDATE SET", 1)[1] \
        .split("END LOOP", 1)[0]
    for p1 in ("thesis", "target", "stop_loss", "conviction"):
        assert re.search(rf"^\s*{p1}\s*=", set_block, re.M) is None, \
            f"P1 column {p1} must never be SET from the import payload"


def test_reconcile_rpc_not_granted_to_public():
    """Codex M1 re-review [high]: a tenant-write RPC (mutates/clears another
    user's holdings by caller-supplied p_user_id) must NOT be PUBLIC-
    executable. Postgres makes new functions PUBLIC by default, so the
    migration MUST explicitly REVOKE … FROM PUBLIC and must never re-grant
    EXECUTE on it TO PUBLIC."""
    sql = _read(_MIG_DIR, "u0a_portfolio_schema.sql")
    assert re.search(
        r"REVOKE\s+ALL\s+ON\s+FUNCTION\s+reconcile_user_portfolio_source"
        r"\s*\([^)]*\)\s*FROM\s+PUBLIC", sql), \
        "reconcile RPC must explicitly REVOKE ALL … FROM PUBLIC"
    assert re.search(
        r"GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+reconcile_user_portfolio_source"
        r"\s*\([^)]*\)\s*TO\s+PUBLIC", sql) is None, \
        "reconcile RPC must NEVER be GRANTed EXECUTE TO PUBLIC"


# --------------------------------------------------------------------------- #
# ② symbol-cache fail-closed (Codex [high] #2)
# --------------------------------------------------------------------------- #


def test_symbol_cache_is_fail_closed():
    src = _read(_EF_DIR, "symbol-cache.js")
    # Missing secret => hard refuse (500), never open.
    assert "if (!expectedSecret)" in src, \
        "symbol-cache must refuse when EDGE_FUNCTION_SECRET is unset"
    after = src.split("if (!expectedSecret)", 1)[1][:300]
    assert "status: 500" in after, "missing secret must return 500"
    # The old fail-OPEN gate (`if (expectedSecret) {` wrapping the check) is gone.
    assert "if (expectedSecret) {" not in src, \
        "symbol-cache must not fail-open when the secret is unset"
    # Exact-match still enforced when the secret IS set.
    assert "provided !== expectedSecret" in src
