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
      <h2 className="font-editorial text-2xl text-foreground md:text-3xl">
        板块机会
      </h2>
      <div className="hidden font-data text-xs uppercase tracking-[0.18em] text-muted-foreground/70 md:block">
        板块 · 产业链 · 代表观点
      </div>
    </div>
  );
}
