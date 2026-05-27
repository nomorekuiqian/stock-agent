'use client';

import { useRouter } from 'next/navigation';
import { MessageSquare } from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

const PERSONA = 'qinbafrank';

export function buildResearchHref(context?: { q?: string; symbol?: string }): string {
  const params = new URLSearchParams({ agent: 'kol', persona: PERSONA });
  if (context?.q) params.set('q', context.q);
  if (context?.symbol) params.set('symbol', context.symbol);
  return `/research?${params.toString()}`;
}

export default function AskFrankButton({
  context,
  label = '用 Frank 的视角向他提问',
  variant = 'primary',
  className,
}: {
  context?: { q?: string; symbol?: string };
  label?: string;
  variant?: 'primary' | 'ghost';
  className?: string;
}) {
  const router = useRouter();
  const { isAuthenticated } = useAuth();

  function go() {
    const target = buildResearchHref(context);
    if (!isAuthenticated) {
      router.push(`/login?redirect=${encodeURIComponent(target)}`);
      return;
    }
    router.push(target);
  }

  return (
    <button
      type="button"
      onClick={go}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors',
        variant === 'primary'
          ? 'bg-primary px-5 py-3 text-primary-foreground hover:bg-primary/90'
          : 'border border-border/60 bg-background px-3 py-2 text-foreground hover:border-primary/40 hover:text-primary',
        className,
      )}
    >
      <MessageSquare className="h-4 w-4" aria-hidden="true" />
      {label}
    </button>
  );
}
