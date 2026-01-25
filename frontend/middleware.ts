import { InsforgeMiddleware } from '@insforge/nextjs/middleware';

export default InsforgeMiddleware({
  baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL || 'https://9wmhxyi4.us-east.insforge.app',
  // Public routes that don't require authentication
  publicRoutes: [
    '/',
    '/login',
    '/auth/callback',
    '/market',
    '/today',
    '/stock',
    '/stock/(.*)',
    '/sectors',
    '/tools',
    '/api/(.*)',
  ],
});

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
