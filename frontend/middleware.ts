import { InsforgeMiddleware } from '@insforge/nextjs/middleware';

const baseUrl = process.env.NEXT_PUBLIC_INSFORGE_URL;
if (!baseUrl) {
  throw new Error('[Middleware] Missing NEXT_PUBLIC_INSFORGE_URL');
}

export default InsforgeMiddleware({
  baseUrl,
  publicRoutes: [
    '/',
    '/today*',
    '/morning*',
    '/stock*',
    '/macro*',
    '/sectors*',
    '/screener*',
    '/login*',
    '/signup*',
    '/auth*',
    '/verify-email*',
    '/pricing*',
    '/contact*',
    '/forgot-password*',
    '/reset-password*',
    '/email-test*',
  ],
  useBuiltInAuth: false,
  signInUrl: '/login',
});

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
