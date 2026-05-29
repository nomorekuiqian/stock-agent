'use client';

import { use } from 'react';

import MacroPerspectivePanel from '../_components/MacroPerspectivePanel';

export default function MacroPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = use(params);

  return (
    <div className="pt-4 md:pt-6">
      <MacroPerspectivePanel username={username} />
    </div>
  );
}
