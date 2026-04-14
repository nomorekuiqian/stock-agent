'use client';

import PaywallGuard from '@/components/PaywallGuard';
import { MacroTabBar } from './_components/MacroTabBar';

export default function MacroLayout({ children }: { children: React.ReactNode }) {
  return (
    <PaywallGuard requiredFeature="macro_dashboard">
      <MacroTabBar />
      {children}
    </PaywallGuard>
  );
}
