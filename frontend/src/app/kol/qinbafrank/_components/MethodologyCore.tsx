'use client';

import { Brain, ShieldCheck, Ban, CheckCircle2 } from 'lucide-react';

import type { KolCockpitCore } from '@/lib/api';
import AskFrankButton from './AskFrankButton';

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-px w-12 bg-gradient-to-r from-primary to-transparent" />
      <span className="text-xs font-medium tracking-[0.2em] uppercase text-primary">{children}</span>
    </div>
  );
}

export default function MethodologyCore({
  displayName,
  core,
}: {
  displayName: string;
  core: KolCockpitCore;
}) {
  return (
    <section className="border-b border-border/40 bg-background">
      <div className="mx-auto max-w-6xl px-4 py-10 md:px-6 lg:py-14">
        <SectionLabel>KOL PERSONA · 方法论内核</SectionLabel>

        <div className="mt-6 grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                已蒸馏方法论
              </span>
              <span className="inline-flex items-center rounded-md border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-xs font-medium text-amber-600 dark:text-amber-300">
                非本人发言
              </span>
            </div>
            <h1 className="font-editorial text-4xl leading-tight tracking-tight text-foreground md:text-5xl">
              @{displayName} 投研驾驶舱
            </h1>
            <p className="max-w-2xl text-base leading-relaxed text-muted-foreground">{core.portrait}</p>

            <div className="rounded-lg border border-primary/25 bg-primary/5 p-4">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div>
                  <p className="text-xs font-medium tracking-[0.16em] text-primary uppercase">核心指纹</p>
                  <p className="mt-1 text-sm leading-relaxed text-foreground">{core.fingerprint}</p>
                </div>
              </div>
            </div>

            <AskFrankButton />
          </div>

          <div className="space-y-4">
            <div className="rounded-lg border border-border/60 bg-card p-5">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-primary" aria-hidden="true" />
                <h2 className="text-sm font-medium tracking-[0.16em] text-muted-foreground uppercase">
                  5 条核心原则
                </h2>
              </div>
              <ul className="mt-4 space-y-3">
                {core.principles.map((p, i) => (
                  <li key={p.title} className="border-t border-border/50 pt-3 first:border-t-0 first:pt-0">
                    <p className="text-sm font-medium text-foreground">
                      <span className="font-data text-primary">{i + 1}.</span> {p.title}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{p.gist}</p>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-lg border border-border/60 bg-card p-5">
              <div className="flex items-center gap-2">
                <Ban className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <h2 className="text-sm font-medium tracking-[0.16em] text-muted-foreground uppercase">明确不做</h2>
              </div>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {core.not_doing.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 rotate-45 text-muted-foreground/60" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
