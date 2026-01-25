"""
Pytest configuration and shared fixtures for all tests.

Test Categories:
- e2e: End-to-end tests using existing data (fast, runs by default)
- integration: Database operation tests (fast, runs by default)
- generate: Full generation tests with AI (slow, skipped by default)

Usage:
    pytest tests/ -v                    # Run default tests (e2e + integration)
    pytest tests/ -v -m generate        # Run ONLY generation tests
    pytest tests/ -v --run-generate     # Run ALL tests including generation
"""

import os
import sys
import pytest

# Add backend directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

# Configure pytest-asyncio
pytest_plugins = ["pytest_asyncio"]


def pytest_addoption(parser):
    """Add custom command line options."""
    parser.addoption(
        "--run-generate",
        action="store_true",
        default=False,
        help="Run generation tests (slow, calls AI APIs)",
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


def pytest_collection_modifyitems(config, items):
    """Skip generation tests unless --run-generate is specified."""
    if config.getoption("--run-generate"):
        # --run-generate given: run all tests
        return

    skip_generate = pytest.mark.skip(reason="need --run-generate option to run")
    for item in items:
        if "generate" in item.keywords:
            item.add_marker(skip_generate)


@pytest.fixture
def test_audience_id():
    """Test Broadcast audience ID for E2E tests."""
    return "1c300c45-49a7-479e-a4c2-1ed5cfccda1e"


@pytest.fixture
def test_user_id():
    """Test user ID for personal digest tests."""
    return "d00a6201-646a-489f-95a2-aff8f90fe669"


@pytest.fixture
def insforge_service():
    """Get Insforge service instance."""
    from app.shared.insforge_service import get_insforge_service
    return get_insforge_service()


@pytest.fixture
def email_service():
    """Get Email service instance."""
    from app.features.subscription.email_service import get_email_service
    return get_email_service()
