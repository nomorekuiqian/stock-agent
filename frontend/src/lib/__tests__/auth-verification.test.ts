import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildAbsoluteVerifyEmailUrl,
  buildVerifyEmailPath,
  clearPendingVerification,
  getPendingVerification,
  storePendingVerification,
} from '../auth-verification';

describe('auth-verification helpers', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('builds verify-email path with sanitized redirect', () => {
    expect(buildVerifyEmailPath('https://evil.com')).toBe('/verify-email?redirect=%2Ftoday');
    expect(buildVerifyEmailPath('/for-you')).toBe('/verify-email?redirect=%2Ffor-you');
  });

  it('builds absolute verify-email url', () => {
    expect(buildAbsoluteVerifyEmailUrl('https://themarketbrew.com', '/profile')).toBe(
      'https://themarketbrew.com/verify-email?redirect=%2Fprofile'
    );
  });

  it('stores and reads pending verification state', () => {
    storePendingVerification({ email: 'user@example.com', name: 'Tester' });

    expect(getPendingVerification()).toEqual({
      email: 'user@example.com',
      name: 'Tester',
    });
  });

  it('clears pending verification state', () => {
    storePendingVerification({ email: 'user@example.com', name: 'Tester' });
    clearPendingVerification();

    expect(getPendingVerification()).toBeNull();
  });
});
