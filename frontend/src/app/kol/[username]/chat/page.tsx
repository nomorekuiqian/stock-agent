'use client';

import { use, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Database, MessageCircle, SearchCheck, Waypoints } from 'lucide-react';

import { useKolCockpitProfile } from '@/hooks/queries/use-kol-data';
import ChatComposer from '../_components/ChatComposer';
import KolPanelHeader from '../_components/KolPanelHeader';
import {
  buildKolAgentHref,
  getDefaultKolAgentQuestion,
  getKolStarterPrompts,
} from '../_components/kolAgentLinks';

export default function ChatLaunchpad({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = use(params);
  const { data: profile } = useKolCockpitProfile(username);
  const displayName = profile?.persona.display_name ?? username;
  const titleName = username.toLowerCase() === 'qinbafrank' ? 'qinbafrank' : displayName;
  // /research 读取 agent=kol + persona=... 激活 KOL 视角，读取 q= 后直接发送 starter。
  const defaultChatHref = buildKolAgentHref(
    username,
    getDefaultKolAgentQuestion(username, titleName),
  );
  const starterQuestions = getKolStarterPrompts(username);

  return (
    <div className="py-5 md:py-7">
      <KolPanelHeader
        title={`用 ${titleName} 框架追问`}
        meta="博主研究室 · 方法论 / 数据 / 原文"
      />

      <section className="mt-5 rounded-lg border border-primary/30 bg-primary/[0.045] p-4 md:p-5">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-md border border-primary/30 bg-primary/10 text-primary">
                <MessageCircle className="h-4 w-4" strokeWidth={1.7} />
              </span>
              <div>
                <p className="font-data text-[10px] uppercase tracking-[0.18em] text-primary">
                  博主研究室
                </p>
                <h3 className="text-lg font-semibold tracking-tight text-foreground">
                  把问题直接放进 qinbafrank 的研究框架里
                </h3>
              </div>
            </div>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              这个入口会把公开方法论、历史推文和当前数据放在同一个上下文里回答。命中原推时，会把对应证据带出来。
            </p>
            <div className="mt-5">
              <ChatComposer
                username={username}
                displayName={titleName}
                suggestions={starterQuestions.slice(0, 3)}
              />
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
            <FeaturePoint icon={<Waypoints className="h-4 w-4" />} title="方法论" body="按他的判断路径拆问题" />
            <FeaturePoint icon={<Database className="h-4 w-4" />} title="数据" body="接入宏观、板块和个股数据" />
            <FeaturePoint icon={<SearchCheck className="h-4 w-4" />} title="原文" body="优先返回可验证证据" />
          </div>
        </div>
      </section>

      <div className="mx-auto mt-8 max-w-2xl">
        <div>
          <p className="font-data text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            高价值追问
          </p>
          <ul className="mt-3 space-y-2">
            {starterQuestions.map((q) => (
              <li key={q}>
                <Link
                  href={buildKolAgentHref(username, q)}
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

        <div className="mt-9 flex items-center gap-3">
          <Link
            href={defaultChatHref}
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

function FeaturePoint({
  icon,
  title,
  body,
}: {
  icon: ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-md border border-primary/20 bg-background/45 p-3">
      <div className="flex items-center gap-2 text-primary">
        {icon}
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
        {body}
      </p>
    </div>
  );
}
