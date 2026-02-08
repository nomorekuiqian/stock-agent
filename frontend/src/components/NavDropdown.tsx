'use client';

import { useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavItem {
  href: string;
  label: string;
  description?: string;
}

interface NavDropdownProps {
  label: string;
  items: NavItem[];
}

export function NavDropdown({ label, items }: NavDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathname = usePathname();

  const isActive = items.some(
    (item) => pathname === item.href || pathname.startsWith(item.href + '/')
  );

  const handleMouseEnter = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsOpen(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    timeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 150);
  }, []);

  return (
    <div
      className="relative flex items-stretch"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        className={`flex items-center gap-1.5 px-4 cursor-pointer transition-colors duration-200 ${
          isOpen || isActive
            ? 'text-foreground'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        <span className="relative text-sm font-medium tracking-wide">
          {label}
          {isActive && !isOpen && (
            <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-4 h-[2px] rounded-full bg-primary" />
          )}
        </span>
        <svg
          className={`w-3 h-3 opacity-40 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      <div
        className={`absolute top-full left-1/2 -translate-x-1/2 pt-3 transition-all duration-200 ${
          isOpen
            ? 'opacity-100 visible translate-y-0'
            : 'opacity-0 invisible -translate-y-1'
        }`}
      >
        <div className="min-w-[200px] py-2 bg-card/95 backdrop-blur-xl border border-border/50 rounded-xl shadow-xl shadow-black/10">
          {/* Decorative top accent */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 w-8 h-[1px] bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

          <div className="pt-1.5">
            {items.map((item) => {
              const itemActive = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`group flex items-center gap-3 mx-2 px-3 py-2.5 rounded-lg transition-all duration-150 ${
                    itemActive
                      ? 'text-foreground bg-muted/50'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  }`}
                >
                  <div className={`w-1 h-1 rounded-full transition-colors ${
                    itemActive ? 'bg-primary' : 'bg-primary/0 group-hover:bg-primary'
                  }`} />
                  <span className="text-sm font-medium tracking-wide">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
