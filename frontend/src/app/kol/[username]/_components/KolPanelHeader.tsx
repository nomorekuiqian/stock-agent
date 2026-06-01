'use client';

interface Props {
  title: string;
  meta?: string;
  className?: string;
}

export default function KolPanelHeader({ title, meta, className = '' }: Props) {
  return (
    <div className={`mb-2 flex min-w-0 items-baseline justify-between gap-4 ${className}`}>
      <h2 className="min-w-0 font-editorial text-2xl leading-tight text-foreground md:text-3xl">
        {title}
      </h2>
      {meta ? (
        <div className="hidden shrink-0 text-xs font-medium text-muted-foreground md:block">
          {meta}
        </div>
      ) : null}
    </div>
  );
}
