'use client';

import { use, Suspense } from 'react';

import StockExplorer from '../_components/StockExplorer';

export default function StocksPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = use(params);
  return (
    <div className="pt-4 md:pt-6">
      <SectionHeader />
      <Suspense fallback={null}>
        <StockExplorer username={username} />
      </Suspense>
    </div>
  );
}

function SectionHeader() {
  return (
    <div className="mb-1 flex items-baseline justify-between gap-4">
      <div>
        <p className="font-data text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          MODULE 03
        </p>
        <h2 className="mt-1 font-editorial text-2xl text-foreground md:text-[28px]">
          他在个股上的足迹
        </h2>
      </div>
      <div className="hidden font-data text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70 md:block">
        价格曲线 × 提及时点 × 原文逐字
      </div>
    </div>
  );
}
