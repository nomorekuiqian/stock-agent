import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Providers } from '../Providers';

vi.mock('@tanstack/react-query', () => ({
  QueryClientProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@tanstack/react-query-devtools', () => ({
  ReactQueryDevtools: () => null,
}));

vi.mock('next-themes', () => ({
  ThemeProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
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

vi.mock('@/hooks/queries/query-client', () => ({
  makeQueryClient: () => ({}),
}));

describe('Providers', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders children without InsforgeBrowserProvider', () => {
    const { getByText } = render(
      <Providers>
        <div>child content</div>
      </Providers>
    );

    expect(getByText('child content')).toBeTruthy();
  });
});
