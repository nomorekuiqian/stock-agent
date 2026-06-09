'use client';

import { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Brain, ChevronRight, Quote, Target } from 'lucide-react';

import type { KolSectorDetail } from '@/lib/api';

interface Props {
  detail: KolSectorDetail;
  username: string;
}

/**
 * Skill-only macro view used by Serenity (whose macro layer is the AI capex
 * cycle, not Fed regime). Keeps the visual language Frank uses (eyebrow + h1
 * + structured rule columns + collapsible full body) but drops the indicator
 * atlas / liquidity panels that don't apply to her work.
 */
export default function SerenityMacroFramework({ detail }: Props) {
  const [expanded, setExpanded] = useState(false);

  // The router enriches each rule with `{text, evidence}`; pull just the texts.
  const ruleTexts = (rules: { text: string }[] | undefined) =>
    (rules ?? []).map((r) => r.text).filter(Boolean);

  const signals = useMemo(() => ruleTexts(detail.signals), [detail.signals]);
  const bullishCues = useMemo(
    () => ruleTexts(detail.bull_conditions),
    [detail.bull_conditions],
  );
  const bearishCues = useMemo(
    () => ruleTexts(detail.bear_triggers),
    [detail.bear_triggers],
  );
  const falsifiers = useMemo(
    () => ruleTexts(detail.falsifiers),
    [detail.falsifiers],
  );
  const misreadings = useMemo(
    () => ruleTexts(detail.misreadings),
    [detail.misreadings],
  );
  const coreQs = useMemo(
    () => ruleTexts(detail.core_questions),
    [detail.core_questions],
  );

  return (
    <div className="space-y-6 pb-10">
      {/* Header block */}
      <section className="rounded-lg border border-border/45 bg-card/30 p-5 md:p-6">
        <div className="flex items-center gap-3">
          <div className="h-px w-12 bg-gradient-to-r from-primary to-transparent" />
          <span className="text-xs font-medium uppercase tracking-[0.2em] text-primary">
            {detail.eyebrow || 'AI CAPEX CYCLE'}
          </span>
        </div>
        <h2 className="mt-3 font-editorial text-3xl tracking-tight text-foreground md:text-4xl">
          {detail.label}
        </h2>
        {detail.short && (
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground md:text-base">
            {detail.short}
          </p>
        )}
        {coreQs.length > 0 && (
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {coreQs.slice(0, 4).map((q, i) => (
              <div
                key={i}
                className="rounded-md border border-border/45 bg-background/45 p-3"
              >
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                  核心问题 {i + 1}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-foreground">{q}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Three columns: signals / bullish-bearish / falsifiers */}
      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr_0.9fr]">
        {/* Signals */}
        <RuleBlock
          icon={<Brain className="h-4 w-4 text-primary" aria-hidden />}
          title="她盯哪些信号"
          tone="primary"
          rules={signals}
          empty="暂无信号"
        />

        {/* Bullish + bearish stacked */}
        <div className="space-y-4">
          <RuleBlock
            icon={
              <ChevronRight
                className="h-4 w-4 rotate-90 text-emerald-500"
                aria-hidden
              />
            }
            title="加仓 / 升级触发"
            tone="bull"
            rules={bullishCues}
            empty="暂无加仓规则"
            compact
          />
          <RuleBlock
            icon={
              <ChevronRight
                className="h-4 w-4 -rotate-90 text-amber-500"
                aria-hidden
              />
            }
            title="减仓 / 轮动触发"
            tone="bear"
            rules={bearishCues}
            empty="暂无减仓规则"
            compact
          />
        </div>

        {/* Falsifiers + misreadings */}
        <div className="space-y-4">
          <RuleBlock
            icon={
              <Target
                className="h-4 w-4 text-amber-500 dark:text-amber-300"
                aria-hidden
              />
            }
            title="可证伪锚"
            tone="warn"
            rules={falsifiers}
            empty="未列证伪条件"
            compact
          />
          <RuleBlock
            icon={
              <Quote className="h-4 w-4 text-muted-foreground" aria-hidden />
            }
            title="常见误读"
            tone="muted"
            rules={misreadings}
            empty="未列常见误读"
            compact
          />
        </div>
      </div>

      {/* Representative tweets (raw blockquotes from her tweets, used as evidence) */}
      {detail.rep_tweets && detail.rep_tweets.length > 0 && (
        <section className="rounded-lg border border-border/45 bg-card/30 p-5">
          <div className="flex items-center gap-2">
            <Quote className="h-4 w-4 text-primary" aria-hidden />
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              代表性原文
            </p>
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {detail.rep_tweets.slice(0, 4).map((t) => (
              <div
                key={t.id}
                className="rounded-md border border-border/45 bg-background/45 p-3"
              >
                {t.created_at && (
                  <p className="font-data text-xs tabular-nums text-muted-foreground">
                    {t.created_at.slice(0, 10)}
                  </p>
                )}
                <p className="mt-2 line-clamp-6 text-sm leading-relaxed text-foreground">
                  {t.text}
                </p>
                {t.url && (
                  <a
                    href={t.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80"
                  >
                    原文 →
                  </a>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Full skill body — collapsible Markdown */}
      {detail.full_body && (
        <section className="rounded-lg border border-border/45 bg-card/20 p-5">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-2 text-sm font-medium text-primary transition hover:text-primary/80"
          >
            <ChevronRight
              className={`h-4 w-4 transition-transform ${expanded ? 'rotate-90' : ''}`}
            />
            {expanded ? '收起完整方法论' : '展开完整方法论 (skill markdown)'}
          </button>
          {expanded && (
            <div className="prose prose-sm mt-4 max-w-none dark:prose-invert prose-headings:text-foreground prose-p:text-muted-foreground prose-strong:text-foreground prose-a:text-primary">
              <ReactMarkdown>{detail.full_body}</ReactMarkdown>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function RuleBlock({
  icon,
  title,
  tone,
  rules,
  empty,
  compact = false,
}: {
  icon: React.ReactNode;
  title: string;
  tone: 'primary' | 'bull' | 'bear' | 'warn' | 'muted';
  rules: string[];
  empty: string;
  compact?: boolean;
}) {
  const ringTone =
    tone === 'primary'
      ? 'border-primary/25'
      : tone === 'bull'
        ? 'border-emerald-500/30'
        : tone === 'bear'
          ? 'border-amber-500/30'
          : tone === 'warn'
            ? 'border-amber-400/30'
            : 'border-border/45';
  return (
    <div className={`rounded-lg border bg-card/30 p-4 ${ringTone}`}>
      <div className="flex items-center gap-2">
        {icon}
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
          {title}
        </p>
      </div>
      {rules.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className={`mt-3 space-y-${compact ? '1.5' : '2.5'}`}>
          {rules.map((r, i) => (
            <li
              key={i}
              className="flex items-start gap-2 text-sm leading-relaxed text-foreground"
            >
              <span
                className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary/60"
                aria-hidden
              />
              <span>{r}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
