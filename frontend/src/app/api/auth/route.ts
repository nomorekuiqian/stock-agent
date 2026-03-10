import { createAuthRouteHandlers } from '@insforge/nextjs/api';
import { NextRequest, NextResponse } from 'next/server';
import {
  buildCookieOptions,
  buildExpiredCookieOptions,
  extractRefreshToken,
} from './helpers';

const baseUrl = process.env.NEXT_PUBLIC_INSFORGE_URL || 'https://9wmhxyi4.us-east.insforge.app';
const INSFORGE_ANON_KEY = process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY || '';

const handlers = createAuthRouteHandlers({
  baseUrl,
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (body.action === 'login' && body.email && body.password) {
      const insforgeRes = await fetch(`${baseUrl}/api/auth/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${INSFORGE_ANON_KEY}`,
          'apikey': INSFORGE_ANON_KEY,
        },
        body: JSON.stringify({ email: body.email, password: body.password }),
        cache: 'no-store',
      });

      let data;
      try {
        data = await insforgeRes.json();
      } catch {
        return NextResponse.json(
          { success: false, error: 'Invalid response from auth service' },
          { status: 502 },
        );
      }

      if (!insforgeRes.ok) {
        return NextResponse.json(
          { success: false, error: data.message || data.error || 'Login failed' },
          { status: insforgeRes.status },
        );
      }

      const response = NextResponse.json({
        success: true,
        accessToken: data.accessToken,
        user: data.user,
      });
      const refreshToken = extractRefreshToken(insforgeRes);
      const rememberMe = body.rememberMe !== false;

      response.cookies.set(
        'insforge-session',
        data.accessToken,
        buildCookieOptions(request, rememberMe, 60 * 60 * 24 * 7),
      );

      if (refreshToken) {
        response.cookies.set(
          'insforge-refresh',
          refreshToken,
          buildCookieOptions(request, rememberMe, 60 * 60 * 24 * 30),
        );
      }

      if (data.csrfToken) {
        response.cookies.set(
          'insforge-csrf',
          data.csrfToken,
          buildCookieOptions(request, rememberMe, 60 * 60 * 24 * 30),
        );
      }

      return response;
    }

    const newRequest = new NextRequest(request.url, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify(body),
    });

    return handlers.POST(newRequest);
  } catch {
    return handlers.POST(request);
  }
}

export const GET = handlers.GET;

export async function DELETE(request: NextRequest) {
  const response = await handlers.DELETE(request);
  const expired = buildExpiredCookieOptions(request);

  response.cookies.set('insforge-session', '', expired);
  response.cookies.set('insforge-refresh', '', expired);
  response.cookies.set('insforge-csrf', '', expired);
  response.cookies.set('insforge-user', '', expired);

  return response;
}
