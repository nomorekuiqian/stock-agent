"""
Timezone utilities for consistent Pacific Time handling across the application.

All dates and times in this application should use US Pacific timezone (America/Los_Angeles).
This ensures consistency for US stock market analysis targeting West Coast users.
"""

from datetime import datetime, date
from zoneinfo import ZoneInfo

# US Pacific timezone (automatically handles PST/PDT)
PACIFIC_TZ = ZoneInfo("America/Los_Angeles")


def now_pacific() -> datetime:
    """Get current datetime in Pacific timezone."""
    return datetime.now(PACIFIC_TZ)


def today_pacific() -> date:
    """Get current date in Pacific timezone."""
    return now_pacific().date()


def today_str() -> str:
    """Get current date as YYYY-MM-DD string in Pacific timezone."""
    return today_pacific().strftime("%Y-%m-%d")


def now_iso() -> str:
    """Get current datetime as ISO format string in Pacific timezone."""
    return now_pacific().isoformat()


def format_date(dt: datetime | date | None = None, fmt: str = "%Y-%m-%d") -> str:
    """
    Format a datetime/date object to string.
    If dt is None, uses current Pacific time.
    """
    if dt is None:
        dt = now_pacific()
    elif isinstance(dt, datetime) and dt.tzinfo is None:
        # Make naive datetime Pacific-aware
        dt = dt.replace(tzinfo=PACIFIC_TZ)
    return dt.strftime(fmt)


def format_datetime_display(dt: datetime | None = None) -> str:
    """
    Format datetime for display: 'YYYY-MM-DD HH:MM PST/PDT'
    """
    if dt is None:
        dt = now_pacific()
    elif dt.tzinfo is None:
        dt = dt.replace(tzinfo=PACIFIC_TZ)
    return dt.strftime("%Y-%m-%d %H:%M %Z")


def format_report_date(dt: datetime | date | None = None) -> str:
    """
    Format date for report header: 'YYYY-MM-DD Weekday'
    Example: '2024-12-16 Monday'
    """
    if dt is None:
        dt = now_pacific()
    elif isinstance(dt, date) and not isinstance(dt, datetime):
        dt = datetime.combine(dt, datetime.min.time(), tzinfo=PACIFIC_TZ)
    elif isinstance(dt, datetime) and dt.tzinfo is None:
        dt = dt.replace(tzinfo=PACIFIC_TZ)
    return dt.strftime("%Y-%m-%d %A")


def format_date_chinese(dt: datetime | date | None = None) -> str:
    """
    Format date for Chinese display: 'YYYY年MM月DD日 Weekday'
    """
    weekday_cn = {
        0: "星期一",
        1: "星期二",
        2: "星期三",
        3: "星期四",
        4: "星期五",
        5: "星期六",
        6: "星期日",
    }
    if dt is None:
        dt = now_pacific()
    elif isinstance(dt, date) and not isinstance(dt, datetime):
        dt = datetime.combine(dt, datetime.min.time(), tzinfo=PACIFIC_TZ)
    elif isinstance(dt, datetime) and dt.tzinfo is None:
        dt = dt.replace(tzinfo=PACIFIC_TZ)

    return f"{dt.strftime('%Y年%m月%d日')} {weekday_cn[dt.weekday()]}"


def to_pacific(dt: datetime) -> datetime:
    """
    Convert a datetime to Pacific timezone.
    If naive (no tzinfo), assumes it's already Pacific time.
    """
    if dt.tzinfo is None:
        return dt.replace(tzinfo=PACIFIC_TZ)
    return dt.astimezone(PACIFIC_TZ)


def parse_date(date_str: str) -> date:
    """
    Parse a YYYY-MM-DD string to date object.
    """
    return datetime.strptime(date_str, "%Y-%m-%d").date()


def days_ago(days: int) -> str:
    """
    Get date string for N days ago in Pacific timezone.
    """
    from datetime import timedelta
    return (today_pacific() - timedelta(days=days)).strftime("%Y-%m-%d")


def days_from_now(days: int) -> str:
    """
    Get date string for N days from now in Pacific timezone.
    """
    from datetime import timedelta
    return (today_pacific() + timedelta(days=days)).strftime("%Y-%m-%d")
