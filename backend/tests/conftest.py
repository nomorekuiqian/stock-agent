"""
Pytest configuration and shared fixtures for all tests.

Test Categories:
- e2e: End-to-end tests using existing data (fast, runs by default)
- integration: Database operation tests (fast, runs by default)
- generate: Full generation tests with AI (slow, skipped by default)
- db_write: Tests that write to production database (requires --allow-db-write)

Database Isolation:
By default, all database WRITE operations are mocked to prevent pollution.
READ operations still work against the real database.
Use --allow-db-write to enable real database writes (for specific integration tests).

Usage:
    pytest tests/ -v                    # Run tests with DB writes mocked
    pytest tests/ -v --allow-db-write   # Allow real database writes
    pytest tests/ -v -m generate        # Run ONLY generation tests
    pytest tests/ -v --run-generate     # Run ALL tests including generation
"""

import os
import sys
import pytest
from unittest.mock import AsyncMock, patch

# Add backend directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

# Configure pytest-asyncio
pytest_plugins = ["pytest_asyncio"]

# Track if we're in test mode
_TESTING = True


def pytest_addoption(parser):
    """Add custom command line options."""
    parser.addoption(
        "--run-generate",
        action="store_true",
        default=False,
        help="Run generation tests (slow, calls AI APIs)",
    )
    parser.addoption(
        "--allow-db-write",
        action="store_true",
        default=False,
        help="Allow real database writes (by default, writes are mocked)",
    )


def pytest_configure(config):
    """Configure pytest with custom markers."""
    config.addinivalue_line(
        "markers", "e2e: marks tests as end-to-end tests (may send real emails)"
    )
    config.addinivalue_line(
        "markers", "integration: marks tests as integration tests (may write to database)"
    )
    config.addinivalue_line(
        "markers", "generate: marks tests that generate new content via AI (slow, skipped by default)"
    )
    config.addinivalue_line(
        "markers", "db_write: marks tests that need real database writes (requires --allow-db-write)"
    )


def pytest_collection_modifyitems(config, items):
    """Skip tests based on command line options."""
    # Skip generation tests unless --run-generate is specified
    if not config.getoption("--run-generate"):
        skip_generate = pytest.mark.skip(reason="need --run-generate option to run")
        for item in items:
            if "generate" in item.keywords:
                item.add_marker(skip_generate)

    # Skip db_write tests unless --allow-db-write is specified
    if not config.getoption("--allow-db-write"):
        skip_db_write = pytest.mark.skip(reason="need --allow-db-write option to run (protects production DB)")
        for item in items:
            if "db_write" in item.keywords:
                item.add_marker(skip_db_write)


@pytest.fixture
def test_audience_id():
    """Test segment ID for E2E tests (contains only voya.technologies@gmail.com)."""
    return "191b3099-6849-48f9-adec-e6a67b70b10b"


@pytest.fixture
def test_user_id():
    """Test user ID for personal digest tests."""
    return "d00a6201-646a-489f-95a2-aff8f90fe669"


@pytest.fixture
def email_service():
    """Get Email service instance."""
    from app.features.subscription.email_service import get_email_service
    return get_email_service()


# =============================================================================
# Database Write Protection
# =============================================================================

# List of database write functions to mock (module_path, function_name)
DB_WRITE_FUNCTIONS = [
    # Feedback
    ("app.features.feedback.db", "save_email_feedback"),
    ("app.features.feedback.db", "save_user_feedback"),
    # Daily reports (formerly market)
    ("app.features.daily_report.db", "save_market_report"),
    # Stock
    ("app.features.stock.db", "upsert_stock_profile"),
    ("app.features.stock.db", "upsert_stock_financial"),
    ("app.features.stock.db", "save_stock_analysis"),
    # Brew (formerly digest)
    ("app.features.brew.db", "save_user_digest"),
    ("app.features.brew.db", "save_user_watchlist"),
    # Watchlist monitor
    ("app.features.watchlist_monitor.db", "upsert_ticker_brief"),
    # Brew via email_service (has its own import reference)
    ("app.features.subscription.email_service", "save_user_digest"),
    # Subscription (Resend operations)
    ("app.features.subscription.service", "add_subscriber"),
    ("app.features.subscription.service", "remove_subscriber"),
    # Weekly Report (now under macro/)
    ("app.features.macro.weekly.db", "save_weekly_report"),
    # Macro Cache (now under macro/)
    ("app.features.macro.cache.db", "set_cached"),
    # Quota
    ("app.features.quota.db", "increment_usage"),
    # Feature flags admin
    ("app.features.flags.db", "upsert_assignment"),
    ("app.features.flags.db", "delete_assignment"),
    # Community access grants
    ("app.features.community_access.db", "bulk_upsert_grants"),
    ("app.features.community_access.db", "revoke_grant"),
    ("app.features.community_access.db", "mark_grant_seen"),
    # Agent runtime durable session writes
    ("app.features.agent_runtime.db", "append_entries"),
    ("app.features.agent_runtime.db", "update_message_feedback"),
    ("app.shared.agent_runtime_feedback", "update_agent_message_feedback"),
]


