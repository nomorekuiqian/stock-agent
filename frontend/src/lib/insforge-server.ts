import { createClient } from '@insforge/sdk';

const INSFORGE_URL = process.env.INSFORGE_URL || process.env.NEXT_PUBLIC_INSFORGE_URL;
const INSFORGE_ANON_KEY = process.env.INSFORGE_ANON_KEY || process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY;

export function createServerClient(accessToken?: string) {
  if (!INSFORGE_URL || !INSFORGE_ANON_KEY) {
    throw new Error('[insforge-server] Missing INSFORGE_URL or INSFORGE_ANON_KEY environment variables');
  }
  return createClient({
    baseUrl: INSFORGE_URL,
    anonKey: INSFORGE_ANON_KEY,
    isServerMode: true,
    edgeFunctionToken: accessToken ?? undefined,
  });
}
