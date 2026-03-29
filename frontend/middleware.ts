import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_ROUTES = [
  '/',
  '/today',
  '/morning',
  '/stock',
  '/market',
  '/reports',
  '/contact',
  '/feedback',
  '/unsubscribe',
  '/login',
  '/verify-email',
  '/forgot-password',
  '/reset-password',
  '/auth/callback',
  '/email-test',
];

const ACCESS_COOKIE = 'app_access_token';
const REFRESH_COOKIE = 'app_refresh_token';

function isPublicRoute(pathname: string) {
  return PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

function getJwtExp(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export default async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;

  // No tokens at all — redirect to login
  if (!accessToken && !refreshToken) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  // Access token present and not expired — allow through
  if (accessToken) {
    const exp = getJwtExp(accessToken);
    if (exp === null || exp > Date.now() + 30_000) {
      return NextResponse.next();
    }
  }

  // Access token expired or missing, but refresh token exists — try inline refresh
  if (refreshToken) {
    try {
      const insforgeUrl = process.env.INSFORGE_URL;
      const anonKey = process.env.INSFORGE_ANON_KEY;
      if (insforgeUrl && anonKey) {
        const refreshResponse = await fetch(`${insforgeUrl}/api/auth/refresh`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': anonKey,
          },
          body: JSON.stringify({ refreshToken, client_type: 'mobile' }),
        });

        if (refreshResponse.ok) {
          const data = await refreshResponse.json();
          if (data.accessToken) {
            const response = NextResponse.next();
            response.cookies.set(ACCESS_COOKIE, data.accessToken, {
              httpOnly: true,
              secure: process.env.NODE_ENV === 'production',
              sameSite: 'lax',
              path: '/',
              maxAge: 15 * 60,
            });
            return response;
          }
        }
      }
    } catch {
      // Refresh failed — allow through, /api/auth/session will handle
    }
  }

  // Refresh token exists but refresh failed — allow through for client-side fallback
  if (refreshToken) {
    return NextResponse.next();
  }

  // No valid session — redirect to login
  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('redirect', `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
