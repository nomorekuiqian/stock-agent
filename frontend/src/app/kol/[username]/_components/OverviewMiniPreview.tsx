'use client';

import Link from 'next/link';
import { ArrowUpRight, type LucideIcon } from 'lucide-react';

interface Props {
  eyebrow: string;
  title: string;
  description?: string;
  icon: LucideIcon;
  href: string;
  /** Action link label rendered top-right on the card header. */
  actionLabel?: string;
  children: React.ReactNode;
}

/**
 * Generic mini-preview frame used by all 4 modules on the overview page.
 * Hairline border, restrained header, content slot.
 */
export default function OverviewMiniPreview({
  eyebrow,
  title,
  description,
  icon: Icon,
  href,
  actionLabel = '查看全部',
  children,
}: Props) {
  return (
    <section className="hover-glow group rounded-lg border border-border/60 bg-card/30 transition">
      <header className="flex items-start justify-between border-b border-border/40 p-5 pb-4">
        <div className="min-w-0">
          <p className="font-data text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            {eyebrow}
          </p>
          <h3 className="mt-1.5 flex items-center gap-2 text-[18px] font-medium tracking-tight text-foreground">
            <Icon className="h-4 w-4 text-primary" strokeWidth={1.6} />
            {title}
          </h3>
          {description ? (
            <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        <Link
          href={href}
          className="shrink-0 inline-flex items-center gap-1 font-data text-[11px] uppercase tracking-[0.14em] text-muted-foreground transition hover:text-primary"
        >
          {actionLabel}
          <ArrowUpRight className="h-3 w-3 transition group-hover:translate-x-0.5" />
        </Link>
      </header>
      <div className="p-5 pt-4">{children}</div>
    </section>
  );
}
