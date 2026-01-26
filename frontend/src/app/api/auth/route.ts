import { createAuthRouteHandlers } from '@insforge/nextjs/api';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const baseUrl = process.env.NEXT_PUBLIC_INSFORGE_URL || 'https://9wmhxyi4.us-east.insforge.app';

const handlers = createAuthRouteHandlers({
  baseUrl,
});

// Custom POST handler that handles sync-token action
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Handle sync-token action for OAuth callback
    if (body.action === 'sync-token' && body.accessToken) {
      const cookieStore = await cookies();

      // Set the session cookie (matches what middleware checks)
      cookieStore.set('insforge-session', body.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7, // 7 days
      });

      // Also set refresh token cookie
      if (body.refreshToken) {
        cookieStore.set('insforge-refresh', body.refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: 60 * 60 * 24 * 30, // 30 days
        });
      }

      return NextResponse.json({ success: true });
    }

    // Handle clear-token action for logout
    if (body.action === 'clear-token') {
      const cookieStore = await cookies();
      cookieStore.delete('insforge-session');
      cookieStore.delete('insforge-refresh');
      return NextResponse.json({ success: true });
    }

    // For other actions, use the default handler
    // Re-create the request with the body
    const newRequest = new NextRequest(request.url, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify(body),
    });

    return handlers.POST(newRequest);
  } catch {
    // If JSON parsing fails, pass through to default handler
    return handlers.POST(request);
  }
}

export const GET = handlers.GET;
export const DELETE = handlers.DELETE;
