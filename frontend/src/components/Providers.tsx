'use client';

import { ReactNode } from 'react';
import { ThemeProvider } from 'next-themes';
import { InsforgeBrowserProvider } from '@insforge/nextjs';
import { AuthProvider } from '@/contexts/AuthContext';
import { insforge } from '@/lib/insforge';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <InsforgeBrowserProvider client={insforge} afterSignInUrl="/market">
        <AuthProvider>{children}</AuthProvider>
      </InsforgeBrowserProvider>
    </ThemeProvider>
  );
}
