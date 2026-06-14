import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HomeGuidedTour from '../HomeGuidedTour';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  searchParams: new URLSearchParams('tour=1'),
  useAuth: vi.fn(),
  onboardingStatus: vi.fn(),
  completeOnboarding: vi.fn(),
  trackProductEvent: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => mocks.searchParams,
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mocks.useAuth(),
}));

vi.mock('@/lib/api', () => ({
  api: {
    user: {
      onboardingStatus: () => mocks.onboardingStatus(),
      completeOnboarding: () => mocks.completeOnboarding(),
    },
  },
}));

vi.mock('@/lib/product-analytics', () => ({
  trackProductEvent: (...args: unknown[]) => mocks.trackProductEvent(...args),
}));

function renderTour(children: ReactNode = <TourTargets />) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      {children}
      <HomeGuidedTour />
    </QueryClientProvider>,
  );
}

function TourTargets() {
  return (
    <nav>
      <button data-guided-tour-target="nav-research-agent">AI 研究助手</button>
      <button data-guided-tour-target="nav-daily-reports">每日简报</button>
      <button data-guided-tour-target="nav-research-system">投研</button>
      <button data-guided-tour-target="nav-my">我的</button>
    </nav>
  );
}

async function flushTourTimers() {
  await act(async () => {
    await Promise.resolve();
    vi.advanceTimersByTime(1);
  });
  await act(async () => {
    await Promise.resolve();
    vi.advanceTimersByTime(1000);
  });
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('HomeGuidedTour', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    localStorage.clear();
    window.history.pushState({}, '', '/?tour=1');
    mocks.searchParams = new URLSearchParams('tour=1');
    mocks.onboardingStatus.mockResolvedValue({ completed: false });
    mocks.completeOnboarding.mockResolvedValue({ completed: true });
    mocks.useAuth.mockReturnValue({
      user: { id: 'user-1', email: 'user@example.com' },
      isAuthenticated: true,
      isLoading: false,
    });

    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      return window.setTimeout(() => callback(0), 0);
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      window.clearTimeout(id);
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
      x: 100,
      y: 100,
      top: 100,
      left: 100,
      bottom: 140,
      right: 220,
      width: 120,
      height: 40,
      toJSON: () => ({}),
    }));
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('does not start the signup tour when the user already completed onboarding locally', async () => {
    localStorage.setItem('onboarding_completed:user-1', 'true');

    renderTour();
    await flushEffects();

    expect(mocks.replace).toHaveBeenCalledWith('/', { scroll: false });
    expect(mocks.onboardingStatus).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not start the signup tour when the backend says onboarding is complete', async () => {
    mocks.onboardingStatus.mockResolvedValue({ completed: true });

    renderTour();
    await flushEffects();

    expect(mocks.replace).toHaveBeenCalledWith('/', { scroll: false });
    expect(localStorage.getItem('onboarding_completed:user-1')).toBe('true');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('allows tour=home to force preview the tour after completion', async () => {
    window.history.pushState({}, '', '/?tour=home');
    mocks.searchParams = new URLSearchParams('tour=home');
    localStorage.setItem('onboarding_completed:user-1', 'true');

    renderTour();
    await flushEffects();
    await flushTourTimers();

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('AI 研究助手 · 1/4')).toBeInTheDocument();
    expect(mocks.onboardingStatus).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
