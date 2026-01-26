'use client';

import { useState, useRef, useCallback } from 'react';
import Link from 'next/link';

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

  const handleMouseEnter = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsOpen(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    // Small delay before closing to allow mouse to move to dropdown
    timeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 150);
  }, []);

  return (
    <div
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        className={`flex items-center gap-1.5 px-4 py-2 text-[13px] font-medium tracking-wide transition-colors duration-200 ${
          isOpen
            ? 'text-foreground'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        {label}
        <svg
          className={`w-3 h-3 opacity-50 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      <div
        className={`absolute top-full left-1/2 -translate-x-1/2 pt-2 transition-all duration-200 ${
          isOpen
            ? 'opacity-100 visible translate-y-0'
            : 'opacity-0 invisible -translate-y-1'
        }`}
      >
        <div className="min-w-[180px] py-2 bg-card/95 backdrop-blur-xl border border-border/50 rounded-xl shadow-xl shadow-black/10">
          {/* Decorative top line */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

          <div className="pt-1">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group flex items-center gap-3 mx-2 px-3 py-2.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-150"
              >
                <div className="w-1 h-1 rounded-full bg-primary/0 group-hover:bg-primary transition-colors" />
                <span className="text-[13px] font-medium">{item.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
