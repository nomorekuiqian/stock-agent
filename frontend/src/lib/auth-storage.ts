import type { InitialAuthState } from '@insforge/nextjs';

export const INSFORGE_AUTH_TOKEN_KEY = 'insforge-auth-token';
export const INSFORGE_AUTH_USER_KEY = 'insforge-auth-user';

interface StoredAuthUser {
  id: string;
  email: string;
  profile: unknown;
}

export interface ServerAuthSeed extends InitialAuthState {
  token?: string | null;
}

type AuthStorage = Pick<Storage, 'getItem' | 'setItem'>;

export type ClientAuthSeedResult = 'seeded' | 'unchanged' | 'skipped' | 'unavailable';

function buildStoredUser(initialState: ServerAuthSeed): StoredAuthUser | null {
  if (!initialState.userId) {
    return null;
  }

  return {
    id: initialState.userId,
    email: initialState.user?.email || '',
    profile: initialState.user?.profile || null,
  };
}

function getBrowserStorage(): AuthStorage | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function seedClientAuthFromServer(
  initialState?: ServerAuthSeed,
  storage: AuthStorage | null = getBrowserStorage()
): ClientAuthSeedResult {
  if (!initialState?.token || !initialState.userId) {
    return 'skipped';
  }

  if (!storage) {
    return 'unavailable';
  }

  const storedUser = buildStoredUser(initialState);
  if (!storedUser) {
    return 'skipped';
  }

  const nextUser = JSON.stringify(storedUser);

  try {
    const currentToken = storage.getItem(INSFORGE_AUTH_TOKEN_KEY);
    const currentUser = storage.getItem(INSFORGE_AUTH_USER_KEY);

    if (currentToken === initialState.token && currentUser === nextUser) {
      return 'unchanged';
    }

    storage.setItem(INSFORGE_AUTH_TOKEN_KEY, initialState.token);
    storage.setItem(INSFORGE_AUTH_USER_KEY, nextUser);
    return 'seeded';
  } catch {
    return 'unavailable';
  }
}
