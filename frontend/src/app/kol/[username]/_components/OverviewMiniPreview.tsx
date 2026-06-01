'use client';

import Link from 'next/link';
import { ArrowUpRight, type LucideIcon } from 'lucide-react';

interface Props {
  title: string;
  icon: LucideIcon;
  /**
   * If provided, the whole card becomes a Link to this URL. Omit when the card
   * body contains its own per-item Links (nested anchors are invalid HTML).
   */
  href?: string;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}

/**
 * Generic mini-preview frame used by all 4 modules on the overview page.
 * Entire card is one clickable surface unless `href` is omitted (in which
 * case inner items are expected to be individually clickable).
 */
export default function OverviewMiniPreview({
  title,
  icon: Icon,
  href,
  className = '',
  bodyClassName = '',
  children,
}: Props) {
  const sharedClass =
    `hover-glow group flex h-full flex-col overflow-hidden rounded-lg border border-border/60 bg-card/35 transition ${className}`;
  const header = (
    <header className="border-b border-border/40 p-4 pb-3 md:p-5 md:pb-4">
      <h3 className="flex min-w-0 items-center justify-between gap-3 text-lg font-medium text-foreground">
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-primary/20 bg-primary/10 text-primary">
            <Icon className="h-4 w-4" strokeWidth={1.7} />
          </span>
          <span className="truncate">{title}</span>
        </span>
        {href ? (
          <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
        ) : null}
      </h3>
    </header>
  );
  const body = <div className={`flex-1 p-4 pt-3 md:p-5 md:pt-4 ${bodyClassName}`}>{children}</div>;

  if (href) {
    return (
      <Link
        href={href}
        aria-label={`打开${title}`}
        className={`${sharedClass} hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40`}
      >
        {header}
        {body}
      </Link>
    );
  }
  return (
    <section className={sharedClass}>
      {header}
      {body}
    </section>
  );
}
