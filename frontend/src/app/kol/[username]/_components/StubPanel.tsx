'use client';

import Link from 'next/link';
import { ArrowUpRight, type LucideIcon } from 'lucide-react';

interface Props {
  moduleNumber: string;
  title: string;
  icon: LucideIcon;
  whatNext: string[];
  primaryHref?: { label: string; href: string };
}

/**
 * Placeholder for upcoming modules — keeps navigation complete while still
 * communicating concrete scope for the next iteration.
 */
export default function StubPanel({
  moduleNumber,
  title,
  icon: Icon,
  whatNext,
  primaryHref,
}: Props) {
  return (
    <div className="py-10 md:py-14">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-start gap-4 border-b border-border/40 pb-6">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-md border border-primary/30 bg-primary/10">
            <Icon className="h-5 w-5 text-primary" strokeWidth={1.6} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              {moduleNumber} · COMING NEXT
            </p>
            <h2 className="mt-1 font-editorial text-2xl text-foreground md:text-3xl">
              {title}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              下个迭代的设计与上线计划。本轮只把 Module 01「最新观点」端到端打通。
            </p>
          </div>
        </div>

        <div className="mt-7">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            下一轮会做的事
          </p>
          <ul className="mt-3 space-y-3">
            {whatNext.map((item, i) => (
              <li key={i} className="editorial-item text-sm text-foreground/85">
                {item}
              </li>
            ))}
          </ul>
        </div>

        {primaryHref ? (
          <Link
            href={primaryHref.href}
            className="mt-9 inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition hover:border-primary hover:bg-primary/15"
          >
            {primaryHref.label}
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}
