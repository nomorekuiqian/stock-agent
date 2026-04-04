'use client';

import PaywallGuard from '@/components/PaywallGuard';

export default function LiquidityLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PaywallGuard requiredPlan="max">
      {children}
    </PaywallGuard>
  );
}
