'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NavAuth } from '@/components/NavAuth';
import { ThemeToggle } from '@/components/ThemeToggle';
import { MobileMenu } from '@/components/MobileMenu';
import { NavDropdown } from '@/components/NavDropdown';

function Logo({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="emerald-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#10B981" />
          <stop offset="50%" stopColor="#34D399" />
          <stop offset="100%" stopColor="#6EE7B7" />
        </linearGradient>
      </defs>
      <path
        d="M4 24V12L10 6V24M10 6L16 14L22 6M22 6V24M28 24V12L22 6"
        stroke="url(#emerald-gradient)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

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
  const navScrolled = 'bg-background/80 backdrop-blur-2xl border-b border-border/40 shadow-sm shadow-black/5';
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
            <Logo className="w-8 h-8 transition-transform duration-300 group-hover:scale-105" />
            <div className="flex flex-col">
              <span className="font-semibold text-base tracking-tight text-foreground leading-tight">
                TheMarketBrew
              </span>
              <span className="text-micro text-muted-foreground/60 tracking-widest uppercase hidden sm:block">
                Market Intelligence
              </span>
            </div>
          </Link>

          {/* Navigation Links */}
          <div className="hidden md:flex items-stretch h-16 gap-1">
            <NavDropdown
              label="日报"
              items={[
                { href: '/today', label: '今日日报' },
                { href: '/today/archive', label: '往期归档' },
              ]}
            />
            <NavDropdown
              label="专属"
              items={[
                { href: '/for-you', label: '今日专属' },
                { href: '/for-you/archive', label: '往期归档' },
              ]}
            />
            {process.env.NODE_ENV === 'development' && (
              <NavLink href="/sectors">板块</NavLink>
            )}
            <NavLink href="/stock">个股</NavLink>
            <NavLink href="/macro">宏观</NavLink>
            <NavLink href="/contact">联系</NavLink>
          </div>

          {/* Right Side Actions */}
          <div className="flex items-center gap-2">
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
      className={`flex items-center px-4 transition-colors duration-200 ${
        isActive
          ? 'text-foreground'
          : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      <span className="relative text-sm font-medium tracking-wide">
        {children}
        {isActive && (
          <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-4 h-[2px] rounded-full bg-primary" />
        )}
      </span>
    </Link>
  );
}
