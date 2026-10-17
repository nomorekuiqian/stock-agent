import Link from 'next/link';
import type { ReactNode } from 'react';

export function InformationPage({ label, title, intro, children }: { label: string; title: string; intro: string; children: ReactNode }) {
  return <main className="mx-auto max-w-3xl px-5 py-16 md:py-24">
    <p className="mb-4 text-xs font-medium tracking-widest text-primary uppercase">{label}</p>
    <h1 className="font-editorial text-4xl text-foreground md:text-5xl">{title}</h1>
    <p className="mt-6 text-base leading-8 text-muted-foreground">{intro}</p>
    <div className="mt-12 space-y-10 text-sm leading-7 text-muted-foreground [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-foreground [&_p+p]:mt-3 [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 [&_section]:scroll-mt-24">{children}</div>
    <div className="mt-12 flex flex-wrap gap-6 border-t border-border pt-6 text-sm text-primary"><Link href="/contact" className="py-3">联系与支持</Link><Link href="/terms" className="py-3">服务条款</Link><Link href="/privacy" className="py-3">隐私政策</Link></div>
  </main>;
}
