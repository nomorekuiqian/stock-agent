import { describe, it, expect, beforeEach } from 'vitest';
import {
  INSFORGE_AUTH_TOKEN_KEY,
  INSFORGE_AUTH_USER_KEY,
  clearClientAuthStorage,
} from '../auth-storage';

describe('clearClientAuthStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('clears locally stored auth keys', () => {
    localStorage.setItem(INSFORGE_AUTH_TOKEN_KEY, 'server-token');
    localStorage.setItem(INSFORGE_AUTH_USER_KEY, '{"id":"user-1"}');

    const result = clearClientAuthStorage(localStorage);

    expect(result).toBe(true);
    expect(localStorage.getItem(INSFORGE_AUTH_TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(INSFORGE_AUTH_USER_KEY)).toBeNull();
  });

  it('returns false when storage is not accessible', () => {
    const result = clearClientAuthStorage(null);
    expect(result).toBe(false);
  });

  it('returns false when removeItem throws', () => {
    const brokenStorage = {
      removeItem: () => {
        throw new Error('blocked');
      },
    };

    const result = clearClientAuthStorage(brokenStorage);
    expect(result).toBe(false);
  });
});
