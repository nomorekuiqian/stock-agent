import { InsforgeMiddleware } from '@insforge/nextjs/middleware';

const INSFORGE_BASE_URL =
  process.env.INSFORGE_BASE_URL || process.env.NEXT_PUBLIC_INSFORGE_URL || 'https://9wmhxyi4.us-east.insforge.app';

export default InsforgeMiddleware({
  baseUrl: INSFORGE_BASE_URL,
  useBuiltInAuth: false,
  signInUrl: '/login',
  signUpUrl: '/login',
  forgotPasswordUrl: '/forgot-password',
  publicRoutes: [
    '/',
    '/today*',
    '/morning*',
    '/stock*',
    '/market',
    '/reports*',
    '/contact',
    '/feedback',
    '/unsubscribe',
    '/login',
    '/verify-email',
    '/forgot-password',
    '/reset-password',
    '/auth/callback',
    '/email-test',
  ],
});

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
