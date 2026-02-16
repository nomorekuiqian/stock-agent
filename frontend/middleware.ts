import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest): NextResponse {
  const response = NextResponse.next();

  // Check for session cookie and signal to client
  const hasSession = request.cookies.has('insforge-session');
  response.headers.set('x-has-session', hasSession ? '1' : '0');

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
