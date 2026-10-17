'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Navbar } from '@/components/Navbar';
import { SiteFooter } from '@/components/SiteFooter';

/**
 * Inner component that reads searchParams (must be inside Suspense).
 */
function PageShellInner({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams();
  const isWechatWebView = searchParams.get('from') === 'wechat';
  if (isWechatWebView) {
    return <>{children}</>;
  }

  return (
    <>
      <Navbar />
      {/* Spacer for fixed navbar */}
      <div className="h-16" />

      {children}

      <SiteFooter />
    </>
  );
}

/**
 * PageShell wraps all pages with Navbar + Footer.
 * When ?from=wechat is present (WebView in mini program),
 * skip the shell entirely for a clean fullscreen experience.
 * Focused WebView flows skip global chrome.
 * Wrapped in Suspense to support static generation.
 */
export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<>{children}</>}>
      <PageShellInner>{children}</PageShellInner>
    </Suspense>
  );
}
