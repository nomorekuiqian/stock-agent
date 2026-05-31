'use client';

interface Props {
  title: string;
  meta?: string;
  className?: string;
}

export default function KolPanelHeader({ title, meta, className = '' }: Props) {
  return (
    <div className={`mb-1 flex items-baseline justify-between gap-4 ${className}`}>
      <h2 className="font-editorial text-2xl text-foreground md:text-[28px]">
        {title}
      </h2>
      {meta ? (
        <div className="hidden font-data text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70 md:block">
          {meta}
        </div>
      ) : null}
    </div>
  );
}
