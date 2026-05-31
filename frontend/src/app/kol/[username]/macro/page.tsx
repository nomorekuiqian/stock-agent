'use client';

import { use } from 'react';

import KolPanelHeader from '../_components/KolPanelHeader';
import MacroPerspectivePanel from '../_components/MacroPerspectivePanel';

export default function MacroPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = use(params);

  return (
    <div className="pt-4 md:pt-6">
      <KolPanelHeader title="宏观框架" meta="数据 / 判断 / 历史原文" />
      <MacroPerspectivePanel username={username} />
    </div>
  );
}
