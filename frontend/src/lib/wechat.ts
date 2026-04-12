/**
 * WeChat Mini Program WebView utilities.
 *
 * Detects if the page is running inside a WeChat Mini Program WebView
 * and provides helpers for token injection and navigation.
 */

/**
 * Check if current page is loaded inside a WeChat Mini Program WebView.
 * Detection: URL has `from=wechat` param OR User-Agent contains `miniProgram`.
 */
export function isWechatWebView(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get('from') === 'wechat') return true;
  return /miniProgram/i.test(navigator.userAgent);
}

/**
 * Extract token from URL query params (injected by mini program).
 * Stores in sessionStorage for subsequent API calls.
 */
export function extractAndStoreToken(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  if (token) {
    sessionStorage.setItem('wechat_token', token);
  }
  return token ?? sessionStorage.getItem('wechat_token');
}

/**
 * Get the stored WeChat token (from URL or sessionStorage).
 */
export function getWechatToken(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem('wechat_token');
}
