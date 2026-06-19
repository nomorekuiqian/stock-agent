import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor, cleanup } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OnboardingGate } from '../OnboardingGate';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  onboardingStatus: vi.fn(),
  replace: vi.fn(),
  pathname: '/today',
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mocks.useAuth(),
}));

vi.mock('@/lib/api', () => ({
  api: {
    user: {
      onboardingStatus: () => mocks.onboardingStatus(),
    },
  },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ replace: mocks.replace }),
}));

function renderGate(children: ReactNode = <div>content</div>) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <OnboardingGate>{children}</OnboardingGate>
    </QueryClientProvider>,
  );
}

describe('OnboardingGate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mocks.pathname = '/today';
    mocks.useAuth.mockReturnValue({
      user: { id: 'user-1', email: 'user@example.com' },
      isAuthenticated: true,
      isLoading: false,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('skips the backend check when the current user completed onboarding locally', async () => {
    localStorage.setItem('onboarding_completed:user-1', 'true');

    renderGate();

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mocks.onboardingStatus).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('persists local completion after the backend confirms onboarding is complete', async () => {
    mocks.onboardingStatus.mockResolvedValue({ completed: true });

    renderGate();

    await waitFor(() => expect(mocks.onboardingStatus).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(localStorage.getItem('onboarding_completed:user-1')).toBe('true');
    });
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('redirects incomplete onboarding users to the homepage guided tour', async () => {
    mocks.onboardingStatus.mockResolvedValue({ completed: false });

    renderGate();

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/?tour=1'));
  });

  it('does not redirect focused Panda partner routes into the homepage guided tour', async () => {
    mocks.pathname = '/panda';
    mocks.onboardingStatus.mockResolvedValue({ completed: false });

    renderGate();

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mocks.onboardingStatus).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
