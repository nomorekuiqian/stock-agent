export type AuthErrorKind = 'expired' | 'transient' | 'other';

export interface AuthErrorPresentation {
  kind: AuthErrorKind;
  message: string;
  shouldRedirectToLogin: boolean;
}

const EXPIRED_MARKERS = [
  '登录已过期',
  'session_expired',
  'session_reset',
  '登录状态已重置',
] as const;

const TRANSIENT_MARKERS = [
  '认证校验暂时失败',
  '登录状态恢复失败',
  'session_recovery_failed',
] as const;

const EXPIRED_MESSAGE = '登录已过期，正在跳转到登录页。';
const TRANSIENT_MESSAGE = '登录状态校验暂时失败，请刷新页面重试。如果多次出现，请稍后再试。';

function toErrorMessage(error: unknown): string | null {
  if (typeof error === 'string' && error.trim()) {
    return error;
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return null;
}

export function getAuthErrorPresentation(
  error: unknown,
  fallback: string
): AuthErrorPresentation {
  const rawMessage = toErrorMessage(error) || fallback;

  if (EXPIRED_MARKERS.some((marker) => rawMessage.includes(marker))) {
    return {
      kind: 'expired',
      message: EXPIRED_MESSAGE,
      shouldRedirectToLogin: true,
    };
  }

  if (TRANSIENT_MARKERS.some((marker) => rawMessage.includes(marker))) {
    return {
      kind: 'transient',
      message: TRANSIENT_MESSAGE,
      shouldRedirectToLogin: false,
    };
  }

  return {
    kind: 'other',
    message: rawMessage,
    shouldRedirectToLogin: false,
  };
}
