import { createAuthRouteHandlers } from '@insforge/nextjs/api';

const handlers = createAuthRouteHandlers({
  baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL || 'https://9wmhxyi4.us-east.insforge.app',
});

export const POST = handlers.POST;
export const GET = handlers.GET;
export const DELETE = handlers.DELETE;
