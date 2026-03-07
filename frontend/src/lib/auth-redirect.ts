export const DEFAULT_AUTH_REDIRECT = '/today';

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
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function getStoredAuthRedirect(fallback: string = DEFAULT_AUTH_REDIRECT): string {
  if (typeof window === 'undefined') return fallback;
  return sanitizeRedirectPath(sessionStorage.getItem('auth_redirect'), fallback);
}
