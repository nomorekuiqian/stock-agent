const ONBOARDING_COMPLETED_PREFIX = 'onboarding_completed:';

function getOnboardingCompletedKey(userId: string): string {
  return `${ONBOARDING_COMPLETED_PREFIX}${userId}`;
}

export function hasLocalOnboardingCompleted(userId: string | null | undefined): boolean {
  if (!userId || typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(getOnboardingCompletedKey(userId)) === 'true';
  } catch {
    return false;
  }
}

export function markLocalOnboardingCompleted(userId: string | null | undefined): void {
  if (!userId || typeof window === 'undefined') return;
  try {
    localStorage.setItem(getOnboardingCompletedKey(userId), 'true');
  } catch {
    // Ignore storage failures; server status remains the source of truth.
  }
}
