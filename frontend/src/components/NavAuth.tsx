'use client';

import { useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';

export function NavAuth() {
  const { user, isAuthenticated, isLoading, signOut } = useAuth();
  const { isPro, openBillingPortal } = useSubscription();
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
        <button className="flex items-center gap-2 group relative">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 group-hover:shadow-lg ${
            isPro
              ? 'bg-gradient-to-br from-amber-500/30 to-emerald-500/30 border border-amber-400/50 group-hover:border-amber-400/70 group-hover:shadow-amber-500/10'
              : 'bg-gradient-to-br from-emerald-500/20 to-emerald-600/30 border border-emerald-500/30 group-hover:border-emerald-500/50 group-hover:shadow-emerald-500/10'
          }`}>
            <span className={`text-xs font-semibold ${isPro ? 'text-amber-400' : 'text-emerald-400'}`}>{initials}</span>
          </div>
          {isPro && (
            <span className="absolute -bottom-1 -right-1 px-1 py-px rounded text-[8px] font-bold tracking-wider bg-amber-500 text-black leading-none">
              PRO
            </span>
          )}
        </button>

        {/* Dropdown */}
        <div
          className={`absolute top-full right-0 pt-2 transition-all duration-200 ${
            isOpen
              ? 'opacity-100 visible translate-y-0'
              : 'opacity-0 invisible -translate-y-1'
          }`}
        >
          <div className="min-w-[220px] py-3 backdrop-blur-xl rounded-xl v2-card">
            {/* User Info */}
            <div className="px-4 pb-3 border-b border-border/10">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground truncate">
                  {user.name || 'User'}
                </p>
                {isPro && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/20 leading-none">
                    PRO
                  </span>
                )}
              </div>
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

              <Link
                href="/profile"
                className="flex items-center gap-3 mx-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                个人资料
              </Link>

              {isPro ? (
                <button
                  onClick={() => {
                    setIsOpen(false);
                    openBillingPortal();
                  }}
                  className="flex items-center gap-3 mx-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors w-[calc(100%-16px)]"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                  订阅管理
                </button>
              ) : (
                <Link
                  href="/for-you"
                  className="flex items-center gap-3 mx-2 px-3 py-2 rounded-lg text-sm text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Upgrade to Pro
                </Link>
              )}

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
      className="px-4 py-1.5 text-sm font-medium tracking-[0.04em] text-primary hover:text-primary/80 border border-primary/30 hover:border-primary/50 rounded-lg transition-all duration-200"
    >
      登录
    </Link>
  );
}
