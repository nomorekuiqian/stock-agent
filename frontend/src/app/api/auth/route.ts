import { createAuthRouteHandlers } from '@insforge/nextjs/api';

const baseUrl = process.env.NEXT_PUBLIC_INSFORGE_URL || 'https://9wmhxyi4.us-east.insforge.app';

const handlers = createAuthRouteHandlers({
  baseUrl,
});

export const POST = handlers.POST;
export const GET = handlers.GET;
export const DELETE = handlers.DELETE;
