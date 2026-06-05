'use server';

import { Buffer } from 'node:buffer';

import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/insforge-server';
import {
  setAuthCookies,
  getAuthCookies,
  clearAuthCookies,
  setOAuthCodeVerifier,
} from '@/lib/auth-cookies';
import type { UserSchema } from '@insforge/sdk';

export interface User {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
}

export interface AuthActionResult {
  success: boolean;
  user?: User;
  error?: string;
  accessToken?: string;
}

export interface SignUpActionResult extends AuthActionResult {
  requiresEmailVerification?: boolean;
  email?: string;
}

export interface OAuthStartResult {
  success: boolean;
  url?: string;
  error?: string;
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

async function isE2EAuthMockEnabled(): Promise<boolean> {
  if (process.env.E2E_AUTH_MOCK === '1') return true;
  if (process.env.NODE_ENV === 'production') return false;
  try {
    const cookieStore = await cookies();
    return cookieStore.get('e2e_auth_mock')?.value === '1';
  } catch {
    return false;
  }
}

function createE2EJwt(user: User): string {
  const encode = (value: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');

  return [
    encode({ alg: 'HS256', typ: 'JWT' }),
    encode({
      sub: user.id,
      email: user.email,
      name: user.name,
      exp: Math.floor(Date.now() / 1000) + 60 * 60,
    }),
    'e2e-signature',
  ].join('.');
}

async function setE2EAuth(user: User): Promise<AuthActionResult> {
  const accessToken = createE2EJwt(user);
  await setAuthCookies(accessToken, 'e2e-refresh-token');
  return { success: true, user, accessToken };
}

export async function signInAction(
  email: string,
  password: string,
): Promise<AuthActionResult> {
  if (await isE2EAuthMockEnabled()) {
    if (password.toLowerCase().includes('wrong')) {
      return { success: false, error: 'Invalid credentials' };
    }
    return setE2EAuth({
      id: 'user-123',
      email,
      name: 'Test User',
    });
  }

  const client = createServerClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data) {
    return { success: false, error: error?.message ?? 'Authentication failed' };
  }
  await setAuthCookies(data.accessToken, data.refreshToken);
  return { success: true, user: mapUser(data.user), accessToken: data.accessToken };
}

export async function signUpAction(
  email: string,
  password: string,
  name?: string,
  emailRedirectTo?: string,
): Promise<SignUpActionResult> {
  if (await isE2EAuthMockEnabled()) {
    if (email.toLowerCase().includes('existing')) {
      return { success: false, error: 'User already exists' };
    }
    return { success: true, requiresEmailVerification: true, email };
  }

  const client = createServerClient();
  const { data, error } = await client.auth.signUp({
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
    await setAuthCookies(data.accessToken, data.refreshToken);
  }
  return { success: true, user: mapUser(data.user ?? undefined), accessToken: data.accessToken ?? undefined };
}

export async function signOutAction(): Promise<{ success: boolean; error?: string }> {
  try {
    const { accessToken } = await getAuthCookies();
    const client = createServerClient(accessToken ?? undefined);
    await client.auth.signOut();
  } catch {
    // Ignore signOut errors — we clear cookies regardless
  }
  await clearAuthCookies();
  return { success: true };
}

export async function verifyEmailAction(
  otp: string,
  email?: string,
): Promise<AuthActionResult> {
  if (await isE2EAuthMockEnabled()) {
    if (otp === '999999') {
      return { success: false, error: 'Invalid verification code' };
    }
    return setE2EAuth({
      id: 'verified-user-123',
      email: email || 'fresh-user@example.com',
      name: 'Fresh User',
    });
  }

  const client = createServerClient();
  const { data, error } = await client.auth.verifyEmail({ otp, email });
  if (error || !data) {
    return { success: false, error: error?.message ?? 'Verification failed' };
  }
  await setAuthCookies(data.accessToken, data.refreshToken);
  return { success: true, user: mapUser(data.user), accessToken: data.accessToken };
}

export async function resendVerificationEmailAction(
  email: string,
): Promise<{ success: boolean; error?: string }> {
  if (await isE2EAuthMockEnabled()) {
    return { success: true };
  }

  const client = createServerClient();
  const { data, error } = await client.auth.resendVerificationEmail({ email });
  if (error || !data) {
    return { success: false, error: error?.message ?? '重新发送失败，请稍后重试' };
  }
  return { success: data.success };
}

export async function updateProfileAction(
  profile: { name?: string },
): Promise<AuthActionResult> {
  const { accessToken, refreshToken } = await getAuthCookies();
  if (!accessToken) {
    return { success: false, error: 'Not authenticated' };
  }
  const client = createServerClient(accessToken);
  const { error } = await client.auth.setProfile(profile);
  if (error) {
    return { success: false, error: error.message };
  }
  // Refresh to get updated user profile
  if (refreshToken) {
    const { data: refreshData } = await client.auth.refreshSession({ refreshToken });
    if (refreshData) {
      await setAuthCookies(refreshData.accessToken);
      return { success: true, user: mapUser(refreshData.user) };
    }
  }
  return { success: true };
}

export async function sendPasswordResetEmailAction(
  email: string,
): Promise<{ success: boolean; error?: string }> {
  const client = createServerClient();
  const { data, error } = await client.auth.sendResetPasswordEmail({ email });
  if (error) return { success: false, error: error.message };
  return { success: data?.success ?? false };
}

export async function exchangeResetPasswordCodeAction(
  email: string,
  code: string,
): Promise<{ success: boolean; token?: string; error?: string }> {
  const client = createServerClient();
  const { data, error } = await client.auth.exchangeResetPasswordToken({ email, code });
  if (error) return { success: false, error: error.message };
  if (!data?.token) return { success: false, error: 'Invalid reset code' };
  return { success: true, token: data.token };
}

export async function resetPasswordAction(
  newPassword: string,
  otp: string,
): Promise<{ success: boolean; error?: string }> {
  const client = createServerClient();
  const { data, error } = await client.auth.resetPassword({ newPassword, otp });
  if (error) return { success: false, error: error.message };
  return { success: !!data?.message };
}

export async function startOAuthAction(
  provider: 'google',
  callbackUrl: string,
): Promise<OAuthStartResult> {
  const client = createServerClient();
  const { data, error } = await client.auth.signInWithOAuth({
    provider,
    redirectTo: callbackUrl,
    skipBrowserRedirect: true,
  });
  if (error || !data?.url) {
    return { success: false, error: error?.message ?? 'OAuth init failed' };
  }
  if (data.codeVerifier) {
    await setOAuthCodeVerifier(data.codeVerifier);
  }
  return { success: true, url: data.url };
}

export async function clearStaleAuthAction(): Promise<void> {
  await clearAuthCookies();
}
