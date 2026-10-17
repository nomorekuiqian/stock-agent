import { pausedPageRedirect } from './src/lib/feature-pause';
import {
  ACQUISITION_COOKIE_MAX_AGE,
  FIRST_TOUCH_COOKIE,
  LAST_TOUCH_COOKIE,
  buildTouch,
  hasSourceSignal,
} from './src/lib/acquisition';
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
  '/pricing',
  '/frank-agent',
  '/qinbafrank',
  '/webview-check',
  '/macro',
  '/research',
  '/twitter-digest',
  '/kol',
  '/panda',
];

const SEO_FILES = new Set(['/robots.txt', '/sitemap.xml']);
const NOINDEX_ROUTES = [
  '/login', '/auth', '/forgot-password', '/reset-password', '/verify-email',
  '/unsubscribe', '/feedback', '/email-test', '/webview-check', '/pricing/success',
  '/for-you', '/profile', '/settings', '/admin', '/request-access', '/dev', '/mcp',
];

const ACCESS_COOKIE = 'app_access_token';
const REFRESH_COOKIE = 'app_refresh_token';

function isPublicRoute(pathname: string) {
  return PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

function withAcquisitionCookies(request: NextRequest, response: NextResponse): NextResponse {
  // Client-side navigations and prefetches are internal; only document loads carry a source.
  if (request.headers.get('next-router-prefetch') || request.headers.get('rsc')) return response;

  const touch = buildTouch(request.nextUrl, request.headers.get('referer'));
  const options = {
    maxAge: ACQUISITION_COOKIE_MAX_AGE,
    path: '/',
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
  };
  if (!request.cookies.get(FIRST_TOUCH_COOKIE)) {
    response.cookies.set(FIRST_TOUCH_COOKIE, JSON.stringify(touch), options);
  }
  if (hasSourceSignal(touch)) {
    response.cookies.set(LAST_TOUCH_COOKIE, JSON.stringify(touch), options);
  }
  return response;
}

export default function middleware(request: NextRequest) {
  // Exact files only: never expose private routes by file extension.
  if (SEO_FILES.has(request.nextUrl.pathname)) return NextResponse.next();
  const response = withAcquisitionCookies(request, route(request));
  if (NOINDEX_ROUTES.some((path) => request.nextUrl.pathname === path || request.nextUrl.pathname.startsWith(`${path}/`))) {
    response.headers.set('X-Robots-Tag', 'noindex, follow');
  }
  return response;
}

function route(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const pausedRedirect = pausedPageRedirect(pathname, request.nextUrl.searchParams);
  if (pausedRedirect) return NextResponse.redirect(new URL(pausedRedirect, request.url));

  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;

  // Has either token — allow through, /api/auth/session handles refresh
  if (accessToken || refreshToken) {
    return NextResponse.next();
  }

  // No tokens at all — redirect to login
  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('redirect', `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
