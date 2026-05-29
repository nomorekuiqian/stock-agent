'use client';

import Link from 'next/link';
import { type LucideIcon } from 'lucide-react';

interface Props {
  title: string;
  icon: LucideIcon;
  /**
   * If provided, the whole card becomes a Link to this URL. Omit when the card
   * body contains its own per-item Links (nested anchors are invalid HTML).
   */
  href?: string;
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
  children,
}: Props) {
  const sharedClass =
    'hover-glow group block rounded-lg border border-border/60 bg-card/30 transition';
  const header = (
    <header className="border-b border-border/40 p-5 pb-4">
      <h3 className="flex items-center gap-2 text-[18px] font-medium tracking-tight text-foreground">
        <Icon className="h-4 w-4 text-primary" strokeWidth={1.6} />
        {title}
      </h3>
    </header>
  );
  const body = <div className="p-5 pt-4">{children}</div>;

  if (href) {
    return (
      <Link
        href={href}
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
