'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { ChevronRight, Loader2, Quote, Target, BookOpen } from 'lucide-react';

import { api, type KolCockpitSectorFront, type KolCockpitSectorDetail } from '@/lib/api';
import { cn } from '@/lib/utils';
import AskFrankButton from './AskFrankButton';
import TweetCard from './TweetCard';

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-px w-12 bg-gradient-to-r from-primary to-transparent" />
      <span className="text-xs font-medium tracking-[0.2em] uppercase text-primary">{children}</span>
    </div>
  );
}

export default function SectorExplorer({
  username,
  sectors,
}: {
  username: string;
  sectors: KolCockpitSectorFront[];
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<KolCockpitSectorDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [showLens, setShowLens] = useState(false);

  async function openSector(key: string) {
    if (selected === key) {
      setSelected(null);
      setDetail(null);
      return;
    }
    setSelected(key);
    setDetail(null);
    setShowLens(false);
    setLoading(true);
    try {
      const d = await api.kolResearch.cockpitSector(username, key);
      setDetail(d);
    } catch {
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }

  // group preserving first-seen order
  const groups: { group: string; items: KolCockpitSectorFront[] }[] = [];
  for (const s of sectors) {
    let g = groups.find((x) => x.group === s.group);
    if (!g) {
      g = { group: s.group, items: [] };
      groups.push(g);
    }
    g.items.push(s);
  }

  return (
    <section className="mx-auto max-w-6xl space-y-6 px-4 py-10 md:px-6">
      <div>
        <SectionLabel>SECTOR LENSES · 板块视角</SectionLabel>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">他怎么看各个板块</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          点开任一板块，看他的方法论、会盯哪些数据、以及代表性原文观点。
        </p>
      </div>

      {groups.map((g) => (
        <div key={g.group} className="space-y-3">
          <p className="text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">{g.group}</p>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {g.items.map((s) => {
              const active = selected === s.key;
              return (
                <div key={s.key} className="space-y-0">
                  <button
                    type="button"
                    onClick={() => openSector(s.key)}
                    className={cn(
                      'flex w-full flex-col rounded-lg border p-4 text-left transition-colors',
                      active
                        ? 'border-primary/50 bg-primary/5'
                        : 'border-border/60 bg-card hover:border-primary/40',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-medium tracking-[0.16em] text-primary uppercase">
                          {s.eyebrow}
                        </p>
                        <h3 className="mt-1 text-lg font-medium tracking-tight text-foreground">{s.label}</h3>
                      </div>
                      <ChevronRight
                        className={cn('h-4 w-4 shrink-0 transition-transform', active && 'rotate-90 text-primary')}
                      />
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.stance}</p>
                    {s.tickers.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {s.tickers.map((tk) => (
                          <span key={tk} className="font-data rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">
                            {tk}
                          </span>
                        ))}
                      </div>
                    )}
                    {s.mention_count > 0 && (
                      <p className="mt-2 text-xs text-muted-foreground">{s.mention_count} 条相关提及</p>
                    )}
                  </button>
                </div>
              );
            })}
          </div>

          {/* detail panel for a selected sector within this group */}
          {selected && g.items.some((x) => x.key === selected) && (
            <div className="rounded-lg border border-primary/30 bg-card p-5">
              {loading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" /> 加载中
                </div>
              )}
              {detail && <SectorDetailBody detail={detail} showLens={showLens} setShowLens={setShowLens} />}
            </div>
          )}
        </div>
      ))}
    </section>
  );
}

function SectorDetailBody({
  detail,
  showLens,
  setShowLens,
}: {
  detail: KolCockpitSectorDetail;
  showLens: boolean;
  setShowLens: (v: boolean) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-medium tracking-[0.16em] text-primary uppercase">{detail.eyebrow}</p>
        <h3 className="mt-1 text-xl font-semibold tracking-tight text-foreground">{detail.label}</h3>
        <p className="mt-2 text-sm italic text-muted-foreground">「{detail.signature}」</p>
      </div>

      <div className="border-t border-border/50 pt-4">
        <p className="text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">核心问题</p>
        <p className="mt-2 text-base leading-relaxed text-foreground">{detail.primary_question}</p>
      </div>

      <div>
        <p className="text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">会盯哪些数据</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {detail.signals.map((sig) => (
            <span
              key={sig}
              className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-600 dark:text-emerald-400"
            >
              {sig}
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-amber-400/25 bg-amber-400/10 p-4">
        <div className="flex items-start gap-3">
          <Target className="mt-0.5 h-4 w-4 shrink-0 text-amber-500 dark:text-amber-300" />
          <div>
            <p className="text-xs font-medium tracking-[0.16em] text-amber-600 uppercase dark:text-amber-300">
              可证伪锚
            </p>
            <p className="mt-1 text-sm leading-relaxed text-foreground">{detail.falsifier}</p>
          </div>
        </div>
      </div>

      {detail.rep_tweets.length > 0 && (
        <div>
          <div className="flex items-center gap-2">
            <Quote className="h-4 w-4 text-primary" />
            <p className="text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">代表观点（原文）</p>
          </div>
          <div className="mt-3 space-y-2">
            {detail.rep_tweets.map((t) => (
              <TweetCard key={t.id} tweet={t} />
            ))}
          </div>
        </div>
      )}

      {detail.lens_body && (
        <div>
          <button
            type="button"
            onClick={() => setShowLens(!showLens)}
            className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80"
          >
            <BookOpen className="h-4 w-4" />
            {showLens ? '收起完整方法论' : '展开完整方法论'}
          </button>
          {showLens && (
            <div className="prose prose-sm mt-3 max-w-none rounded-lg border border-border/50 bg-background p-4 dark:prose-invert prose-headings:text-foreground prose-p:text-muted-foreground prose-strong:text-foreground prose-a:text-primary">
              <ReactMarkdown>{detail.lens_body}</ReactMarkdown>
            </div>
          )}
        </div>
      )}

      <AskFrankButton context={{ q: `按你的框架，现在怎么看「${detail.label}」？` }} variant="ghost" label="就这个板块追问 Frank →" />
    </div>
  );
}
