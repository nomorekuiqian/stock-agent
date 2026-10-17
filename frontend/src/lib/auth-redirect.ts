import { isFeaturePaused, pausedPageRedirect } from '@/lib/feature-pause';
export const DEFAULT_AUTH_REDIRECT = '/today';
export const SIGNUP_TOUR_REDIRECT = isFeaturePaused('onboarding') ? DEFAULT_AUTH_REDIRECT : '/?tour=1';

export function sanitizeRedirectPath(
  input: string | null | undefined,
  fallback: string = DEFAULT_AUTH_REDIRECT
): string {
  if (!input) return fallback;

  const candidate = input.trim();
  if (!candidate.startsWith('/') || candidate.startsWith('//')) {
    return fallback;
  }

  try {
    const parsed = new URL(candidate, 'https://example.com');
    return pausedPageRedirect(parsed.pathname, parsed.searchParams) ?? `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function getStoredAuthRedirect(fallback: string = DEFAULT_AUTH_REDIRECT): string {
  if (typeof window === 'undefined') return fallback;
  return sanitizeRedirectPath(sessionStorage.getItem('auth_redirect'), fallback);
}
