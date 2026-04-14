'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Navbar } from '@/components/Navbar';
import { Logo } from '@/components/Logo';

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

      <footer className="border-t border-border/50 mt-16">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            {/* Brand */}
            <div className="flex items-center gap-2.5 text-muted-foreground">
              <Logo className="w-5 h-5 opacity-60" />
              <span className="text-xs font-medium">TheMarketBrew</span>
            </div>

            {/* Links */}
            <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <Link href="/morning" className="hover:text-foreground transition-colors py-2 px-2 min-h-[44px] flex items-center">
                早报
              </Link>
              <Link href="/today" className="hover:text-foreground transition-colors py-2 px-2 min-h-[44px] flex items-center">
                晚报
              </Link>
              <Link href="/for-you" className="hover:text-foreground transition-colors py-2 px-2 min-h-[44px] flex items-center">
                专属
              </Link>
              {process.env.NODE_ENV === 'development' && (
                <Link href="/sectors" className="hover:text-foreground transition-colors py-2 px-2 min-h-[44px] flex items-center">
                  板块
                </Link>
              )}
              <Link href="/stock" className="hover:text-foreground transition-colors py-2 px-2 min-h-[44px] flex items-center">
                个股
              </Link>
              <Link href="/macro" className="hover:text-foreground transition-colors py-2 px-2 min-h-[44px] flex items-center">
                宏观
              </Link>
              <Link href="/contact" className="hover:text-foreground transition-colors py-2 px-2 min-h-[44px] flex items-center">
                联系
              </Link>
            </div>

            {/* Social & Tagline */}
            <div className="flex items-center gap-4">
              <a
                href="https://xiaohongshu.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground/70 hover:text-primary transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                title="小红书"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm5.5 14.5c0 .828-.672 1.5-1.5 1.5s-1.5-.672-1.5-1.5.672-1.5 1.5-1.5 1.5.672 1.5 1.5zm-4-6c0 1.105-.895 2-2 2s-2-.895-2-2 .895-2 2-2 2 .895 2 2zm-5.5 6c0 .828-.672 1.5-1.5 1.5S5 17.328 5 16.5 5.672 15 6.5 15s1.5.672 1.5 1.5z"/>
                </svg>
              </a>
              <span className="text-border">|</span>
              <p className="text-xs text-muted-foreground/70">
                AI 驱动的市场洞察
              </p>
            </div>
          </div>

          {/* Risk Disclaimer */}
          <div className="mt-6 pt-5 border-t border-border/30">
            <p className="text-xs text-muted-foreground/70 leading-relaxed text-center">
              本平台所有内容（包括 AI 生成的分析与报告）仅供参考，不构成任何投资建议。投资有风险，入市需谨慎，过往表现不代表未来收益。AI 生成内容可能存在不准确之处，请在做出任何投资决策前自行核实相关信息。
            </p>
          </div>
        </div>
      </footer>
    </>
  );
}

/**
 * PageShell wraps all pages with Navbar + Footer.
 * When ?from=wechat is present (WebView in mini program),
 * skip the shell entirely for a clean fullscreen experience.
 * Wrapped in Suspense to support static generation.
 */
export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<>{children}</>}>
      <PageShellInner>{children}</PageShellInner>
    </Suspense>
  );
}
