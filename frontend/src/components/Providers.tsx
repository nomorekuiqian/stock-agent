'use client';

import { ReactNode, useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { ThemeProvider } from 'next-themes';
import { InsforgeBrowserProvider } from '@insforge/nextjs';
import type { InitialAuthState } from '@insforge/nextjs';
import { AuthProvider } from '@/contexts/AuthContext';
import { SubscriptionProvider } from '@/contexts/SubscriptionContext';
import { insforge } from '@/lib/insforge';
import { makeQueryClient } from '@/hooks/queries/query-client';

export function Providers({ children, initialState }: { children: ReactNode; initialState?: InitialAuthState }) {
  const [queryClient] = useState(makeQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
        <InsforgeBrowserProvider client={insforge} afterSignInUrl="/market" initialState={initialState}>
          <AuthProvider>
            <SubscriptionProvider>{children}</SubscriptionProvider>
          </AuthProvider>
        </InsforgeBrowserProvider>
      </ThemeProvider>
      {process.env.NODE_ENV === 'development' && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
