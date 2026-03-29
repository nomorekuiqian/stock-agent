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

  // Validate redirect path to prevent open redirect
  const safePath = redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/today';

  return NextResponse.redirect(new URL(safePath, baseUrl));
}
