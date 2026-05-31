'use client';

import { use, Suspense } from 'react';

import KolPanelHeader from '../_components/KolPanelHeader';
import SectorExplorer from '../_components/SectorExplorer';

export default function SectorsPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = use(params);
  return (
    <div className="pt-4 md:pt-6">
      <KolPanelHeader title="板块地图" meta="产业链主线 · 历史观点 · 原文逐字" />
      <Suspense fallback={null}>
        <SectorExplorer username={username} />
      </Suspense>
    </div>
  );
}
