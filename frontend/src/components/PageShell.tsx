'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Navbar } from '@/components/Navbar';
import { SiteFooter } from '@/components/SiteFooter';

function ShellChrome({ footer = false }: { footer?: boolean }) {
  const searchParams = useSearchParams();
  if (searchParams.get('from') === 'wechat') return null;
  return footer ? <SiteFooter /> : <><Navbar /><div className="h-16" /></>;
}

/** Render the page once, outside query-dependent chrome's Suspense boundaries. */
export function PageShell({ children }: { children: React.ReactNode }) {
  return <>
    <Suspense fallback={null}><ShellChrome /></Suspense>
    {children}
    <Suspense fallback={null}><ShellChrome footer /></Suspense>
  </>;
}
