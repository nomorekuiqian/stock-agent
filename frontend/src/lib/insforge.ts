import { createClient } from '@insforge/sdk';

// Insforge configuration - MUST be set via environment variables
const INSFORGE_BASE_URL = process.env.NEXT_PUBLIC_INSFORGE_URL;
const INSFORGE_ANON_KEY = process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY;

if (!INSFORGE_BASE_URL || !INSFORGE_ANON_KEY) {
  console.error('[Insforge] Missing environment variables: NEXT_PUBLIC_INSFORGE_URL or NEXT_PUBLIC_INSFORGE_ANON_KEY');
}

export const insforge = createClient({
  baseUrl: INSFORGE_BASE_URL,
  anonKey: INSFORGE_ANON_KEY,
});

// Module-level cache for the last valid auth token.
// Set by ensureAuth when a session is found, and also externally via setAuthCache()
// so that auth.ts getCurrentUser() can share its token with DB operations.
let _cachedAuthToken: string | null = null;

/**
 * Allow external callers (auth.ts) to share a validated token with ensureAuth.
 * This avoids the problem where calling getCurrentSession() a second time
 * triggers a failed token refresh that clears the SDK's in-memory state.
 */
export function setAuthCache(token: string | null): void {
  _cachedAuthToken = token;
}

export function getAuthCache(): string | null {
  return _cachedAuthToken;
}

/**
 * Ensure Insforge HTTP client has a valid auth token.
 * Checks cached token first (set by auth.ts getCurrentUser),
 * then tries SDK session, then httpOnly cookies, then localStorage.
 * Returns the session data if available, or null.
 */
export async function ensureAuth(skipCache = false): Promise<{ accessToken: string; session: unknown } | null> {
  // 1. Use cached token from auth.ts getCurrentUser() if available.
  if (!skipCache && _cachedAuthToken) {
    insforge.getHttpClient().setAuthToken(_cachedAuthToken);
    return { accessToken: _cachedAuthToken, session: null };
  }

  // 2. Try SDK in-memory session
  if (!skipCache) {
    const { data: sessionData } = await insforge.auth.getCurrentSession();
    if (sessionData?.session?.accessToken) {
      insforge.getHttpClient().setAuthToken(sessionData.session.accessToken);
      _cachedAuthToken = sessionData.session.accessToken;
      return { accessToken: sessionData.session.accessToken, session: sessionData.session };
    }
  }

  // 3. Recover from httpOnly cookies (performs actual token refresh if expired)
  try {
    const res = await fetch('/api/auth/session');
    if (res.ok) {
      const cookieData = await res.json();
      if (cookieData.authenticated && cookieData.accessToken) {
        insforge.getHttpClient().setAuthToken(cookieData.accessToken);
        _cachedAuthToken = cookieData.accessToken;
        return { accessToken: cookieData.accessToken, session: cookieData };
      }
    }
  } catch {
    // cookie recovery failed
  }

  // 4. Recover from localStorage (auth.ts persists token here)
  if (typeof window !== 'undefined') {
    try {
      const storedToken = localStorage.getItem('insforge-auth-token');
      if (storedToken) {
        insforge.getHttpClient().setAuthToken(storedToken);
        return { accessToken: storedToken, session: null };
      }
    } catch {
      // localStorage recovery failed
    }
  }

  return null;
}
