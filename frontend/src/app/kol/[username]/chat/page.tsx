'use client';

import { use } from 'react';
import Link from 'next/link';
import { MessageCircle, ArrowUpRight } from 'lucide-react';

import { useKolCockpitProfile } from '@/hooks/queries/use-kol-data';

const STARTER_QUESTIONS = [
  '他怎么看 NVDA 现在的位置？',
  'HBM 卡脖子的拐点信号是什么？',
  'AI 算力链下一步看哪个分层？',
  '宏观风险等级现在是哪一级？',
  '加密板块只看稳定币吗？还是有其他叙事？',
];

export default function ChatLaunchpad({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = use(params);
  const { data: profile } = useKolCockpitProfile(username);
  const displayName = profile?.persona.display_name ?? username;
  // /research 会读 agent=kol + persona=... 自动激活 KOL 视角, 读 q= 自动发送 starter
  const chatHref = `/research?agent=kol&persona=${encodeURIComponent(username)}`;

  return (
    <div className="py-10 md:py-16">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="flex items-start gap-4 border-b border-border/40 pb-7">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-md border border-primary/30 bg-primary/10">
            <MessageCircle className="h-5 w-5 text-primary" strokeWidth={1.6} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-data text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              MODULE 04
            </p>
            <h2 className="mt-1 font-editorial text-2xl text-foreground md:text-[28px]">
              用 {displayName} 的视角追问
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              对话由 AI 基于他的方法论 + 历史推文回答，不是本人发言。命中原推会展示「原文支持」。
            </p>
          </div>
        </div>

        {/* Starters */}
        <div className="mt-8">
          <p className="font-data text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            可以这样问
          </p>
          <ul className="mt-3 space-y-2">
            {STARTER_QUESTIONS.map((q) => (
              <li key={q}>
                <Link
                  href={`${chatHref}&q=${encodeURIComponent(q)}`}
                  className="group flex items-start gap-3 rounded-md border border-border/60 bg-card/30 px-4 py-3 transition hover:border-primary/40 hover:bg-primary/5"
                >
                  <span className="mt-0.5 font-data text-[11px] tabular-nums text-muted-foreground/70 group-hover:text-primary">
                    /
                  </span>
                  <span className="flex-1 text-sm text-foreground/90 group-hover:text-foreground">
                    {q}
                  </span>
                  <ArrowUpRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground transition group-hover:text-primary group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Main CTA */}
        <div className="mt-9 flex items-center gap-3">
          <Link
            href={chatHref}
            className="inline-flex items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-5 py-2.5 text-sm font-medium text-primary transition hover:border-primary hover:bg-primary/15"
          >
            打开对话
            <ArrowUpRight className="h-4 w-4" />
          </Link>
          <p className="font-data text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            需登录 · 灰度中
          </p>
        </div>
      </div>
    </div>
  );
}
