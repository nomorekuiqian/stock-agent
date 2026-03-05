'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';

export function MobileMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const { user, isAuthenticated, isLoading, signOut } = useAuth();
  const { isPro } = useSubscription();

  const navSections = [
    {
      title: '日报',
      links: [
        { href: '/morning', label: '盘前早报' },
        { href: '/today', label: '盘后晚报' },
      ],
    },
    {
      title: '专属',
      links: [
        { href: '/for-you', label: '专属日报' },
      ],
    },
    ...(process.env.NODE_ENV === 'development' ? [{
      title: '板块',
      links: [
        { href: '/sectors', label: '板块追踪' },
      ],
    }] : []),
    {
      title: '个股',
      links: [
        { href: '/stock', label: '个股研究' },
        ...((process.env.NODE_ENV === 'development' || isPro) ? [{ href: '/screener', label: '个股筛选' }] : []),
      ],
    },
    {
      title: '宏观',
      links: [
        { href: '/macro', label: '宏观总览' },
        { href: '/macro/liquidity', label: '流动性环境' },
        { href: '/macro/economy', label: '经济基本面' },
        { href: '/macro/inflation-rates', label: '通胀与利率' },
        { href: '/macro/sentiment', label: '市场情绪' },
      ],
    },
    {
      title: '联系',
      links: [
        { href: '/contact', label: '联系我们' },
      ],
    },
  ];

  return (
    <div className="md:hidden">
      {/* Hamburger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Toggle menu"
      >
        {isOpen ? (
          // X icon
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          // Hamburger icon
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 top-16 bg-background/80 backdrop-blur-sm z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Menu Panel */}
          <div className="absolute top-16 left-0 right-0 bg-background border-b border-border/50 z-50 animate-fade-in-up">
            <div className="max-w-6xl mx-auto px-4 py-4 space-y-4">
              {/* Nav Sections */}
              {navSections.map((section) => (
                <div key={section.title}>
                  <div className="px-4 py-1 text-xs font-medium text-muted-foreground/60 uppercase tracking-wider">
                    {section.title}
                  </div>
                  <div className="space-y-1">
                    {section.links.map((link) => (
                      <Link
                        key={link.href}
                        href={link.href}
                        onClick={() => setIsOpen(false)}
                        className="block px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors"
                      >
                        {link.label}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}

              {/* Divider */}
              <div className="h-px bg-border/50 my-2" />

              {/* Auth Section */}
              {isLoading ? (
                <div className="px-4 py-3">
                  <div className="w-20 h-4 rounded bg-muted animate-pulse" />
                </div>
              ) : isAuthenticated && user ? (
                <>
                  <div className="px-4 py-2 flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{user.name || user.email}</span>
                    {isPro && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/20 leading-none">
                        PRO
                      </span>
                    )}
                  </div>
                  <Link
                    href="/profile"
                    onClick={() => setIsOpen(false)}
                    className="block px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors"
                  >
                    个人资料
                  </Link>
                  {!isPro && (
                    <Link
                      href="/for-you"
                      onClick={() => setIsOpen(false)}
                      className="block px-4 py-2.5 text-sm text-emerald-400 font-medium hover:bg-emerald-500/10 rounded-lg transition-colors"
                    >
                      Upgrade to Pro
                    </Link>
                  )}
                  <button
                    onClick={() => {
                      signOut();
                      setIsOpen(false);
                    }}
                    className="w-full text-left px-4 py-3 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors"
                  >
                    退出登录
                  </button>
                </>
              ) : (
                <Link
                  href="/login"
                  onClick={() => setIsOpen(false)}
                  className="block px-4 py-3 text-sm text-emerald-500 font-medium hover:bg-emerald-500/10 rounded-lg transition-colors"
                >
                  登录
                </Link>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
