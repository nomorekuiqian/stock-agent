'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NavAuth } from '@/components/NavAuth';
import { ThemeToggle } from '@/components/ThemeToggle';
import { MobileMenu } from '@/components/MobileMenu';
import { Logo } from '@/components/Logo';
export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  const isHome = pathname === '/';

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navBase = 'fixed top-0 left-0 right-0 z-50 transition-all duration-500';
  const navScrolled = 'bg-background/95 backdrop-blur-md border-b border-border/40 shadow-sm shadow-black/5';
  const navTransparentHome = 'bg-transparent border-b border-transparent hero-dark';

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
          <div className="hidden md:flex items-stretch h-16 gap-0">
            <NavDropdown
              label="日报"
              items={[
                { href: '/morning', label: '早报' },
                { href: '/today', label: '晚报' },
              ]}
            />
            <NavLinkHighlight href="/research">投研助手</NavLinkHighlight>
            <NavLink href="/for-you">专属</NavLink>
            <NavLink href="/stock">个股</NavLink>
            <NavLink href="/macro">宏观</NavLink>
            <NavLink href="/pricing">高级订阅</NavLink>
            <NavLink href="/contact">联系</NavLink>
          </div>

          {/* Right Side Actions */}
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <div className="hidden md:flex items-center">
              <NavAuth />
            </div>
            <MobileMenu />
          </div>
        </div>
      </div>
    </nav>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname.startsWith(href + '/');

  return (
    <Link
      href={href}
      className={`group flex items-center px-4 transition-colors duration-200 ${
        isActive
          ? 'text-foreground'
          : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      <span className="relative text-sm font-medium tracking-wide transition-[letter-spacing] duration-300 group-hover:tracking-[0.06em]">
        {children}
        {isActive && (
          <span className="absolute -bottom-1.5 left-0 right-0 flex justify-center">
            <span className="block w-4 h-[2px] rounded-full bg-primary animate-indicator-in" />
          </span>
        )}
      </span>
    </Link>
  );
}

function NavLinkHighlight({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname.startsWith(href + '/');

  return (
    <Link
      href={href}
      className={`group flex items-center px-4 transition-colors duration-200 rounded-none ${
        isActive
          ? 'text-primary'
          : 'text-primary/70 hover:text-primary hover:bg-primary/5'
      }`}
    >
      <span className="relative text-sm font-medium tracking-wide transition-[letter-spacing] duration-300 group-hover:tracking-[0.06em]">
        {children}
        {isActive && (
          <span className="absolute -bottom-1.5 left-0 right-0 flex justify-center">
            <span className="block w-4 h-[2px] rounded-full bg-primary animate-indicator-in" />
          </span>
        )}
      </span>
    </Link>
  );
}

interface DropdownItem {
  href: string;
  label: string;
}

function NavDropdown({ label, items }: { label: string; items: DropdownItem[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuId = `nav-dropdown-${label}`;
  const isActive = items.some(item => pathname === item.href || pathname.startsWith(item.href + '/'));

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
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls={menuId}
        onKeyDown={handleKeyDown}
        className={`group h-full flex items-center gap-1 px-4 transition-colors duration-200 ${
          isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        <span className="relative text-sm font-medium tracking-wide transition-[letter-spacing] duration-300 group-hover:tracking-[0.06em]">
          {label}
          {isActive && (
            <span className="absolute -bottom-1.5 left-0 right-0 flex justify-center">
              <span className="block w-4 h-[2px] rounded-full bg-primary animate-indicator-in" />
            </span>
          )}
        </span>
        <svg
          aria-hidden="true"
          className={`w-3 h-3 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div
        id={menuId}
        role="menu"
        className={`absolute top-full left-1/2 -translate-x-1/2 mt-1 py-1.5 min-w-[120px] bg-background/95 backdrop-blur-md border border-border/50 rounded-lg shadow-lg shadow-black/10 transition-all duration-200 ${
          open ? 'opacity-100 translate-y-0 visible' : 'opacity-0 -translate-y-1 invisible'
        }`}
      >
        {items.map((item) => {
          const itemActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
              className={`block px-4 py-2 text-sm transition-colors ${
                itemActive
                  ? 'text-foreground bg-muted/50'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
