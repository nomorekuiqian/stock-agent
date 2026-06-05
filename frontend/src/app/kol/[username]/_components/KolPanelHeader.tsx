'use client';

import { cn } from '@/lib/utils';

interface Props {
  title: string;
  meta?: string;
  className?: string;
}

export default function KolPanelHeader({ title, meta, className = '' }: Props) {
  return (
    <div className={cn('mb-3 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end sm:justify-between md:mb-4', className)}>
      <h2 className="min-w-0 font-editorial text-3xl leading-tight text-foreground md:text-4xl">
        {title}
      </h2>
      {meta ? (
        <div className="hidden max-w-[36ch] shrink-0 text-right text-sm font-medium leading-relaxed tracking-wide text-muted-foreground md:block">
          {meta}
        </div>
      ) : null}
    </div>
  );
}
