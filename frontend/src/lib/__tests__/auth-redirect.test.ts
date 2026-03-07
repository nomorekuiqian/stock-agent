import { describe, it, expect, beforeEach } from 'vitest';
import { DEFAULT_AUTH_REDIRECT, getStoredAuthRedirect, sanitizeRedirectPath } from '../auth-redirect';

describe('sanitizeRedirectPath', () => {
  it('keeps safe in-site paths', () => {
    expect(sanitizeRedirectPath('/for-you')).toBe('/for-you');
    expect(sanitizeRedirectPath('/for-you?tab=watchlist')).toBe('/for-you?tab=watchlist');
  });

  it('falls back for absolute external URLs', () => {
    expect(sanitizeRedirectPath('https://evil.com')).toBe(DEFAULT_AUTH_REDIRECT);
    expect(sanitizeRedirectPath('http://evil.com/path')).toBe(DEFAULT_AUTH_REDIRECT);
  });

  it('falls back for protocol-relative paths', () => {
    expect(sanitizeRedirectPath('//evil.com')).toBe(DEFAULT_AUTH_REDIRECT);
  });
});

describe('getStoredAuthRedirect', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('returns sanitized stored redirect', () => {
    sessionStorage.setItem('auth_redirect', '/profile');
    expect(getStoredAuthRedirect()).toBe('/profile');
  });

  it('returns fallback when stored redirect is unsafe', () => {
    sessionStorage.setItem('auth_redirect', 'https://evil.com');
    expect(getStoredAuthRedirect('/today')).toBe('/today');
  });
});
