import { cookies } from 'next/headers';

const ACCESS_TOKEN_COOKIE = 'app_access_token';
const REFRESH_TOKEN_COOKIE = 'app_refresh_token';
const OAUTH_CODE_VERIFIER_COOKIE = 'app_oauth_cv';

const COOKIE_OPTIONS_BASE = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

export async function setAuthCookies(accessToken: string, refreshToken?: string) {
  const cookieStore = await cookies();
  cookieStore.set(ACCESS_TOKEN_COOKIE, accessToken, {
    ...COOKIE_OPTIONS_BASE,
    maxAge: 15 * 60, // 15 minutes
  });
  if (refreshToken) {
    cookieStore.set(REFRESH_TOKEN_COOKIE, refreshToken, {
      ...COOKIE_OPTIONS_BASE,
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });
  }
}

export async function getAuthCookies() {
  const cookieStore = await cookies();
  return {
    accessToken: cookieStore.get(ACCESS_TOKEN_COOKIE)?.value ?? null,
    refreshToken: cookieStore.get(REFRESH_TOKEN_COOKIE)?.value ?? null,
  };
}

export async function clearAuthCookies() {
  const cookieStore = await cookies();
  cookieStore.delete(ACCESS_TOKEN_COOKIE);
  cookieStore.delete(REFRESH_TOKEN_COOKIE);
  cookieStore.delete(OAUTH_CODE_VERIFIER_COOKIE);
}

export async function setOAuthCodeVerifier(codeVerifier: string) {
  const cookieStore = await cookies();
  cookieStore.set(OAUTH_CODE_VERIFIER_COOKIE, codeVerifier, {
    ...COOKIE_OPTIONS_BASE,
    maxAge: 10 * 60, // 10 minutes
  });
}

export async function getAndClearOAuthCodeVerifier() {
  const cookieStore = await cookies();
  const value = cookieStore.get(OAUTH_CODE_VERIFIER_COOKIE)?.value ?? null;
  if (value) {
    cookieStore.delete(OAUTH_CODE_VERIFIER_COOKIE);
  }
  return value;
}
