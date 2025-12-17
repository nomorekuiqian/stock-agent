/**
 * Timezone utilities for consistent Pacific Time handling across the application.
 *
 * All dates and times in this application should use US Pacific timezone (America/Los_Angeles).
 * This ensures consistency for US stock market analysis targeting West Coast users.
 */

// Pacific timezone identifier
export const PACIFIC_TZ = 'America/Los_Angeles';

/**
 * Get current datetime in Pacific timezone
 */
export function nowPacific(): Date {
  return new Date(
    new Date().toLocaleString('en-US', { timeZone: PACIFIC_TZ })
  );
}

/**
 * Get current date string (YYYY-MM-DD) in Pacific timezone
 */
export function todayStr(): string {
  const now = new Date();
  return now.toLocaleDateString('en-CA', { timeZone: PACIFIC_TZ }); // en-CA gives YYYY-MM-DD format
}

/**
 * Get current ISO timestamp in Pacific timezone
 */
export function nowIso(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: PACIFIC_TZ }).replace(' ', 'T');
}

/**
 * Format a date string or Date object to display format in Pacific timezone
 * @param dateInput - Date string or Date object
 * @param options - Intl.DateTimeFormat options
 */
export function formatDatePacific(
  dateInput: string | Date,
  options: Intl.DateTimeFormatOptions = {}
): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  return date.toLocaleDateString('zh-CN', {
    timeZone: PACIFIC_TZ,
    ...options,
  });
}

/**
 * Format a date to Chinese display format: "2024年12月16日 星期一"
 */
export function formatDateChinese(dateInput: string | Date): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  return date.toLocaleDateString('zh-CN', {
    timeZone: PACIFIC_TZ,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });
}

/**
 * Format a date to short display format: "12月16日"
 */
export function formatDateShort(dateInput: string | Date): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  return date.toLocaleDateString('zh-CN', {
    timeZone: PACIFIC_TZ,
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Format time to HH:MM format in Pacific timezone
 */
export function formatTimePacific(dateInput: string | Date): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  return date.toLocaleTimeString('zh-CN', {
    timeZone: PACIFIC_TZ,
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format datetime to full display in Pacific timezone
 */
export function formatDateTimePacific(dateInput: string | Date): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  return date.toLocaleString('zh-CN', {
    timeZone: PACIFIC_TZ,
  });
}

/**
 * Format datetime with full date and time in Pacific timezone
 */
export function formatFullDateTimePacific(dateInput: string | Date): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  return date.toLocaleString('zh-CN', {
    timeZone: PACIFIC_TZ,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Get relative time description (e.g., "3 minutes ago")
 * Uses Pacific timezone for comparison
 */
export function formatRelativeTime(dateInput: string | Date): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return '刚刚';
  if (diffMins < 60) return `${diffMins}分钟前`;
  if (diffHours < 24) return `${diffHours}小时前`;
  if (diffDays < 7) return `${diffDays}天前`;
  return formatDateShort(date);
}

/**
 * Check if a date is today in Pacific timezone
 */
export function isTodayPacific(dateInput: string | Date): boolean {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const dateStr = date.toLocaleDateString('en-CA', { timeZone: PACIFIC_TZ });
  const todayStrValue = todayStr();
  return dateStr === todayStrValue;
}

/**
 * Format date for calendar display (month and weekday)
 * For date-only strings (YYYY-MM-DD), parse as local date to avoid timezone shift
 */
export function formatCalendarDate(dateInput: string | Date): {
  month: string;
  day: number;
  weekday: string;
} {
  let date: Date;
  if (typeof dateInput === 'string') {
    // For date-only strings (YYYY-MM-DD), parse as local date
    // Adding T12:00:00 ensures the date stays the same across timezones
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
      date = new Date(dateInput + 'T12:00:00');
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

/**
 * Compare two dates in Pacific timezone (days difference)
 */
export function daysDifferencePacific(dateInput: string | Date): number {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const now = new Date();
  // Convert both to Pacific timezone date strings for accurate day comparison
  const dateStr = date.toLocaleDateString('en-CA', { timeZone: PACIFIC_TZ });
  const nowStr = now.toLocaleDateString('en-CA', { timeZone: PACIFIC_TZ });
  const dateOnly = new Date(dateStr);
  const nowOnly = new Date(nowStr);
  return Math.floor((nowOnly.getTime() - dateOnly.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Format compare date label (e.g., "较昨天", "较上周")
 * Used for displaying change comparisons in liquidity metrics
 */
export function formatCompareDateLabel(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return '';
  const diffDays = daysDifferencePacific(dateInput);
  if (diffDays <= 1) return '较昨天';
  if (diffDays <= 3) return '较3天前';
  if (diffDays <= 7) return '较上周';
  if (diffDays <= 14) return '较两周前';
  return '较上月';
}
