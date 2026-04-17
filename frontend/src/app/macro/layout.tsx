'use client';

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
