"""
Architecture Constraint Tests -- mechanical enforcement of codebase invariants.

Inspired by OpenAI's harness engineering: "enforce invariants rather than
micromanage implementation." These tests replace documentation-level rules
with CI-level gates that catch violations automatically.

Rules enforced:
  1. No imports from dead code (app.services.*, app.models.*)
  2. No cross-feature direct imports (features/A must not import features/B internals)
  3. No print() in production code (use get_logger(__name__) instead)
  4. No f-string logging (use %s lazy formatting)
  5. Feature modules follow standard structure

Usage:
    cd backend
    pytest tests/test_architecture.py -v
"""

import ast
from pathlib import Path

import pytest

# Project root paths
BACKEND_DIR = Path(__file__).parent.parent
APP_DIR = BACKEND_DIR / "app"
FEATURES_DIR = APP_DIR / "features"
SHARED_DIR = APP_DIR / "shared"
CORE_DIR = APP_DIR / "core"


def _collect_python_files(*dirs: Path) -> list[Path]:
    """Collect all .py files under given directories, excluding __pycache__."""
    files = []
    for d in dirs:
        if not d.exists():
            continue
        for py_file in d.rglob("*.py"):
            if "__pycache__" in str(py_file):
                continue
            files.append(py_file)
    return files


def _parse_imports(filepath: Path) -> list[tuple[int, str]]:
    """Parse a Python file and return (line_number, module_path) for all imports."""
    try:
        source = filepath.read_text(encoding="utf-8")
        tree = ast.parse(source, filename=str(filepath))
    except (SyntaxError, UnicodeDecodeError):
        return []

    imports = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                imports.append((node.lineno, alias.name))
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                imports.append((node.lineno, node.module))
    return imports


def _find_print_calls(filepath: Path) -> list[tuple[int, str]]:
    """Find all print() calls in a Python file. Returns (line_number, line_text)."""
    try:
        source = filepath.read_text(encoding="utf-8")
        tree = ast.parse(source, filename=str(filepath))
    except (SyntaxError, UnicodeDecodeError):
        return []

    calls = []
    for node in ast.walk(tree):
        if (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Name)
            and node.func.id == "print"
        ):
            lines = source.splitlines()
            line_text = lines[node.lineno - 1].strip() if node.lineno <= len(lines) else ""
            calls.append((node.lineno, line_text))
    return calls


def _find_fstring_logging(filepath: Path) -> list[tuple[int, str]]:
    """Find logger calls using f-strings instead of %s lazy formatting.

    Detects patterns like: logger.info(f"..."), logger.error(f"...")
    Should use: logger.info("message %s", var) instead.
    """
    try:
        source = filepath.read_text(encoding="utf-8")
        tree = ast.parse(source, filename=str(filepath))
    except (SyntaxError, UnicodeDecodeError):
        return []

    violations = []
    log_methods = {"debug", "info", "warning", "error", "exception", "critical", "log"}

    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        # Match logger.info(...), logger.error(...), etc.
        if not (isinstance(node.func, ast.Attribute) and node.func.attr in log_methods):
            continue
        # Check if first positional arg is an f-string
        if node.args and isinstance(node.args[0], ast.JoinedStr):
            lines = source.splitlines()
            line_text = lines[node.lineno - 1].strip() if node.lineno <= len(lines) else ""
            violations.append((node.lineno, line_text))
    return violations


def _get_feature_name(filepath: Path) -> str | None:
    """Extract the feature name from a file path under features/."""
    try:
        rel = filepath.relative_to(FEATURES_DIR)
        return rel.parts[0] if rel.parts else None
    except ValueError:
        return None


# =============================================================================
# Test: No Dead Code Imports
# =============================================================================

