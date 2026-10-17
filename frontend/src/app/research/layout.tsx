import type { Metadata } from 'next';
export const metadata: Metadata = { robots: { index: false, follow: true }, alternates: { canonical: '/research' } };
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
