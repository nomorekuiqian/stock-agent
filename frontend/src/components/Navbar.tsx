'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, LockKeyhole } from 'lucide-react';
import { NavAuth } from '@/components/NavAuth';
import { ThemeToggle } from '@/components/ThemeToggle';
import { MobileMenu } from '@/components/MobileMenu';
import { Logo } from '@/components/Logo';
import { useFeatureFlags } from '@/hooks/use-feature-flags';
import { useEntitlements } from '@/contexts/EntitlementsContext';
import { useIsAdmin } from '@/hooks/use-is-admin';
import {
  getMainNavSections,
  isNavHrefActive,
  type NavChild,
} from '@/components/navigation';

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  const { has: hasFlag } = useFeatureFlags();
  const { has: hasEntitlement } = useEntitlements();
  const isAdmin = useIsAdmin();
  const isHome = pathname === '/';
  const navSections = getMainNavSections({
    forYouV2: hasFlag('for_you_v2'),
    watchlistExtended: hasEntitlement('watchlist_extended'),
    isAdmin,
  });

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navBase = 'fixed top-0 left-0 right-0 z-50 transition-all duration-500';
  const navScrolled = 'bg-background border-b border-border/40';
  const navTransparentHome = 'bg-transparent border-b border-transparent';

  return (
    <nav
      className={`${navBase} ${
        scrolled
          ? navScrolled
          : isHome
            ? navTransparentHome
            : navScrolled
      }`}
    >
      <div className="max-w-6xl mx-auto px-4 md:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand */}
          <Link href="/" className="flex items-center gap-3 group">
            <Logo className="w-8 h-8 transition-[transform,filter] duration-300 group-hover:scale-105 group-hover:drop-shadow-[0_0_10px_rgba(16,185,129,0.3)]" />
            <div className="flex flex-col">
              <span className="font-semibold text-base tracking-tight text-foreground leading-tight">
                TheMarketBrew
              </span>
              <span className="text-micro text-muted-foreground/70 tracking-widest uppercase hidden sm:block transition-colors duration-300 group-hover:text-muted-foreground/90">
                Market Intelligence
              </span>
            </div>
          </Link>

          {/* Navigation Links */}
          <div className="hidden lg:flex items-center gap-1">
            {navSections.map((section) =>
              section.children ? (
                <NavDropdown
                  key={section.href}
                  label={section.label}
                  href={section.href}
                  items={section.children}
                  tourTarget={section.tourTarget}
                />
              ) : section.highlight ? (
                <NavLinkHighlight
                  key={section.href}
                  href={section.href}
                  tourTarget={section.tourTarget}
                >
                  {section.label}
                </NavLinkHighlight>
              ) : (
                <NavLink
                  key={section.href}
                  href={section.href}
                  tourTarget={section.tourTarget}
                >
                  {section.label}
                </NavLink>
              ),
            )}
          </div>

          {/* Right Side Actions */}
          <div className="flex items-center gap-2">
            <a
              href="https://x.com/golden_pan1"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="在 X 上关注 Golden"
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-border/50 bg-background/35 text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-foreground"
            >
              <XLogo className="h-3.5 w-3.5" />
            </a>
            <ThemeToggle />
            <div className="hidden lg:flex items-center">
              <NavAuth />
            </div>
            <MobileMenu />
          </div>
        </div>
      </div>
    </nav>
  );
}

function XLogo({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
      focusable="false"
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function NavLink({
  href,
  children,
  tourTarget,
}: {
  href: string;
  children: React.ReactNode;
  tourTarget?: string;
}) {
  const pathname = usePathname();
  const isActive = isNavHrefActive(pathname, href);

  return (
    <Link
      href={href}
      data-guided-tour-target={tourTarget}
      className={`group flex h-9 items-center rounded-lg px-3.5 text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
        isActive
          ? 'bg-muted/45 text-foreground'
          : 'text-muted-foreground hover:bg-muted/35 hover:text-foreground'
      }`}
    >
      {children}
    </Link>
  );
}

function NavLinkHighlight({
  href,
  children,
  tourTarget,
}: {
  href: string;
  children: React.ReactNode;
  tourTarget?: string;
}) {
  const pathname = usePathname();
  const isActive = isNavHrefActive(pathname, href);

  return (
    <Link
      href={href}
      data-guided-tour-target={tourTarget}
      className={`group flex h-9 items-center rounded-lg px-3.5 text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
        isActive
          ? 'bg-primary/10 text-primary'
          : 'text-primary hover:bg-primary/10'
      }`}
    >
      {children}
    </Link>
  );
}

function NavDropdown({
  label,
  href,
  items,
  tourTarget,
}: {
  label: string;
  href?: string;
  items: NavChild[];
  tourTarget?: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuId = `nav-dropdown-${label}`;
  const isActive =
    (href ? isNavHrefActive(pathname, href) : false) ||
    items.some(item => isNavHrefActive(pathname, item.href));

  const handleMouseEnter = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setOpen(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    timeoutRef.current = setTimeout(() => {
      setOpen(false);
    }, 150);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }, []);

  const handleBlur = useCallback((e: React.FocusEvent) => {
    if (!ref.current?.contains(e.relatedTarget as Node)) {
      setOpen(false);
    }
  }, []);

  return (
    <div
      ref={ref}
      className="relative flex items-center"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onBlur={handleBlur}
    >
      {href ? (
        <Link
          href={href}
          data-guided-tour-target={tourTarget}
          aria-expanded={open}
          aria-haspopup="true"
          aria-controls={menuId}
          onKeyDown={handleKeyDown}
          className={`group flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
            isActive
              ? 'bg-muted/45 text-foreground'
              : 'text-muted-foreground hover:bg-muted/35 hover:text-foreground'
          }`}
        >
          <span>{label}</span>
          <ChevronDown
            aria-hidden="true"
            className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            strokeWidth={1.8}
          />
        </Link>
      ) : (
        <button
          type="button"
          data-guided-tour-target={tourTarget}
          aria-expanded={open}
          aria-haspopup="true"
          aria-controls={menuId}
          onKeyDown={handleKeyDown}
          className={`group flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
            isActive
              ? 'bg-muted/45 text-foreground'
              : 'text-muted-foreground hover:bg-muted/35 hover:text-foreground'
          }`}
        >
          <span>{label}</span>
          <ChevronDown
            aria-hidden="true"
            className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            strokeWidth={1.8}
          />
        </button>
      )}
      <div
        id={menuId}
        role="menu"
        className={`absolute left-1/2 top-full mt-2 min-w-[180px] -translate-x-1/2 rounded-xl border border-border/50 bg-card/95 p-1.5 shadow-xl shadow-black/15 backdrop-blur-xl transition-all duration-200 ${
          open ? 'opacity-100 translate-y-0 visible' : 'opacity-0 -translate-y-1 invisible'
        }`}
      >
        {items.map((item) => {
          const itemActive = isNavHrefActive(pathname, item.href, item.exact);
          return (
            <Link
              key={item.href}
              href={item.locked ? '/pricing' : item.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
              className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                itemActive
                  ? 'bg-muted/55 text-foreground'
                  : 'text-muted-foreground hover:bg-muted/35 hover:text-foreground'
              }`}
            >
              {item.label}
              {item.locked && (
                <LockKeyhole className="h-3.5 w-3.5 text-amber-500" strokeWidth={1.8} />
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