class TestNoDeadCodeImports:
    """
    RULE: Active code must never import from app.services.* or app.models.*
    These are pre-refactor dead code directories.

    FIX: Active code lives in app/features/ and app/shared/.
    - Database operations: app.features.<module>.db
    - Business logic: app.features.<module>.service
    - Pydantic models: app.features.<module>.models
    - Shared utilities: app.shared.*
    """

    FORBIDDEN_PREFIXES = ("app.services", "app.models")
    SCAN_DIRS = (FEATURES_DIR, SHARED_DIR, CORE_DIR)

    def test_no_imports_from_dead_code(self):
        violations = []
        for py_file in _collect_python_files(*self.SCAN_DIRS):
            for lineno, module in _parse_imports(py_file):
                if any(module.startswith(prefix) for prefix in self.FORBIDDEN_PREFIXES):
                    rel_path = py_file.relative_to(BACKEND_DIR)
                    violations.append(
                        f"  {rel_path}:{lineno} imports '{module}'\n"
                        f"    FIX: Use app.features.<module>.models or app.shared.* instead"
                    )

        assert not violations, (
            "Dead code import violations found.\n"
            "app.services.* and app.models.* are pre-refactor legacy code.\n"
            "Active code lives in app/features/ and app/shared/.\n\n"
            + "\n".join(violations)
        )


# =============================================================================
# Test: No Cross-Feature Direct Imports
# =============================================================================

class TestNoCrossFeatureImports:
    """
    RULE: features/A must not directly import from features/B's internal modules.
    Cross-feature communication should go through app.shared.* or be explicitly
    allowed via router-level composition.

    Allowed exceptions:
    - Importing from another feature's models.py (type references are OK)
    - notification/ can import from other features (it orchestrates broadcasts)
    - subscription/ can import email_service cross-feature (shared email infra)
    """

    # Features allowed to import from other features broadly
    # These are orchestrator modules that compose multiple features by design
    ORCHESTRATOR_FEATURES = {
        "notification",      # email broadcast orchestration
        "morning_report",    # composes stock + macro data
        "daily_report",      # composes macro data
        "subscription",      # email service orchestrates brew/daily_report/payment
        "admin",             # admin CRM surfaces user state across payment/etc by design
        "for_you",           # action_bar aggregates digest + portfolio + health
    }

    # Specific allowed cross-feature imports (importer_feature, imported_feature)
    ALLOWED_PAIRS = {
        ("brew", "stock"),              # brew uses stock data
        ("stock", "macro"),             # stock page shows macro risk context
        ("screener", "daily_report"),   # screener references market report data
        ("screener", "macro"),          # research agent reads macro risk/liquidity data
        ("screener", "morning_report"), # research agent reads morning report data
        ("invites", "payment"),         # invites check payment/subscription status
        ("invites", "subscription"),    # invites sends welcome email via email_service
        ("macro", "subscription"),      # weekly report triggers email via subscription
        ("payment", "subscription"),    # entitlements webhook syncs Resend segments
        ("brew", "subscription"),       # brew trial activation subscribes user to emails
        ("screener", "brew"),           # research agent reads user watchlist from brew.db
        ("screener", "quota"),          # research endpoints check/consume quota
        ("quota", "payment"),           # quota checks Max subscription status
        ("twitter_digest", "subscription"),  # /preview endpoint reuses email html renderer
        ("twitter_digest", "twitter"),  # KOL list source for digest curation
        ("twitter_digest", "payment"),  # /latest endpoint gated by entitlement check
        ("brew", "payment"),            # digest model tier gated by entitlement check
        ("brew", "portfolio"),          # brew reads user portfolio/profile for personalization
        ("brew", "portfolio_health"),   # brew reads last health check timestamp for action_context
        ("portfolio", "payment"),       # portfolio router checks entitlements
        ("notification", "for_you"),    # notification preferences checks action bar severity
        ("notification", "portfolio"),  # notification preferences reads user profile
        ("portfolio_health", "portfolio"),   # health check reads portfolio data
        ("portfolio_health", "macro"),       # health check reads macro risk data
        ("memory", "portfolio"),             # memory reads portfolio theses
        ("holdings_sync", "portfolio"),      # Track M writes user_portfolios ONLY via portfolio.db (single-owner) + reuses compute_effective_weights
        ("holdings_sync", "flags"),          # Track M extract/commit gated by holdings_sync_import flag
        ("holdings_sync", "payment"),        # Track M Pro-and-above entitlement gate (mirrors portfolio)
        # KOL persona research agent — composes screener (conversation persistence,
        # research_agent tool primitives), daily_report (preload recent reports),
        # and flags (admin gating) by design.
        ("kol_research", "screener"),
        ("kol_research", "daily_report"),
        ("kol_research", "flags"),
        # agent_runtime is the shared runtime layer (session store, context
        # engine, durable events). The chat-style features depend on it; it
        # also reads picker_conversations as a migration-period fallback.
        ("kol_research", "agent_runtime"),
        ("screener", "agent_runtime"),
        ("agent_runtime", "screener"),
        # Onboarding state lives on subscriptions table (payment.db) +
        # cron entrypoint delegates to subscription.lifecycle_scheduler.
        ("onboarding", "payment"),
        ("onboarding", "subscription"),
        # Vector RAG pipeline resolves which KOLs to embed from the twitter
        # feature's enabled-KOL source (vector/kol_tweets.py::_resolve_usernames).
        # Same data-read pattern as twitter_digest->twitter. (Latent gap on
        # master surfaced when rebasing this branch onto the vector feature.)
        ("vector", "twitter"),
    }

    def test_no_cross_feature_imports(self):
        violations = []
        for py_file in _collect_python_files(FEATURES_DIR):
            source_feature = _get_feature_name(py_file)
            if not source_feature:
                continue

            # Skip orchestrator features
            if source_feature in self.ORCHESTRATOR_FEATURES:
                continue

            for lineno, module in _parse_imports(py_file):
                if not module.startswith("app.features."):
                    continue

                # Extract target feature name
                parts = module.replace("app.features.", "").split(".")
                target_feature = parts[0] if parts else None

                if not target_feature or target_feature == source_feature:
                    continue

                # Allow importing models (type references)
                if len(parts) > 1 and parts[-1] == "models":
                    continue

                # Check allowed pairs
                if (source_feature, target_feature) in self.ALLOWED_PAIRS:
                    continue

                rel_path = py_file.relative_to(BACKEND_DIR)
                violations.append(
                    f"  {rel_path}:{lineno} (feature '{source_feature}') imports '{module}'\n"
                    f"    FIX: Move shared logic to app.shared.*, or import only .models for types"
                )

        assert not violations, (
            "Cross-feature import violations found.\n"
            "Features should communicate through app.shared.* or router-level composition.\n"
            "Importing another feature's .models is OK (type references).\n\n"
            + "\n".join(violations)
        )


