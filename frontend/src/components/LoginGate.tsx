'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Lock } from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';

interface LoginGateProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
}

/**
 * Lightweight auth gate for pages that should be browseable only by signed-in
 * users. Differs from PaywallGuard: no plan / entitlement check, just a login
 * wall. Registration is free, so the call to action is "登录 / 免费注册".
 *
 * Renders a centered prompt (not an auto-redirect) so the user has visible
 * context for why they're being asked to sign in and can choose login vs
 * signup. Login / signup links carry `redirect=<current-path>` so users land
 * back on the original page after authenticating.
 */
export default function LoginGate({
  children,
  title = '登录后查看完整内容',
  description = '该页面需要登录账户。注册免费，无需付费。',
}: LoginGateProps) {
  const pathname = usePathname();
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
      </div>
    );
  }

  if (isAuthenticated) {
    return <>{children}</>;
  }

  const redirect = encodeURIComponent(pathname || '/');

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-16 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full border border-primary/30 bg-primary/10">
        <Lock className="h-5 w-5 text-primary" strokeWidth={1.7} />
      </div>
      <h2 className="mt-5 font-editorial text-2xl text-foreground md:text-3xl">
        {title}
      </h2>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link
          href={`/login?redirect=${redirect}`}
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          登录
        </Link>
        <Link
          href={`/login?mode=signup&redirect=${redirect}`}
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-primary/30 bg-primary/10 px-5 py-2.5 text-sm font-medium text-primary transition hover:border-primary/50 hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          免费注册
        </Link>
      </div>
    </div>
  );
}
