import { createClient } from '@insforge/sdk';

export function createServerClient(accessToken?: string) {
  return createClient({
    baseUrl: process.env.INSFORGE_URL!,
    anonKey: process.env.INSFORGE_ANON_KEY!,
    isServerMode: true,
    edgeFunctionToken: accessToken ?? undefined,
  });
}
