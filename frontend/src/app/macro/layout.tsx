'use client';

import PaywallGuard from '@/components/PaywallGuard';

export default function MacroLayout({ children }: { children: React.ReactNode }) {
  return (
    <PaywallGuard>
      {children}
    </PaywallGuard>
  );
}
