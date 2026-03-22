import { insforge } from './insforge';
import type { UserSchema } from '@insforge/sdk';
import { authDebug, authDebugWarn, getBrowserAuthSnapshot } from './auth-debug';

export interface User {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
}

export interface AuthResult {
  success: boolean;
  user?: User;
  error?: string;
}

interface AuthActionResult extends AuthResult {
  requiresEmailVerification?: boolean;
  email?: string;
}

function mapUser(sdkUser: UserSchema | null | undefined): User | undefined {
  if (!sdkUser) return undefined;
  return {
    id: sdkUser.id,
    email: sdkUser.email,
    name: sdkUser.profile?.name ?? undefined,
    avatarUrl: sdkUser.profile?.avatar_url ?? undefined,
  };
}

// Simple in-memory session cache with JWT expiry tracking
let _sessionCache: { user: UserSchema; accessToken: string; expiresAt: number } | null = null;

function isOAuthCallbackRoute(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.pathname === '/auth/callback';
}

function getJwtExp(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

function setCachedSession(user: UserSchema, accessToken: string): void {
  const expiresAt = getJwtExp(accessToken) ?? (Date.now() + 3600_000);
  _sessionCache = { user, accessToken, expiresAt };
  insforge.getHttpClient().setAuthToken(accessToken);
  authDebug('auth.ts', 'Cached session updated', {
    userId: user.id,
    email: user.email,
    expiresAtIso: new Date(expiresAt).toISOString(),
  });
}

function getSdkSession(): { user: UserSchema; accessToken: string } | null {
  const session = (insforge as unknown as {
    tokenManager?: {
      getSession?: () => { user: UserSchema; accessToken: string } | null;
    };
  }).tokenManager?.getSession?.();

  if (!session?.user || !session.accessToken) {
    authDebug('auth.ts', 'SDK in-memory session missing');
    return null;
  }

  const expiresAt = getJwtExp(session.accessToken);
  if (expiresAt !== null && expiresAt <= Date.now() + 60_000) {
    authDebugWarn('auth.ts', 'SDK in-memory session expired or near expiry', {
      userId: session.user.id,
      email: session.user.email,
      expiresAtIso: new Date(expiresAt).toISOString(),
    });
    return null;
  }

  authDebug('auth.ts', 'SDK in-memory session available', {
    userId: session.user.id,
    email: session.user.email,
    expiresAtIso: expiresAt ? new Date(expiresAt).toISOString() : null,
  });
  return session;
}

async function refreshAndCacheSession(): Promise<{ user: UserSchema; accessToken: string } | null> {
  authDebug('auth.ts', 'Calling insforge.auth.refreshSession()', getBrowserAuthSnapshot());
  const { data, error } = await insforge.auth.refreshSession();
  if (!data?.accessToken || !data.user) {
    authDebugWarn('auth.ts', 'refreshSession returned no usable session', {
      hasData: !!data,
      hasAccessToken: !!data?.accessToken,
      hasUser: !!data?.user,
      error: error?.message ?? null,
      ...getBrowserAuthSnapshot(),
    });
    return null;
  }

  setCachedSession(data.user, data.accessToken);
  authDebug('auth.ts', 'refreshSession succeeded', {
    userId: data.user.id,
    email: data.user.email,
  });
  return _sessionCache;
}

async function getCallbackRouteSession(): Promise<{ user: UserSchema; accessToken: string } | null> {
  if (!isOAuthCallbackRoute()) {
    return null;
  }

  authDebug('auth.ts', 'OAuth callback route detected; waiting for SDK callback handling');
  const { data, error } = await insforge.auth.getCurrentUser();
  authDebug('auth.ts', 'OAuth callback route getCurrentUser() result', {
    hasUser: !!data?.user,
    error: error?.message ?? null,
    ...getBrowserAuthSnapshot(),
  });

  // getCurrentUser() already tried both code exchange AND refresh internally.
  // Check tokenManager (populated by saveSessionFromResponse inside the SDK).
  const sdkSession = getSdkSession();
  if (sdkSession) {
    setCachedSession(sdkSession.user, sdkSession.accessToken);
    return _sessionCache;
  }

  // Whether getCurrentUser() succeeded or failed, we must not fall through to
  // refreshAndCacheSession() — getCurrentUser() already attempted a refresh.
  // Returning null here stops getSessionWithRefresh() from making a duplicate
  // refresh call (which always 401s since getCurrentUser() just tried it).
  return null;
}

async function getSessionWithRefresh(): Promise<{ user: UserSchema; accessToken: string } | null> {
  // Return cached session if still valid (with 60s buffer)
  if (_sessionCache && _sessionCache.expiresAt > Date.now() + 60_000) {
    authDebug('auth.ts', 'Using module session cache', {
      userId: _sessionCache.user.id,
      email: _sessionCache.user.email,
      expiresAtIso: new Date(_sessionCache.expiresAt).toISOString(),
    });
    return _sessionCache;
  }

  // On OAuth callback route, delegate entirely to getCurrentUser() which correctly
  // awaits authCallbackHandled (the PKCE code exchange promise).
  // Do NOT fall through to refreshAndCacheSession() — getCurrentUser() already
  // attempts a refresh internally, so a duplicate call would always 401.
  if (isOAuthCallbackRoute()) {
    return await getCallbackRouteSession();
  }

  const sdkSession = getSdkSession();
  if (sdkSession) {
    setCachedSession(sdkSession.user, sdkSession.accessToken);
    return _sessionCache;
  }

  const refreshedSession = await refreshAndCacheSession();
  if (refreshedSession) {
    return refreshedSession;
  }

  _sessionCache = null;
  authDebugWarn('auth.ts', 'No session available after cache/sdk/refresh checks', getBrowserAuthSnapshot());
  return null;
}

export async function getCurrentAuthSession(force?: boolean): Promise<{ authenticated: boolean; user: User | null; accessToken: string | null }> {
  authDebug('auth.ts', 'getCurrentAuthSession() start', {
    force: !!force,
    hasModuleCache: !!_sessionCache,
    ...getBrowserAuthSnapshot(),
  });
  if (force) _sessionCache = null;
  const session = await getSessionWithRefresh();
  if (!session) {
    authDebugWarn('auth.ts', 'getCurrentAuthSession() resolved unauthenticated');
    return { authenticated: false, user: null, accessToken: null };
  }
  authDebug('auth.ts', 'getCurrentAuthSession() resolved authenticated', {
    userId: session.user.id,
    email: session.user.email,
  });
  return {
    authenticated: true,
    user: mapUser(session.user) ?? null,
    accessToken: session.accessToken,
  };
}

export async function signIn(email: string, password: string): Promise<AuthActionResult> {
  const { data, error } = await insforge.auth.signInWithPassword({ email, password });
  if (error || !data) {
    return { success: false, error: error?.message ?? 'Authentication failed' };
  }
  setCachedSession(data.user, data.accessToken);
  return { success: true, user: mapUser(data.user) };
}

export async function signUp(
  email: string,
  password: string,
  name?: string,
  emailRedirectTo?: string,
): Promise<AuthActionResult> {
  const { data, error } = await insforge.auth.signUp({
    email,
    password,
    name,
    options: emailRedirectTo ? { emailRedirectTo } : undefined,
  });
  if (error || !data) {
    return { success: false, error: error?.message ?? 'Sign up failed' };
  }
  if (data.requireEmailVerification) {
    return { success: true, requiresEmailVerification: true, email };
  }
  if (data.user && data.accessToken) {
    setCachedSession(data.user, data.accessToken);
  }
  return { success: true, user: mapUser(data.user ?? undefined) };
}

export async function signInWithGoogle(): Promise<{ success: boolean; error?: string }> {
  const callbackUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/auth/callback`
    : '/auth/callback';
  authDebug('auth.ts', 'Starting Google OAuth', {
    callbackUrl,
    ...getBrowserAuthSnapshot(),
  });
  const { error } = await insforge.auth.signInWithOAuth({
    provider: 'google',
    redirectTo: callbackUrl,
  });
  if (error) {
    authDebugWarn('auth.ts', 'Google OAuth init failed', {
      error: error.message,
      ...getBrowserAuthSnapshot(),
    });
    return { success: false, error: error.message };
  }
  authDebug('auth.ts', 'Google OAuth init succeeded; browser redirect should follow');
  return { success: true };
}

export async function completeOAuthSignIn(): Promise<AuthActionResult> {
  authDebug('auth.ts', 'Completing OAuth sign-in', getBrowserAuthSnapshot());
  const { data, error } = await insforge.auth.getCurrentUser();
  if (!data?.user) {
    authDebugWarn('auth.ts', 'getCurrentUser returned no user during OAuth callback', {
      error: error?.message ?? null,
      ...getBrowserAuthSnapshot(),
    });
    return { success: false, error: 'OAuth authentication failed' };
  }
  authDebug('auth.ts', 'OAuth callback produced current user', {
    userId: data.user.id,
    email: data.user.email,
    ...getBrowserAuthSnapshot(),
  });
  // getCurrentUser() already awaited authCallbackHandled and populated tokenManager.
  // Read directly from tokenManager to warm _sessionCache — no second getCurrentUser() call.
  const sdkSession = getSdkSession();
  if (sdkSession) {
    setCachedSession(sdkSession.user, sdkSession.accessToken);
  }
  return { success: true, user: mapUser(sdkSession?.user ?? data.user) };
}

export async function verifyEmail(otp: string, email?: string): Promise<AuthActionResult> {
  const { data, error } = await insforge.auth.verifyEmail({ otp, email });
  if (error || !data) {
    return { success: false, error: error?.message ?? 'Verification failed' };
  }
  setCachedSession(data.user, data.accessToken);
  return { success: true, user: mapUser(data.user) };
}

export async function resendVerificationEmail(
  email: string,
  _emailRedirectTo?: string,
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await insforge.auth.resendVerificationEmail({ email });
  if (error || !data) {
    return { success: false, error: error?.message ?? '重新发送失败，请稍后重试' };
  }
  return { success: data.success };
}

export async function updateProfile(
  profile: { name?: string },
): Promise<{ success: boolean; user?: User; error?: string }> {
  const { error } = await insforge.auth.setProfile(profile);
  if (error) {
    return { success: false, error: error.message };
  }
  _sessionCache = null; // clear cache to pick up updated profile
  const session = await getSessionWithRefresh();
  return { success: true, user: mapUser(session?.user) };
}

export async function signOut(): Promise<{ success: boolean; error?: string }> {
  const { error } = await insforge.auth.signOut();
  if (error) return { success: false, error: error.message };
  _sessionCache = null;
  insforge.getHttpClient().setAuthToken(null);
  return { success: true };
}

export async function getAccessToken(): Promise<string | null> {
  authDebug('auth.ts', 'getAccessToken() start', {
    hasModuleCache: !!_sessionCache,
  });
  const session = await getSessionWithRefresh();
  authDebug('auth.ts', 'getAccessToken() result', {
    hasToken: !!session?.accessToken,
    userId: session?.user.id ?? null,
    email: session?.user.email ?? null,
  });
  return session?.accessToken ?? null;
}

export async function clearStaleAuthStateWithoutRedirect(): Promise<void> {
  _sessionCache = null;
  await insforge.auth.signOut().catch(() => {});
}

export async function sendPasswordResetEmail(
  email: string,
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await insforge.auth.sendResetPasswordEmail({ email });
  if (error) return { success: false, error: error.message };
  return { success: data?.success ?? false };
}

export async function exchangeResetPasswordCode(
  email: string,
  code: string,
): Promise<{ success: boolean; token?: string; error?: string }> {
  const { data, error } = await insforge.auth.exchangeResetPasswordToken({ email, code });
  if (error) return { success: false, error: error.message };
  if (!data?.token) return { success: false, error: 'Invalid reset code' };
  return { success: true, token: data.token };
}

export async function resetPassword(
  newPassword: string,
  otp: string,
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await insforge.auth.resetPassword({ newPassword, otp });
  if (error) return { success: false, error: error.message };
  return { success: !!data?.message };
}

export function __resetAuthTestState() {
  _sessionCache = null;
}