# =============================================================================
# Test: No print() in Production Code
# =============================================================================

class TestNoPrintStatements:
    """
    RULE: Production code must use structured logging, not print().

    FIX: Replace print() with:
        from app.core.logging import get_logger
        logger = get_logger(__name__)
        logger.info("%s", value)    # Use %s lazy formatting, NOT f-strings
    """

    SCAN_DIRS = (FEATURES_DIR, SHARED_DIR, CORE_DIR)

    def test_no_print_in_production_code(self):
        violations = []
        for py_file in _collect_python_files(*self.SCAN_DIRS):
            for lineno, line_text in _find_print_calls(py_file):
                rel_path = py_file.relative_to(BACKEND_DIR)
                violations.append(
                    f"  {rel_path}:{lineno} {line_text}\n"
                    f"    FIX: from app.core.logging import get_logger; "
                    f"logger = get_logger(__name__); logger.info(\"%s\", value)"
                )

        assert not violations, (
            "print() found in production code.\n"
            "Use structured logging: get_logger(__name__) from app.core.logging.\n"
            "Use %s lazy formatting, NOT f-strings.\n\n"
            + "\n".join(violations)
        )


# =============================================================================
# Test: No f-string Logging
# =============================================================================

class TestNoFstringLogging:
    """
    RULE: Logger calls must use %s lazy formatting, not f-strings.

    BAD:  logger.info(f"Processing {symbol}")
    GOOD: logger.info("Processing %s", symbol)

    Why: f-strings evaluate immediately even if the log level is disabled.
    %s formatting is lazy -- the string is only built if the message is emitted.

    FIX: Replace logger.info(f"msg {var}") with logger.info("msg %s", var)
    """

    SCAN_DIRS = (FEATURES_DIR, SHARED_DIR, CORE_DIR)

    def test_no_fstring_in_logging(self):
        violations = []
        for py_file in _collect_python_files(*self.SCAN_DIRS):
            for lineno, line_text in _find_fstring_logging(py_file):
                rel_path = py_file.relative_to(BACKEND_DIR)
                violations.append(
                    f"  {rel_path}:{lineno} {line_text}\n"
                    f"    FIX: Use logger.xxx(\"%s ...\", var) instead of f-string"
                )

        assert not violations, (
            "f-string logging found in production code.\n"
            "Use %s lazy formatting: logger.info(\"message %s\", var)\n"
            "f-strings evaluate immediately even when log level is disabled.\n\n"
            + "\n".join(violations)
        )


