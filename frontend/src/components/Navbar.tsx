'use client';

import { useState, useEffect } from 'react';
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
            <NavLink href="/today">日报</NavLink>
            <NavLink href="/for-you">专属</NavLink>
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
