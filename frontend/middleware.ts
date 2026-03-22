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

const AUTH_HINT_COOKIES = ['insforge_csrf_token'];

function isPublicRoute(pathname: string) {
  return PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export default function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  const hasAuthCookie = AUTH_HINT_COOKIES.some((name) => request.cookies.get(name)?.value);
  if (process.env.NODE_ENV !== 'production') {
    const presentCookieNames = AUTH_HINT_COOKIES
      .filter((name) => request.cookies.get(name)?.value);
    console.info('[auth-debug][middleware] Protected route check', {
      pathname,
      search,
      hasAuthCookie,
      presentCookieNames,
    });
  }
  if (hasAuthCookie) {
    return NextResponse.next();
  }

  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('redirect', `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
