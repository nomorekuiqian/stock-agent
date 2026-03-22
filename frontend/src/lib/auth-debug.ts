const AUTH_DEBUG_ENABLED = process.env.NODE_ENV !== 'production';

type LogData = Record<string, unknown> | undefined;

function formatPrefix(scope: string): string {
  return `[auth-debug][${scope}]`;
}

function getBrowserCookieNames(): string[] {
  if (typeof document === 'undefined') return [];
  return document.cookie
    .split(';')
    .map((part) => part.trim().split('=')[0])
    .filter(Boolean)
    .filter((name) => name.startsWith('insforge') || name === 'auth_redirect');
}

export function getBrowserAuthSnapshot(): Record<string, unknown> {
  if (typeof window === 'undefined') {
    return {};
  }

  return {
    pathname: window.location.pathname,
    search: window.location.search,
    authRedirect: sessionStorage.getItem('auth_redirect'),
    cookieNames: getBrowserCookieNames(),
  };
}

export function authDebug(scope: string, message: string, data?: LogData): void {
  if (!AUTH_DEBUG_ENABLED) return;
  if (data) {
    console.info(formatPrefix(scope), message, data);
    return;
  }
  console.info(formatPrefix(scope), message);
}

export function authDebugWarn(scope: string, message: string, data?: LogData): void {
  if (!AUTH_DEBUG_ENABLED) return;
  if (data) {
    console.warn(formatPrefix(scope), message, data);
    return;
  }
  console.warn(formatPrefix(scope), message);
}
