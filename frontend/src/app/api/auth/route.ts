import { createAuthRouteHandlers } from '@insforge/nextjs/api';

const baseUrl = process.env.NEXT_PUBLIC_INSFORGE_URL;
if (!baseUrl) {
  throw new Error('[Auth Route] Missing NEXT_PUBLIC_INSFORGE_URL');
}

const handlers = createAuthRouteHandlers({
  baseUrl,
});

export const POST = handlers.POST;
export const GET = handlers.GET;
export const DELETE = handlers.DELETE;
