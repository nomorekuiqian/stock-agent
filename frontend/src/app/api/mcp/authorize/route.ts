import { isFeaturePaused } from '@/lib/feature-pause';
import { NextResponse } from 'next/server';
import { getAuthCookies } from '@/lib/auth-cookies';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

function redirectTo(request: Request, path: string) {
  return NextResponse.redirect(new URL(path, request.url));
}

export async function POST(request: Request) {
  if (isFeaturePaused('mcp')) return NextResponse.json({ error: 'feature_paused' }, { status: 403 });
  const formData = await request.formData();
  const userCode = String(formData.get('user_code') || '').trim().toUpperCase();
  const authorizePath = `/mcp/authorize?user_code=${encodeURIComponent(userCode)}`;

  if (!userCode) {
    return redirectTo(request, '/mcp/authorize?error=Missing%20authorization%20code');
  }

  const { accessToken } = await getAuthCookies();
  if (!accessToken) {
    return redirectTo(request, `/login?redirect=${encodeURIComponent(authorizePath)}`);
  }

  try {
    const response = await fetch(`${API_BASE_URL}/kol_research/mcp/auth/device/authorize`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ user_code: userCode }),
      cache: 'no-store',
    });

    if (!response.ok) {
      let message = 'Authorization failed';
      try {
        const payload = await response.json();
        message = typeof payload.detail === 'string' ? payload.detail : message;
      } catch {
        // Keep default message.
      }
      return redirectTo(
        request,
        `${authorizePath}&error=${encodeURIComponent(message)}`,
      );
    }

    return redirectTo(request, `${authorizePath}&status=approved`);
  } catch {
    return redirectTo(
      request,
      `${authorizePath}&error=${encodeURIComponent('Authorization service unavailable')}`,
    );
  }
}
