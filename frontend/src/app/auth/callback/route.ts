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

  // Detect first-time users via the onboarding-status endpoint. The lifecycle
  // migration backfills every pre-existing account with a completed row, so
  // completed=false now only fires for brand-new signups (no subscription
  // row yet, or a row whose onboarding_completed_at is still NULL).
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';
  let needsOnboarding = false;
  try {
    const res = await fetch(`${apiUrl}/user/onboarding-status`, {
      headers: { Authorization: `Bearer ${data.accessToken}` },
    });
    if (res.ok) {
      const status = await res.json();
      needsOnboarding = status.completed === false;
    }
  } catch {
    // Non-blocking — fall through to intended destination
  }

  const safePath = redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/today';
  const finalPath = needsOnboarding ? '/?tour=1' : safePath;
  return NextResponse.redirect(new URL(finalPath, baseUrl));
}
