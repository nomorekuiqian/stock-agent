'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, LockKeyhole, Menu, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useFeatureFlags } from '@/hooks/use-feature-flags';
import { useEntitlements } from '@/contexts/EntitlementsContext';
import { useIsAdmin } from '@/hooks/use-is-admin';
import {
  getMainNavSections,
  isNavHrefActive,
  type NavSection,
} from '@/components/navigation';

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
      (c) => isNavHrefActive(pathname, c.href),
    );
  const isSectionActive = isNavHrefActive(pathname, section.href);

  const [expanded, setExpanded] = useState(isChildActive);

  if (!hasChildren) {
    return (
      <Link
        href={section.href}
        onClick={onClose}
        className={`flex items-center rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
          isSectionActive
            ? section.highlight
              ? 'bg-primary/10 text-primary ring-1 ring-primary/20'
              : 'bg-muted/55 text-foreground'
            : section.highlight
              ? 'text-primary hover:bg-primary/10'
              : 'text-muted-foreground hover:bg-muted/35 hover:text-foreground'
        }`}
      >
        {section.label}
      </Link>
    );
  }

  return (
    <div>
      <div
        className={`flex items-center rounded-xl transition-colors ${
          isSectionActive
            ? 'bg-muted/45 text-foreground'
            : 'text-muted-foreground hover:bg-muted/25 hover:text-foreground'
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
          className="px-3 py-3 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <ChevronRight
            aria-hidden="true"
            className={`h-4 w-4 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
            strokeWidth={1.8}
          />
        </button>
      </div>

      {expanded && (
        <div className="ml-4 mt-1 space-y-0.5 border-l border-border/40 pl-3">
          {section.children!.map((child) => {
            const childActive = isNavHrefActive(pathname, child.href);
            return (
              <Link
                key={child.href}
                href={child.locked ? '/pricing' : child.href}
                onClick={onClose}
                className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  childActive
                    ? 'bg-muted/55 text-foreground'
                    : 'text-muted-foreground hover:bg-muted/35 hover:text-foreground'
                }`}
              >
                <span>{child.label}</span>
                {child.locked && (
                  <LockKeyhole className="h-3.5 w-3.5 text-amber-500" strokeWidth={1.8} />
                )}
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
  const { isPro, isMax, isLoading: subLoading, plan } = useSubscription();
  const { has: hasFlag } = useFeatureFlags();
  const { has: hasEntitlement } = useEntitlements();
  const isAdmin = useIsAdmin();

  const navSections: NavSection[] = getMainNavSections({
    forYouV2: hasFlag('for_you_v2'),
    watchlistExtended: hasEntitlement('watchlist_extended'),
    isAdmin,
  });

  return (
    <div className="lg:hidden">
      {/* Hamburger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-controls="mobile-menu-panel"
        aria-label={isOpen ? '关闭导航菜单' : '打开导航菜单'}
        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted/35 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        {isOpen ? (
          <X aria-hidden="true" className="h-5 w-5" strokeWidth={1.8} />
        ) : (
          <Menu aria-hidden="true" className="h-5 w-5" strokeWidth={1.8} />
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed left-0 right-0 top-16 z-40 h-[calc(100dvh-4rem)] bg-background"
            onClick={() => setIsOpen(false)}
          />

          {/* Menu Panel */}
          <div
            id="mobile-menu-panel"
            className="fixed left-0 right-0 top-16 z-50 h-[calc(100dvh-4rem)] overflow-y-auto border-b border-border/50 bg-background shadow-xl shadow-black/10"
          >
            <div className="mx-auto max-w-6xl space-y-1 px-4 py-4">
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
                      <span className="rounded border border-amber-500/20 bg-amber-500/15 px-1.5 py-0.5 text-micro font-semibold tracking-wider text-amber-400">
                        {plan === 'ultra' ? 'ULTRA' : isMax ? 'MAX' : 'PRO'}
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
