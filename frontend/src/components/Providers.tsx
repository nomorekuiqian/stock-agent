'use client';

import { ReactNode, useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { ThemeProvider } from 'next-themes';
import { AuthProvider } from '@/contexts/AuthContext';
import { SubscriptionProvider } from '@/contexts/SubscriptionContext';
import { EntitlementsProvider } from '@/contexts/EntitlementsContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import { OnboardingGate } from '@/components/OnboardingGate';
import { PostHogProvider } from '@/components/PostHogProvider';
import { makeQueryClient } from '@/hooks/queries/query-client';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(makeQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
        <AuthProvider>
          <PostHogProvider />
          <SubscriptionProvider>
            <EntitlementsProvider>
              <TooltipProvider>
                <OnboardingGate>{children}</OnboardingGate>
              </TooltipProvider>
            </EntitlementsProvider>
          </SubscriptionProvider>
        </AuthProvider>
      </ThemeProvider>
      {process.env.NODE_ENV === 'development' && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
