import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';

const mockInit = vi.fn();
const mockCapture = vi.fn();
const mockIdentify = vi.fn();
const mockReset = vi.fn();

let pathname = '/today';
let searchParams = new URLSearchParams();
let authState: {
  user: { id: string; email: string; name?: string } | null;
  isLoading: boolean;
} = {
  user: null,
  isLoading: false,
};

vi.mock('posthog-js', () => ({
  default: {
    init: (...args: unknown[]) => mockInit(...args),
    capture: (...args: unknown[]) => mockCapture(...args),
    identify: (...args: unknown[]) => mockIdentify(...args),
    reset: (...args: unknown[]) => mockReset(...args),
  },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useSearchParams: () => searchParams,
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => authState,
}));

describe('PostHogProvider', () => {
  beforeEach(() => {
    cleanup();
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    pathname = '/today';
    searchParams = new URLSearchParams();
    authState = { user: null, isLoading: false };
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new URL('https://themarketbrew.com/today'),
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  async function renderProvider() {
    const { PostHogProvider } = await import('../PostHogProvider');
    return render(<PostHogProvider />);
  }

  it('does nothing when NEXT_PUBLIC_POSTHOG_KEY is missing', async () => {
    await renderProvider();

    await waitFor(() => {
      expect(mockInit).not.toHaveBeenCalled();
    });
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it('initializes PostHog and captures pageviews', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'phc_test');
    searchParams = new URLSearchParams('utm_source=test');

    await renderProvider();

    await waitFor(() => {
      expect(mockInit).toHaveBeenCalledWith(
        'phc_test',
        expect.objectContaining({
          api_host: 'https://us.i.posthog.com',
          capture_pageview: false,
          autocapture: true,
          person_profiles: 'identified_only',
        }),
      );
      expect(mockCapture).toHaveBeenCalledWith(
        '$pageview',
        expect.objectContaining({
          $current_url: 'https://themarketbrew.com/today?utm_source=test',
          path: '/today',
          $host: 'themarketbrew.com',
          $pathname: '/today',
          is_authenticated: false,
          user_id: undefined,
        }),
      );
    });
  });

  it('waits for auth hydration before capturing pageviews', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'phc_test');
    authState = { isLoading: true, user: null };

    await renderProvider();

    await waitFor(() => {
      expect(mockInit).toHaveBeenCalled();
    });
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it('identifies authenticated users before capturing pageviews', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'phc_test');
    authState = {
      isLoading: false,
      user: { id: 'user-1', email: 'user@example.com', name: 'Tester' },
    };

    await renderProvider();

    await waitFor(() => {
      expect(mockIdentify).toHaveBeenCalledWith('user-1', {
        email: 'user@example.com',
        name: 'Tester',
      });
      expect(mockCapture).toHaveBeenCalledWith(
        '$pageview',
        expect.objectContaining({
          is_authenticated: true,
          user_id: 'user-1',
        }),
      );
      expect(mockIdentify.mock.invocationCallOrder[0]).toBeLessThan(
        mockCapture.mock.invocationCallOrder[0],
      );
    });
  });
});
