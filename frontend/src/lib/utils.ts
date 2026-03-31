import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 检测当前是否在 App 内置浏览器中（微信、QQ、钉钉等）
 * 这些 App 使用 WKWebView/WebView 打开链接，Google OAuth 会返回 403 disallowed_useragent。
 * iOS 和 Android 均受影响。
 */
export function isInAppBrowser(): { inApp: boolean; name: string } {
  if (typeof window === 'undefined') return { inApp: false, name: '' };
  const ua = navigator.userAgent || '';

  if (/MicroMessenger/i.test(ua)) return { inApp: true, name: '微信' };
  if (/Line/i.test(ua)) return { inApp: true, name: 'LINE' };
  if (/FBAN|FBAV/i.test(ua)) return { inApp: true, name: 'Facebook' };
  if (/Instagram/i.test(ua)) return { inApp: true, name: 'Instagram' };
  if (/Twitter/i.test(ua)) return { inApp: true, name: 'Twitter' };
  if (/DingTalk/i.test(ua)) return { inApp: true, name: '钉钉' };
  if (/Weibo/i.test(ua)) return { inApp: true, name: '微博' };
  if (/QQ\//i.test(ua)) return { inApp: true, name: 'QQ' };
  if (/Alipay/i.test(ua)) return { inApp: true, name: '支付宝' };

  return { inApp: false, name: '' };
}