def _create_mock_response(function_name: str):
    """Create a mock response for a database write function."""
    async def mock_func(*args, **kwargs):
        print(f"[TEST MOCK] Blocked DB write: {function_name}(*{args}, **{kwargs})")
        return {
            "success": True,
            "mocked": True,
            "message": f"Mocked in test mode - no actual DB write for {function_name}",
        }
    return mock_func


@pytest.fixture(autouse=True)
def mock_db_writes(request):
    """
    Automatically mock all database write operations unless --allow-db-write is specified.

    This fixture:
    - Runs automatically for ALL tests (autouse=True)
    - Blocks database writes by default to protect production data
    - Can be disabled with --allow-db-write flag for specific integration tests

    Tests that need real DB writes should:
    1. Be marked with @pytest.mark.db_write
    2. Run with --allow-db-write flag
    """
    # Check if db writes are allowed
    allow_db_write = request.config.getoption("--allow-db-write", default=False)

    if allow_db_write:
        # Don't mock - allow real database writes
        yield
        return

    # Mock all database write functions
    patches = []
    for module_path, func_name in DB_WRITE_FUNCTIONS:
        try:
            full_path = f"{module_path}.{func_name}"
            mock = patch(full_path, new=AsyncMock(side_effect=_create_mock_response(func_name)))
            patches.append(mock)
            mock.start()
        except Exception as e:
            # Some modules might not be loaded - that's ok
            print(f"[TEST] Could not mock {module_path}.{func_name}: {e}")

    yield

    # Stop all patches
    for p in patches:
        try:
            p.stop()
        except Exception:
            pass


@pytest.fixture(autouse=True)
def reset_insforge_http_client():
    """
    Drop the cached httpx AsyncClient on the InsforgeService singleton
    between tests so each test gets a client bound to its own event loop.

    Without this, a client created in test A stays bound to loop A; when
    pytest-asyncio closes loop A and test B runs on loop B, the next
    `client.get(...)` raises RuntimeError("Event loop is closed").
    """
    try:
        from app.core import database as _db_mod
        if _db_mod._insforge_service is not None:
            _db_mod._insforge_service._clients = {}
    except Exception:
        pass
    yield
    try:
        from app.core import database as _db_mod
        if _db_mod._insforge_service is not None:
            _db_mod._insforge_service._clients = {}
    except Exception:
        pass


@pytest.fixture(autouse=True)
def reset_rate_limiter():
    """
    Reset the in-memory rate limiter state before each test.

    Without this, tests that call rate-limited endpoints share the same
    IP bucket across tests (testclient always appears as 127.0.0.1),
    causing the second call to a 1/minute endpoint to return 429.
    """
    try:
        from app.core.rate_limit import limiter
        if hasattr(limiter, "_storage") and limiter._storage is not None:
            limiter._storage.reset()
    except Exception:
        pass
    yield


@pytest.fixture
def allow_db_write_fixture(request):
    """
    Fixture to explicitly allow DB writes for a specific test.
    Use this when you need real DB writes but don't want to use the CLI flag.

    Usage:
        def test_something(allow_db_write_fixture):
            # This test will have real DB writes
            pass

    Note: Prefer using @pytest.mark.db_write with --allow-db-write flag instead.
    """
    # Stop the auto-mock for this test
    # This is a placeholder - the actual implementation would need
    # to interact with the mock_db_writes fixture
    yield True
