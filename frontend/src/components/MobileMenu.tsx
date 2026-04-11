'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';

interface NavChild {
  href: string;
  label: string;
}

interface NavSection {
  label: string;
  href: string;
  children?: NavChild[];
}

function MobileNavItem({
  section,
  onClose,
}: {
  section: NavSection;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const hasChildren = !!(section.children && section.children.length > 0);

  const isChildActive =
    hasChildren &&
    section.children!.some(
      (c) => pathname === c.href || pathname.startsWith(c.href + '/'),
    );
  const isSectionActive =
    pathname === section.href || pathname.startsWith(section.href + '/');

  const [expanded, setExpanded] = useState(isChildActive);

  if (!hasChildren) {
    return (
      <Link
        href={section.href}
        onClick={onClose}
        className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
          isSectionActive
            ? 'text-foreground bg-muted/50'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
        }`}
      >
        {section.label}
      </Link>
    );
  }

  return (
    <div>
      <div
        className={`flex items-center rounded-lg ${
          isSectionActive ? 'text-foreground' : 'text-muted-foreground'
        }`}
      >
        <Link
          href={section.href}
          onClick={onClose}
          className="flex-1 px-4 py-3 text-sm font-medium hover:text-foreground transition-colors"
        >
          {section.label}
        </Link>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          aria-label={expanded ? '收起' : '展开'}
          className="px-3 py-3 hover:text-foreground transition-colors"
        >
          <svg
            aria-hidden="true"
            className={`w-4 h-4 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {expanded && (
        <div className="ml-4 pl-3 border-l border-border/40 mt-0.5 space-y-0.5">
          {section.children!.map((child) => {
            const childActive =
              pathname === child.href || pathname.startsWith(child.href + '/');
            return (
              <Link
                key={child.href}
                href={child.href}
                onClick={onClose}
                className={`block px-3 py-2 text-sm rounded-lg transition-colors ${
                  childActive
                    ? 'text-foreground bg-muted/50'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
                }`}
              >
                {child.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function MobileMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const { user, isAuthenticated, isLoading, signOut } = useAuth();
  const { isPro, isLoading: subLoading } = useSubscription();

  const navSections: NavSection[] = [
    {
      label: '日报',
      href: '/today',
      children: [
        { href: '/morning', label: '盘前早报' },
        { href: '/today', label: '盘后晚报' },
      ],
    },
    {
      label: '专属',
      href: '/for-you',
      children: [
        { href: '/for-you/watchlist', label: '我的自选股' },
      ],
    },
    {
      label: '投研助手',
      href: '/research',
    },
    {
      label: '个股',
      href: '/stock',
    },
    {
      label: '宏观',
      href: '/macro',
      children: [
        { href: '/macro/liquidity', label: '流动性环境' },
        { href: '/macro/economy', label: '经济基本面' },
        { href: '/macro/inflation-rates', label: '通胀与利率' },
        { href: '/macro/sentiment', label: '市场情绪' },
      ],
    },
    {
      label: '高级订阅',
      href: '/pricing',
    },
    {
      label: '联系',
      href: '/contact',
    },
  ];

  return (
    <div className="md:hidden">
      {/* Hamburger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-controls="mobile-menu-panel"
        aria-label={isOpen ? '关闭导航菜单' : '打开导航菜单'}
        className="p-2 text-muted-foreground hover:text-foreground transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
      >
        {isOpen ? (
          <svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
          <div
            id="mobile-menu-panel"
            className="absolute top-16 left-0 right-0 bg-background border-b border-border/50 z-50 animate-fade-in-up"
          >
            <div className="max-w-6xl mx-auto px-4 py-3 space-y-0.5">
              {/* Nav Sections */}
              {navSections.map((section) => (
                <MobileNavItem
                  key={section.href}
                  section={section}
                  onClose={() => setIsOpen(false)}
                />
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
                    {subLoading ? (
                      <span className="w-8 h-3 rounded bg-muted animate-pulse" />
                    ) : isPro ? (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/20 leading-none">
                        PRO
                      </span>
                    ) : null}
                  </div>
                  <Link
                    href="/profile"
                    onClick={() => setIsOpen(false)}
                    className="block px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors"
                  >
                    个人资料
                  </Link>
                  {!subLoading && !isPro && (
                    <Link
                      href="/pricing"
                      onClick={() => setIsOpen(false)}
                      className="block px-4 py-2.5 text-sm text-primary font-medium hover:bg-primary/10 rounded-lg transition-colors"
                    >
                      升级到 Pro
                    </Link>
                  )}
                  <button
                    type="button"
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
                  className="block px-4 py-3 text-sm text-primary font-medium hover:bg-primary/10 rounded-lg transition-colors"
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
