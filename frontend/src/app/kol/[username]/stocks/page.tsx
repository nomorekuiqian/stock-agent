'use client';

import { use, Suspense } from 'react';

import KolPanelHeader from '../_components/KolPanelHeader';
import StockExplorer from '../_components/StockExplorer';

export default function StocksPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = use(params);
  return (
    <div className="pt-5 md:pt-7">
      <SectionHeader />
      <Suspense fallback={null}>
        <StockExplorer username={username} />
      </Suspense>
    </div>
  );
}

function SectionHeader() {
  return (
    <KolPanelHeader
      title="个股雷达"
      meta="价格曲线 / 提及时点 / 原文逐字"
    />
  );
}
