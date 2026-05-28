'use client';

import { use, Suspense } from 'react';

import SectorExplorerV3 from '../_components/SectorExplorerV3';

export default function SectorsPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = use(params);
  return (
    <div className="pt-4 md:pt-6">
      <SectionHeader />
      <Suspense fallback={null}>
        <SectorExplorerV3 username={username} />
      </Suspense>
    </div>
  );
}

function SectionHeader() {
  return (
    <div className="mb-1 flex items-baseline justify-between gap-4">
      <div>
        <p className="font-data text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          MODULE 02
        </p>
        <h2 className="mt-1 font-editorial text-2xl text-foreground md:text-[28px]">
          他怎么看每个板块
        </h2>
      </div>
      <div className="hidden font-data text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70 md:block">
        他的框架 · 标的 · 代表观点
      </div>
    </div>
  );
}
