import { describe, it, expect } from 'vitest';
import { getAuthErrorPresentation } from '../auth-error-presentation';

describe('getAuthErrorPresentation', () => {
  it('maps expired auth errors to login redirect copy', () => {
    const result = getAuthErrorPresentation(
      new Error('登录已过期，请刷新页面或重新登录'),
      'fallback'
    );

    expect(result).toEqual({
      kind: 'expired',
      message: '登录已过期，正在跳转到登录页。',
      shouldRedirectToLogin: true,
    });
  });

  it('maps transient auth errors to retry copy', () => {
    const result = getAuthErrorPresentation(
      new Error('认证校验暂时失败，请稍后重试或刷新页面。'),
      'fallback'
    );

    expect(result).toEqual({
      kind: 'transient',
      message: '登录状态校验暂时失败，请刷新页面重试。如果多次出现，请稍后再试。',
      shouldRedirectToLogin: false,
    });
  });

  it('passes through non-auth errors', () => {
    const result = getAuthErrorPresentation(
      new Error('保存持仓失败，请重试。'),
      'fallback'
    );

    expect(result).toEqual({
      kind: 'other',
      message: '保存持仓失败，请重试。',
      shouldRedirectToLogin: false,
    });
  });

  it('falls back when the error has no message', () => {
    const result = getAuthErrorPresentation(null, '默认错误');

    expect(result).toEqual({
      kind: 'other',
      message: '默认错误',
      shouldRedirectToLogin: false,
    });
  });
});
