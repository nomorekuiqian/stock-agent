import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_ROUTES = [
  '/',
  '/today',
  '/morning',
  '/stock',
  '/macro',
  '/sectors',
  '/screener',
  '/login',
  '/signup',
  '/auth',
  '/verify-email',
  '/pricing',
  '/contact',
  '/forgot-password',
  '/reset-password',
  '/email-test',
];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  const hasSession =
    request.cookies.has('insforge-session') ||
    request.cookies.has('insforge-refresh');

  if (!hasSession) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
