'use client';

import Link from 'next/link';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';

const itemBase =
  'flex items-center gap-3 mx-2 px-3 py-2 rounded-lg text-sm transition-colors outline-none focus-visible:outline-none cursor-pointer';
const itemDefault = `${itemBase} text-muted-foreground hover:text-foreground hover:bg-muted/50 data-[highlighted]:bg-muted/50 data-[highlighted]:text-foreground`;

export function NavAuth() {
  const { user, isAuthenticated, isLoading, signOut } = useAuth();
  const { isPro, isLoading: subLoading, openBillingPortal } = useSubscription();

  if (isLoading || (isAuthenticated && subLoading)) {
    return <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />;
  }

  if (isAuthenticated && user) {
    const initials = user.name
      ? user.name.charAt(0).toUpperCase()
      : user.email?.charAt(0).toUpperCase() || 'U';

    return (
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button className="flex items-center gap-2 group relative focus-visible:outline-none">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 group-hover:scale-105 ${
                isPro
                  ? 'bg-gradient-to-br from-amber-500/30 to-primary/30 group-hover:shadow-[0_0_12px_rgba(245,158,11,0.3)]'
                  : 'bg-gradient-to-br from-primary/20 to-primary/30 group-hover:shadow-[0_0_12px_rgba(16,185,129,0.25)]'
              }`}
            >
              <span
                className={`text-xs font-semibold ${isPro ? 'text-amber-400' : 'text-primary'}`}
              >
                {initials}
              </span>
            </div>
            {!subLoading && isPro && (
              <span className="absolute -bottom-1 -right-1 px-1 py-px rounded text-[8px] font-bold tracking-wider bg-amber-500 text-black leading-none">
                PRO
              </span>
            )}
          </button>
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={8}
            className="min-w-[220px] py-3 bg-card/95 backdrop-blur-xl border border-border/50 rounded-xl shadow-xl shadow-black/10 z-50 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
          >
            {/* User Info */}
            <DropdownMenu.Label className="px-4 pb-3 border-b border-border/50">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground truncate">
                  {user.name || 'User'}
                </p>
                {subLoading ? (
                  <span className="w-8 h-3 rounded bg-muted animate-pulse" />
                ) : isPro ? (
                  <span className="px-1.5 py-0.5 rounded text-micro font-bold tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/20 leading-none">
                    PRO
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground truncate mt-0.5">{user.email}</p>
            </DropdownMenu.Label>

            <DropdownMenu.Group className="pt-2">
              <DropdownMenu.Item asChild className={itemDefault}>
                <Link href="/for-you">
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                  </svg>
                  我的专属
                </Link>
              </DropdownMenu.Item>

              <DropdownMenu.Item asChild className={itemDefault}>
                <Link href="/profile">
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                  个人资料
                </Link>
              </DropdownMenu.Item>

              {subLoading ? (
                <DropdownMenu.Item disabled className={`${itemBase} text-muted-foreground/50`}>
                  <div className="w-4 h-4 rounded bg-muted animate-pulse" />
                  <div className="w-16 h-3 rounded bg-muted animate-pulse" />
                </DropdownMenu.Item>
              ) : isPro ? (
                <DropdownMenu.Item onSelect={openBillingPortal} className={itemDefault}>
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                    />
                  </svg>
                  订阅管理
                </DropdownMenu.Item>
              ) : (
                <DropdownMenu.Item
                  asChild
                  className={`${itemBase} text-primary hover:bg-primary/10 data-[highlighted]:bg-primary/10`}
                >
                  <Link href="/for-you">
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    </svg>
                    升级到 Pro
                  </Link>
                </DropdownMenu.Item>
              )}

              <DropdownMenu.Item
                onSelect={signOut}
                className={`${itemBase} text-muted-foreground hover:text-red-400 hover:bg-red-500/10 data-[highlighted]:text-red-400 data-[highlighted]:bg-red-500/10`}
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                  />
                </svg>
                退出登录
              </DropdownMenu.Item>
            </DropdownMenu.Group>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
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
