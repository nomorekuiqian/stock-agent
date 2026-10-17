import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata('/macro', '美股宏观仪表盘', '追踪流动性、经济基本面、通胀利率与市场情绪，阅读中文宏观研究。');

import { MacroTabBar } from './_components/MacroTabBar';
import { MacroUpgradeCTA } from './_components/MacroUpgradeCTA';

export default function MacroLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <MacroTabBar />
      {children}
      <MacroUpgradeCTA />
    </>
  );
}
