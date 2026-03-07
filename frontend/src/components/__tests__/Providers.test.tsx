import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Providers } from '../Providers';
import { INSFORGE_AUTH_TOKEN_KEY, INSFORGE_AUTH_USER_KEY } from '@/lib/auth-storage';

const { browserProviderSpy } = vi.hoisted(() => ({
  browserProviderSpy: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  QueryClientProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@tanstack/react-query-devtools', () => ({
  ReactQueryDevtools: () => null,
}));

vi.mock('next-themes', () => ({
  ThemeProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@insforge/nextjs', () => ({
  InsforgeBrowserProvider: (props: { children: ReactNode; initialState?: unknown }) => {
    browserProviderSpy(props);
    return <>{props.children}</>;
  },
}));

vi.mock('@/contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/AuthSubscriptionSync', () => ({
  AuthSubscriptionSync: () => null,
}));

vi.mock('@/contexts/SubscriptionContext', () => ({
  SubscriptionProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/lib/insforge', () => ({
  insforge: {},
}));

vi.mock('@/hooks/queries/query-client', () => ({
  makeQueryClient: () => ({}),
}));

describe('Providers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('injects token and user into localStorage when initialState includes token', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

    const initialState = {
      token: 'test-token',
      userId: 'user-1',
      user: {
        id: 'user-1',
        email: 'user@example.com',
        profile: { name: 'Tester' },
      },
    };

    const { rerender } = render(
      <Providers initialState={initialState}>
        <div>child</div>
      </Providers>
    );

    expect(setItemSpy).toHaveBeenCalledWith(INSFORGE_AUTH_TOKEN_KEY, 'test-token');
    expect(setItemSpy).toHaveBeenCalledWith(
      INSFORGE_AUTH_USER_KEY,
      JSON.stringify({
        id: 'user-1',
        email: 'user@example.com',
        profile: { name: 'Tester' },
      })
    );
    expect(browserProviderSpy).toHaveBeenCalled();

    rerender(
      <Providers initialState={initialState}>
        <div>child</div>
      </Providers>
    );

    // first render writes 2 keys; rerender should not write again
    expect(setItemSpy).toHaveBeenCalledTimes(2);
  });

  it('does not inject token when initialState has no token', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

    render(
      <Providers
        initialState={{
          userId: 'user-1',
          user: { id: 'user-1', email: 'user@example.com', profile: null },
        }}
      >
        <div>child</div>
      </Providers>
    );

    expect(setItemSpy).not.toHaveBeenCalled();
    expect(browserProviderSpy).toHaveBeenCalled();
  });

  it('does not rewrite storage when token and user are already synchronized', () => {
    localStorage.setItem(INSFORGE_AUTH_TOKEN_KEY, 'test-token');
    localStorage.setItem(INSFORGE_AUTH_USER_KEY, JSON.stringify({
      id: 'user-1',
      email: 'user@example.com',
      profile: { name: 'Tester' },
    }));
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

    render(
      <Providers
        initialState={{
          token: 'test-token',
          userId: 'user-1',
          user: {
            id: 'user-1',
            email: 'user@example.com',
            profile: { name: 'Tester' },
          },
        }}
      >
        <div>child</div>
      </Providers>
    );

    expect(setItemSpy).not.toHaveBeenCalled();
  });
});
