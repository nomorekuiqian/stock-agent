import { describe, it, expect, beforeEach } from 'vitest';
import {
  INSFORGE_AUTH_TOKEN_KEY,
  INSFORGE_AUTH_USER_KEY,
  seedClientAuthFromServer,
  type ServerAuthSeed,
} from '../auth-storage';

function createInitialState(overrides: Partial<ServerAuthSeed> = {}): ServerAuthSeed {
  return {
    token: 'server-token',
    userId: 'user-1',
    user: {
      id: 'user-1',
      email: 'user@example.com',
      profile: { name: 'Tester' },
    },
    ...overrides,
  };
}

describe('seedClientAuthFromServer', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('writes token and user to storage when server state is present', () => {
    const result = seedClientAuthFromServer(createInitialState(), localStorage);

    expect(result).toBe('seeded');
    expect(localStorage.getItem(INSFORGE_AUTH_TOKEN_KEY)).toBe('server-token');
    expect(localStorage.getItem(INSFORGE_AUTH_USER_KEY)).toBe(JSON.stringify({
      id: 'user-1',
      email: 'user@example.com',
      profile: { name: 'Tester' },
    }));
  });

  it('returns unchanged when storage is already synchronized', () => {
    const state = createInitialState();
    localStorage.setItem(INSFORGE_AUTH_TOKEN_KEY, 'server-token');
    localStorage.setItem(INSFORGE_AUTH_USER_KEY, JSON.stringify({
      id: 'user-1',
      email: 'user@example.com',
      profile: { name: 'Tester' },
    }));

    const result = seedClientAuthFromServer(state, localStorage);

    expect(result).toBe('unchanged');
  });

  it('overwrites stale storage when server token changes', () => {
    localStorage.setItem(INSFORGE_AUTH_TOKEN_KEY, 'stale-token');
    localStorage.setItem(INSFORGE_AUTH_USER_KEY, JSON.stringify({
      id: 'user-1',
      email: 'old@example.com',
      profile: null,
    }));

    const result = seedClientAuthFromServer(createInitialState(), localStorage);

    expect(result).toBe('seeded');
    expect(localStorage.getItem(INSFORGE_AUTH_TOKEN_KEY)).toBe('server-token');
  });

  it('skips when token is missing', () => {
    const result = seedClientAuthFromServer(createInitialState({ token: null }), localStorage);

    expect(result).toBe('skipped');
    expect(localStorage.getItem(INSFORGE_AUTH_TOKEN_KEY)).toBeNull();
  });

  it('returns unavailable when storage is not accessible', () => {
    const brokenStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };

    const result = seedClientAuthFromServer(createInitialState(), brokenStorage);

    expect(result).toBe('unavailable');
  });
});
