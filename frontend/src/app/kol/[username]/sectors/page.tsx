'use client';

import { use, Suspense } from 'react';

import FrankSectorOpinions from '../_components/FrankSectorOpinions';
import KolPanelHeader from '../_components/KolPanelHeader';
import SectorExplorer from '../_components/SectorExplorer';

export default function SectorsPage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ sector?: string; topic?: string }>;
}) {
  const { username } = use(params);
  const query = use(searchParams);
  const u = username.toLowerCase();
  const isFrank = u === 'qinbafrank';
  const isSerenity = u === 'aleabitoreddit';

  if (isFrank) {
    return (
      <div className="pt-5 md:pt-7">
        <KolPanelHeader
          title="板块观点"
          meta="核心判断 / 原观点逻辑 / 倒序时间线"
        />
        <FrankSectorOpinions
          username={username}
          initialSectorId={query.sector}
          initialTopicId={query.topic}
        />
      </div>
    );
  }

  const panelTitle = isSerenity ? '供应链漏斗' : '板块地图';
  const panelMeta = isSerenity
    ? '9 个瓶颈环节 / 瓶颈轮动 / 代表 ticker 与原文'
    : '产业链主线 / 历史观点 / 原文逐字';

  return (
    <div className="pt-4 md:pt-6">
      <KolPanelHeader title={panelTitle} meta={panelMeta} />
      <Suspense fallback={null}>
        <SectorExplorer username={username} />
      </Suspense>
    </div>
  );
}
