import { createAuthRouteHandlers } from '@insforge/nextjs/api';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { buildCookieOptions, extractRefreshToken } from './helpers';

const baseUrl = process.env.NEXT_PUBLIC_INSFORGE_URL || 'https://9wmhxyi4.us-east.insforge.app';
const INSFORGE_ANON_KEY = process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY || '';

const handlers = createAuthRouteHandlers({
  baseUrl,
});

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // --- Server-side login proxy ---
    // Frontend calls this instead of SDK signInWithPassword so we can capture
    // the refresh token from Insforge's Set-Cookie header (not in response body).
    if (body.action === 'login' && body.email && body.password) {
      const insforgeRes = await fetch(`${baseUrl}/api/auth/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${INSFORGE_ANON_KEY}`,
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
          { status: 502 }
        );
      }

      if (!insforgeRes.ok) {
        return NextResponse.json(
          { success: false, error: data.message || data.error || 'Login failed' },
          { status: insforgeRes.status }
        );
      }

      const refreshToken = extractRefreshToken(insforgeRes);
      const rememberMe = body.rememberMe !== false;
      const cookieStore = await cookies();

      // Store access token in our httpOnly cookie
      cookieStore.set(
        'insforge-session',
        data.accessToken,
        buildCookieOptions(rememberMe, 60 * 60 * 24 * 7) // 7 days
      );

      // Store refresh token in our httpOnly cookie
      if (refreshToken) {
        cookieStore.set(
          'insforge-refresh',
          refreshToken,
          buildCookieOptions(rememberMe, 60 * 60 * 24 * 30) // 30 days
        );
      }

      // Store CSRF token — required by Insforge's /api/auth/refresh endpoint
      if (data.csrfToken) {
        cookieStore.set(
          'insforge-csrf',
          data.csrfToken,
          buildCookieOptions(rememberMe, 60 * 60 * 24 * 30) // 30 days
        );
      }

      return NextResponse.json({
        success: true,
        accessToken: data.accessToken,
        user: data.user,
      });
    }

    // For other actions (sync-token etc.), delegate to the SDK's default handler
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

// Override DELETE to also clear our custom cookies (insforge-refresh, insforge-csrf)
// that are set by the server proxy login but not managed by the SDK's default handler.
export async function DELETE(request: NextRequest) {
  const response = await handlers.DELETE(request);
  response.cookies.set('insforge-refresh', '', { maxAge: 0, path: '/' });
  response.cookies.set('insforge-csrf', '', { maxAge: 0, path: '/' });
  return response;
}
