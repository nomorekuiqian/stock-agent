export const INSFORGE_AUTH_TOKEN_KEY = 'insforge-auth-token';
export const INSFORGE_AUTH_USER_KEY = 'insforge-auth-user';

type MutableAuthStorage = Pick<Storage, 'removeItem'>;

function getBrowserStorage(): MutableAuthStorage | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function clearClientAuthStorage(storage: MutableAuthStorage | null = getBrowserStorage()): boolean {
  if (!storage) {
    return false;
  }

  try {
    storage.removeItem(INSFORGE_AUTH_TOKEN_KEY);
    storage.removeItem(INSFORGE_AUTH_USER_KEY);
    return true;
  } catch {
    return false;
  }
}