# =============================================================================
# Test: Feature Module Standard Structure
# =============================================================================

class TestFeatureModuleStructure:
    """
    RULE: Every feature module should have at minimum:
    - router.py (API endpoints) OR agent.py (AI agent)
    - .context.md (module documentation)

    FIX: Create missing files following the pattern in existing features.
    See backend/app/features/daily_report/ for a complete example.
    """

    REQUIRED_FILES = [".context.md"]
    NEEDS_EITHER = [("router.py", "agent.py", "service.py")]

    # Directories that are feature-like but have sub-features
    COMPOSITE_FEATURES = {"macro"}

    # Shared infrastructure features: live under features/ for proximity to
    # the agents that consume them, but expose runtime primitives instead of
    # a router/agent/service entry point. They are exempted from the
    # standard "needs router/agent/service" check.
    SHARED_INFRA_FEATURES = {"agent_runtime"}

    def test_feature_modules_have_required_files(self):
        if not FEATURES_DIR.exists():
            pytest.skip("features/ directory not found")

        violations = []
        for feature_dir in sorted(FEATURES_DIR.iterdir()):
            if not feature_dir.is_dir() or feature_dir.name.startswith("_"):
                continue

            # Skip composite features (they contain sub-features)
            if feature_dir.name in self.COMPOSITE_FEATURES:
                # Check sub-features instead
                for sub_dir in sorted(feature_dir.iterdir()):
                    if sub_dir.is_dir() and not sub_dir.name.startswith("_"):
                        self._check_feature(sub_dir, violations)
                continue

            self._check_feature(feature_dir, violations)

        assert not violations, (
            "Feature module structure violations found.\n"
            "Every feature needs: .context.md + (router.py or agent.py or service.py)\n"
            "See backend/app/features/daily_report/ for a complete example.\n\n"
            + "\n".join(violations)
        )

    def _check_feature(self, feature_dir: Path, violations: list):
        rel_path = feature_dir.relative_to(BACKEND_DIR)

        # Check required files
        for required in self.REQUIRED_FILES:
            if not (feature_dir / required).exists():
                violations.append(
                    f"  {rel_path}/ missing {required}\n"
                    f"    FIX: Create {rel_path}/{required} documenting the module"
                )

        # Check "needs either" groups (shared-infra features are exempt — they
        # intentionally expose runtime primitives instead of a feature entry point).
        if feature_dir.name in self.SHARED_INFRA_FEATURES:
            return
        for group in self.NEEDS_EITHER:
            if not any((feature_dir / f).exists() for f in group):
                violations.append(
                    f"  {rel_path}/ missing any of: {', '.join(group)}\n"
                    f"    FIX: A feature needs at least one of these entry points"
                )
