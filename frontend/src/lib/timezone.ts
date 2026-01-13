/**
 * Timezone utilities for the application.
 *
 * Strategy:
 * - Backend returns all timestamps as UTC (ISO 8601 with Z suffix)
 * - Frontend automatically converts to user's local timezone for display
 * - Business dates (report_date) are based on US market timezone (New York)
 * - No hardcoded timezone - uses browser's Intl API for automatic localization
 */

// US stock market timezone (for business date logic only)
const MARKET_TZ = 'America/New_York';

// User's local timezone (auto-detected by browser)
const USER_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

/**
 * Get current date string (YYYY-MM-DD) in market timezone.
 * Used to determine "today's report" based on US market day.
 */
export function marketTodayStr(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: MARKET_TZ });
}

/**
 * Check if a report date is today in market timezone.
 */
export function isMarketToday(reportDate: string): boolean {
  return reportDate === marketTodayStr();
}

/**
 * Format a UTC timestamp to user's local time.
 * Automatically uses browser's timezone.
 */
export function formatTimestamp(utcString: string | null | undefined): string {
  if (!utcString) return '';
  try {
    const date = new Date(utcString);
    return date.toLocaleString('zh-CN', {
      timeZone: USER_TZ,
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return utcString;
  }
}

/**
 * Format just the time portion in user's local timezone.
 */
export function formatTime(utcString: string | null | undefined): string {
  if (!utcString) return '';
  try {
    const date = new Date(utcString);
    return date.toLocaleTimeString('zh-CN', {
      timeZone: USER_TZ,
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

/**
 * Format a business date (YYYY-MM-DD) for display.
 * Does NOT convert timezone - business dates are market-based.
 */
export function formatReportDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  try {
    // Parse as local date to avoid timezone shift
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    });
  } catch {
    return dateStr;
  }
}

/**
 * Format date in short form: "12月17日"
 */
export function formatDateShort(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  try {
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('zh-CN', {
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

/**
 * Format relative time (e.g., "3分钟前", "2小时前")
 */
export function formatRelativeTime(utcString: string | null | undefined): string {
  if (!utcString) return '';
  try {
    const date = new Date(utcString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    if (diffDays < 7) return `${diffDays}天前`;
    return formatDateShort(utcString.slice(0, 10));
  } catch {
    return '';
  }
}

/**
 * Format comparison date label (e.g., "较昨天", "较上周")
 * Based on market timezone for consistency with data.
 */
export function formatCompareDateLabel(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return '';
  try {
    const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    const now = new Date();

    // Compare in market timezone for consistency
    const dateStr = date.toLocaleDateString('en-CA', { timeZone: MARKET_TZ });
    const nowStr = now.toLocaleDateString('en-CA', { timeZone: MARKET_TZ });
    const dateOnly = new Date(dateStr);
    const nowOnly = new Date(nowStr);
    const diffDays = Math.floor((nowOnly.getTime() - dateOnly.getTime()) / 86400000);

    if (diffDays <= 1) return '较昨天';
    if (diffDays <= 3) return '较3天前';
    if (diffDays <= 7) return '较上周';
    if (diffDays <= 14) return '较两周前';
    return '较上月';
  } catch {
    return '';
  }
}

/**
 * Format calendar date for event display.
 * Returns month, day, weekday for calendar UI.
 */
export function formatCalendarDate(dateInput: string | Date): {
  month: string;
  day: number;
  weekday: string;
} {
  let date: Date;
  if (typeof dateInput === 'string') {
    // For date-only strings (YYYY-MM-DD), parse as local date
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
      const [year, month, day] = dateInput.split('-').map(Number);
      date = new Date(year, month - 1, day);
    } else {
      date = new Date(dateInput);
    }
  } else {
    date = dateInput;
  }
  return {
    month: date.toLocaleDateString('en-US', { month: 'short' }),
    day: date.getDate(),
    weekday: date.toLocaleDateString('en-US', { weekday: 'short' }),
  };
}

// =============================================================================
// Backward compatibility aliases (to be removed after migration)
// =============================================================================

/** @deprecated Use marketTodayStr() instead */
export function todayStr(): string {
  return marketTodayStr();
}

/** @deprecated Use formatReportDate() instead */
export function formatDateChinese(dateInput: string | Date | undefined | null): string {
  // Handle undefined/null input
  if (!dateInput) {
    return '';
  }
  // Extract YYYY-MM-DD from input (handles both "2025-12-28" and "2025-12-28T06:26:11.988Z")
  const dateStr = typeof dateInput === 'string' ? dateInput.slice(0, 10) : dateInput.toISOString().slice(0, 10);
  return formatReportDate(dateStr);
}

/** @deprecated Use formatTime() instead */
export function formatTimePacific(dateInput: string | Date | undefined | null): string {
  // Handle undefined/null input
  if (!dateInput) {
    return '';
  }
  const utcStr = typeof dateInput === 'string' ? dateInput : dateInput.toISOString();
  return formatTime(utcStr);
}

/** @deprecated Use formatTimestamp() instead */
export function formatDateTimePacific(dateInput: string | Date): string {
  const utcStr = typeof dateInput === 'string' ? dateInput : dateInput.toISOString();
  return formatTimestamp(utcStr);
}

/** @deprecated Use formatTimestamp() instead */
export function formatFullDateTimePacific(dateInput: string | Date): string {
  return formatDateTimePacific(dateInput);
}

/** @deprecated Use isMarketToday() instead */
export function isTodayPacific(dateInput: string | Date): boolean {
  const dateStr = typeof dateInput === 'string' ? dateInput.slice(0, 10) : dateInput.toISOString().slice(0, 10);
  return isMarketToday(dateStr);
}

/** @deprecated No longer needed - timezone is automatic */
export const PACIFIC_TZ = MARKET_TZ;

/** @deprecated Use new Date() with toLocaleString() instead */
export function nowPacific(): Date {
  return new Date();
}

/** @deprecated Use formatTimestamp() instead */
export function nowIso(): string {
  return new Date().toISOString();
}

/** @deprecated Use formatReportDate() instead */
export function formatDatePacific(
  dateInput: string | Date,
  options: Intl.DateTimeFormatOptions = {}
): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  return date.toLocaleDateString('zh-CN', {
    timeZone: USER_TZ,
    ...options,
  });
}

/** @deprecated Days difference calculation */
export function daysDifferencePacific(dateInput: string | Date): number {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const now = new Date();
  const dateStr = date.toLocaleDateString('en-CA', { timeZone: MARKET_TZ });
  const nowStr = now.toLocaleDateString('en-CA', { timeZone: MARKET_TZ });
  const dateOnly = new Date(dateStr);
  const nowOnly = new Date(nowStr);
  return Math.floor((nowOnly.getTime() - dateOnly.getTime()) / 86400000);
}
