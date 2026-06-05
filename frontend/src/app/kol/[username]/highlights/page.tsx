'use client';

import { use, Suspense } from 'react';

import FrankHighlights from '../_components/FrankHighlights';
import KolPanelHeader from '../_components/KolPanelHeader';
import SectorExplorer from '../_components/SectorExplorer';

export default function HighlightsPage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ topic?: string }>;
}) {
  const { username } = use(params);
  const query = use(searchParams);
  const isFrank = username.toLowerCase() === 'qinbafrank';

  if (isFrank) {
    return <FrankHighlights username={username} initialTopicId={query.topic} />;
  }

  return (
    <div className="pt-4 md:pt-6">
      <KolPanelHeader title="板块地图" meta="产业链主线 / 历史观点 / 原文逐字" />
      <Suspense fallback={null}>
        <SectorExplorer username={username} />
      </Suspense>
    </div>
  );
}
