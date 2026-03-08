import { createClient } from '@insforge/sdk';

// Capture OAuth callback code BEFORE createClient() runs.
// The SDK constructor calls detectAuthCallback() which removes insforge_code
// from the URL via history.replaceState. We need the code for Server Proxy exchange.
export const _capturedOAuthCode = typeof window !== 'undefined'
  ? new URLSearchParams(window.location.search).get('insforge_code')
  : null;

// Insforge configuration - MUST be set via environment variables
const INSFORGE_BASE_URL = process.env.NEXT_PUBLIC_INSFORGE_URL;
const INSFORGE_ANON_KEY = process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY;

if (!INSFORGE_BASE_URL || !INSFORGE_ANON_KEY) {
  throw new Error('[Insforge] Missing environment variables: NEXT_PUBLIC_INSFORGE_URL or NEXT_PUBLIC_INSFORGE_ANON_KEY');
}

export const insforge = createClient({
  baseUrl: INSFORGE_BASE_URL,
  anonKey: INSFORGE_ANON_KEY,
});
