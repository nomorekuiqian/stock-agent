import { describe, it, expect, beforeEach } from 'vitest';
import { isWechatWebView, extractAndStoreToken, getWechatToken } from '@/lib/wechat';

describe('wechat utils', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  describe('isWechatWebView', () => {
    it('returns false with no wechat indicators', () => {
      // Default test environment has no wechat params
      expect(isWechatWebView()).toBe(false);
    });
  });

  describe('getWechatToken', () => {
    it('returns null when no token stored', () => {
      expect(getWechatToken()).toBeNull();
    });

    it('returns token from sessionStorage', () => {
      sessionStorage.setItem('wechat_token', 'test_token');
      expect(getWechatToken()).toBe('test_token');
    });
  });
});
