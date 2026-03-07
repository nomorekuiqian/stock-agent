'use client';

import { ReactNode, useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { ThemeProvider } from 'next-themes';
import { InsforgeBrowserProvider } from '@insforge/nextjs';
import { AuthSubscriptionSync } from '@/components/AuthSubscriptionSync';
import { AuthProvider } from '@/contexts/AuthContext';
import { SubscriptionProvider } from '@/contexts/SubscriptionContext';
import { insforge } from '@/lib/insforge';
import { seedClientAuthFromServer, type ServerAuthSeed } from '@/lib/auth-storage';
import { DEFAULT_AUTH_REDIRECT } from '@/lib/auth-redirect';
import { makeQueryClient } from '@/hooks/queries/query-client';

export function Providers({ children, initialState }: { children: ReactNode; initialState?: ServerAuthSeed }) {
  const [queryClient] = useState(makeQueryClient);

  // SDK initialState only hydrates user/userId. The client token still needs to
  // exist in localStorage so TokenManager can restore the browser session.
  if (typeof window !== 'undefined' && initialState?.token) {
    seedClientAuthFromServer(initialState);
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
        <InsforgeBrowserProvider client={insforge} afterSignInUrl={DEFAULT_AUTH_REDIRECT} initialState={initialState}>
          <AuthProvider>
            <AuthSubscriptionSync />
            <SubscriptionProvider>{children}</SubscriptionProvider>
          </AuthProvider>
        </InsforgeBrowserProvider>
      </ThemeProvider>
      {process.env.NODE_ENV === 'development' && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
