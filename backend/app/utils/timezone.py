"""
Timezone utilities for the application.

Strategy:
- All timestamps stored/returned as UTC (ISO 8601 with Z suffix)
- Business dates (report_date) based on US market timezone (America/New_York)
- Frontend handles conversion to user's local timezone automatically
"""

from datetime import datetime, timezone, date, timedelta
from zoneinfo import ZoneInfo

# US stock market timezone (for business date logic)
MARKET_TZ = ZoneInfo("America/New_York")


def utc_now() -> datetime:
    """Get current datetime in UTC."""
    return datetime.now(timezone.utc)


def utc_now_iso() -> str:
    """Get current UTC datetime as ISO 8601 string with Z suffix."""
    return utc_now().strftime("%Y-%m-%dT%H:%M:%SZ")


def market_now() -> datetime:
    """Get current datetime in US market timezone (New York)."""
    return datetime.now(MARKET_TZ)


def market_today() -> date:
    """Get current date in US market timezone."""
    return market_now().date()


def market_today_str() -> str:
    """Get current market date as YYYY-MM-DD string."""
    return market_today().strftime("%Y-%m-%d")


def market_days_ago(days: int) -> str:
    """Get date string for N days ago in market timezone."""
    return (market_today() - timedelta(days=days)).strftime("%Y-%m-%d")


def market_days_from_now(days: int) -> str:
    """Get date string for N days from now in market timezone."""
    return (market_today() + timedelta(days=days)).strftime("%Y-%m-%d")


def format_market_date(dt: datetime | date | None = None) -> str:
    """
    Format date for report header: 'YYYY-MM-DD Weekday'
    Example: '2024-12-16 Monday'
    """
    if dt is None:
        dt = market_now()
    elif isinstance(dt, date) and not isinstance(dt, datetime):
        dt = datetime.combine(dt, datetime.min.time(), tzinfo=MARKET_TZ)
    elif isinstance(dt, datetime) and dt.tzinfo is None:
        dt = dt.replace(tzinfo=MARKET_TZ)
    return dt.strftime("%Y-%m-%d %A")


def format_market_date_chinese(dt: datetime | date | None = None) -> str:
    """
    Format date for Chinese display: 'YYYY年MM月DD日 星期X'
    Used in AI prompts for context.
    """
    weekday_cn = {
        0: "星期一", 1: "星期二", 2: "星期三", 3: "星期四",
        4: "星期五", 5: "星期六", 6: "星期日",
    }
    if dt is None:
        dt = market_now()
    elif isinstance(dt, date) and not isinstance(dt, datetime):
        dt = datetime.combine(dt, datetime.min.time(), tzinfo=MARKET_TZ)
    elif isinstance(dt, datetime) and dt.tzinfo is None:
        dt = dt.replace(tzinfo=MARKET_TZ)

    return f"{dt.strftime('%Y年%m月%d日')} {weekday_cn[dt.weekday()]}"


def parse_date(date_str: str) -> date:
    """Parse a YYYY-MM-DD string to date object."""
    return datetime.strptime(date_str, "%Y-%m-%d").date()


def to_market_tz(dt: datetime) -> datetime:
    """
    Convert a datetime to market timezone.
    If naive (no tzinfo), assumes it's UTC.
    """
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(MARKET_TZ)


# =============================================================================
# Backward compatibility aliases (to be removed after migration)
# =============================================================================

# These map old function names to new ones for gradual migration
def now_iso() -> str:
    """DEPRECATED: Use utc_now_iso() instead."""
    return utc_now_iso()


def today_str() -> str:
    """DEPRECATED: Use market_today_str() instead."""
    return market_today_str()


def days_ago(days: int) -> str:
    """DEPRECATED: Use market_days_ago() instead."""
    return market_days_ago(days)


def days_from_now(days: int) -> str:
    """DEPRECATED: Use market_days_from_now() instead."""
    return market_days_from_now(days)


def format_report_date(dt: datetime | date | None = None) -> str:
    """DEPRECATED: Use format_market_date() instead."""
    return format_market_date(dt)


def format_date_chinese(dt: datetime | date | None = None) -> str:
    """DEPRECATED: Use format_market_date_chinese() instead."""
    return format_market_date_chinese(dt)


# Keep PACIFIC_TZ as alias for MARKET_TZ during migration
PACIFIC_TZ = MARKET_TZ


def now_pacific() -> datetime:
    """DEPRECATED: Use market_now() instead."""
    return market_now()


def today_pacific() -> date:
    """DEPRECATED: Use market_today() instead."""
    return market_today()


def format_date(dt: datetime | date | None = None, fmt: str = "%Y-%m-%d") -> str:
    """DEPRECATED: Format a datetime/date object to string."""
    if dt is None:
        dt = market_now()
    elif isinstance(dt, datetime) and dt.tzinfo is None:
        dt = dt.replace(tzinfo=MARKET_TZ)
    return dt.strftime(fmt)


def format_datetime_display(dt: datetime | None = None) -> str:
    """DEPRECATED: Format datetime for display."""
    if dt is None:
        dt = market_now()
    elif dt.tzinfo is None:
        dt = dt.replace(tzinfo=MARKET_TZ)
    return dt.strftime("%Y-%m-%d %H:%M %Z")


def to_pacific(dt: datetime) -> datetime:
    """DEPRECATED: Use to_market_tz() instead."""
    return to_market_tz(dt)
