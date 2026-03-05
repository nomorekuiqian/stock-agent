import { InsforgeMiddleware } from '@insforge/nextjs/middleware';

export default InsforgeMiddleware({
  baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL || 'https://9wmhxyi4.us-east.insforge.app',
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
