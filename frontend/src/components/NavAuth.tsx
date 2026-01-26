'use client';

import { useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';

export function NavAuth() {
  const { user, isAuthenticated, isLoading, signOut } = useAuth();
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
    timeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 150);
  }, []);

  if (isLoading) {
    return (
      <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />
    );
  }

  if (isAuthenticated && user) {
    const initials = user.name
      ? user.name.charAt(0).toUpperCase()
      : user.email?.charAt(0).toUpperCase() || 'U';

    return (
      <div
        className="relative"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Avatar Button */}
        <button className="flex items-center gap-2 group">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500/20 to-emerald-600/30 border border-emerald-500/30 flex items-center justify-center transition-all duration-200 group-hover:border-emerald-500/50 group-hover:shadow-lg group-hover:shadow-emerald-500/10">
            <span className="text-xs font-semibold text-emerald-400">{initials}</span>
          </div>
        </button>

        {/* Dropdown */}
        <div
          className={`absolute top-full right-0 pt-2 transition-all duration-200 ${
            isOpen
              ? 'opacity-100 visible translate-y-0'
              : 'opacity-0 invisible -translate-y-1'
          }`}
        >
          <div className="min-w-[200px] py-3 bg-card/95 backdrop-blur-xl border border-border/50 rounded-xl shadow-xl shadow-black/10">
            {/* User Info */}
            <div className="px-4 pb-3 border-b border-border/50">
              <p className="text-sm font-medium text-foreground truncate">
                {user.name || 'User'}
              </p>
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {user.email}
              </p>
            </div>

            {/* Menu Items */}
            <div className="pt-2">
              <Link
                href="/for-you"
                className="flex items-center gap-3 mx-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                我的专属
              </Link>
              <button
                onClick={() => {
                  setIsOpen(false);
                  signOut();
                }}
                className="flex items-center gap-3 mx-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors w-[calc(100%-16px)]"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                退出登录
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Link
      href="/login"
      className="px-4 py-2 text-[13px] font-medium text-emerald-400 hover:text-emerald-300 transition-colors"
    >
      登录
    </Link>
  );
}
