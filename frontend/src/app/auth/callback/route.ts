import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/insforge-server';
import { setAuthCookies, getAndClearOAuthCodeVerifier } from '@/lib/auth-cookies';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get('insforge_code') || searchParams.get('code');
  const error = searchParams.get('error');
  const redirect = searchParams.get('redirect') || '/today';
  const baseUrl = request.nextUrl.origin;

  if (error) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error)}`, baseUrl),
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL('/login?error=no_auth_code', baseUrl),
    );
  }

  const codeVerifier = await getAndClearOAuthCodeVerifier();

  const client = createServerClient();
  const { data, error: exchangeError } = await client.auth.exchangeOAuthCode(
    code,
    codeVerifier ?? undefined,
  );

  if (exchangeError || !data?.accessToken || !data.user) {
    return NextResponse.redirect(
      new URL(
        `/login?error=${encodeURIComponent(exchangeError?.message ?? 'code_exchange_failed')}`,
        baseUrl,
      ),
    );
  }

  await setAuthCookies(data.accessToken, data.refreshToken);

  // Detect new user: check if they have a subscription record.
  // If not, this is a first-time registration — activate trial + send to onboarding.
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';
  let isNewUser = false;
  try {
    const trialRes = await fetch(`${apiUrl}/invites/auto-trial`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${data.accessToken}` },
    });
    if (trialRes.ok) {
      const trialData = await trialRes.json();
      isNewUser = !trialData.already_active;
    }
  } catch {
    // Non-blocking: if auto-trial fails, client-side fallback will retry
  }

  // New users go to onboarding; returning users go to their intended destination
  const safePath = redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/today';
  const finalPath = isNewUser ? '/onboarding' : safePath;

  return NextResponse.redirect(new URL(finalPath, baseUrl));
}
