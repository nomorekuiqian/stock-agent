'use client';

import Link from 'next/link';
import { UserDigestItem } from '@/lib/api';
import { formatDateShort } from '@/lib/timezone';

interface FeatureCardsProps {
  todayDigest: UserDigestItem | null;
  isSubscribed: boolean;
  subscribing: boolean;
  checkingSubscription: boolean;
  generating: boolean;
  symbolCount: number;
  onGenerateDigest: () => void;
  onToggleHoldings: () => void;
  onToggleSubscription: () => void;
}

export default function FeatureCards({
  todayDigest,
  isSubscribed,
  subscribing,
  checkingSubscription,
  generating,
  symbolCount,
  onGenerateDigest,
  onToggleHoldings,
  onToggleSubscription,
}: FeatureCardsProps) {
  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 space-y-4">
      {/* Hero Card: Today's Digest */}
      {todayDigest ? (
        <DigestReadyCard
          digest={todayDigest}
          isSubscribed={isSubscribed}
          subscribing={subscribing}
          checkingSubscription={checkingSubscription}
          onToggleSubscription={onToggleSubscription}
        />
      ) : (
        <DigestGenerateCard
          generating={generating}
          symbolCount={symbolCount}
          isSubscribed={isSubscribed}
          subscribing={subscribing}
          checkingSubscription={checkingSubscription}
          onGenerate={onGenerateDigest}
          onToggleSubscription={onToggleSubscription}
        />
      )}

      {/* Bottom Row: 2 smaller cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Manage Holdings */}
        <button
          onClick={onToggleHoldings}
          className="terminal-card p-5 hover:border-primary/30 transition-all group text-left cursor-pointer focus:ring-2 focus:ring-primary/50 focus:outline-none"
        >
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
            </div>
            <div className="min-w-0">
              <h4 className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                管理持仓
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                搜索、添加或移除关注的股票
              </p>
            </div>
            <svg className="w-4 h-4 text-muted-foreground/50 group-hover:text-primary shrink-0 ml-auto transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </button>

        {/* AI Analysis (Coming Soon) */}
        <div className="terminal-card p-5 opacity-50 cursor-default">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <div className="min-w-0">
              <h4 className="text-sm font-medium text-foreground">
                AI 持仓分析
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                深度分析你的投资组合
              </p>
            </div>
            <span className="px-2 py-0.5 bg-muted text-muted-foreground text-micro rounded-md shrink-0 ml-auto tracking-wide uppercase">
              Soon
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */

function DigestReadyCard({
  digest,
  isSubscribed,
  subscribing,
  checkingSubscription,
  onToggleSubscription,
}: {
  digest: UserDigestItem;
  isSubscribed: boolean;
  subscribing: boolean;
  checkingSubscription: boolean;
  onToggleSubscription: () => void;
}) {
  return (
    <div className="relative terminal-card overflow-hidden">
      {/* Subtle emerald gradient accent at top */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />

      <div className="p-6 md:p-8">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          {/* Left: Content */}
          <div className="space-y-3 min-w-0 flex-1">
            {/* Badge row */}
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-primary/10 border border-primary/20">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                <span className="text-primary text-xs font-medium">今日日报已就绪</span>
              </span>
              <span className="text-xs text-muted-foreground font-data">
                {formatDateShort(digest.digest_date)}
              </span>
            </div>

            {/* Greeting / Title */}
            <h3 className="text-lg md:text-xl font-editorial text-foreground leading-snug line-clamp-2">
              {digest.greeting || '今日专属分析'}
            </h3>

            {/* Summary preview */}
            {digest.one_line_summary && (
              <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
                {digest.one_line_summary}
              </p>
            )}

            {/* Symbols used */}
            {digest.symbols && digest.symbols.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {digest.symbols.slice(0, 6).map((sym) => (
                  <span
                    key={sym}
                    className="px-1.5 py-0.5 bg-card border border-border/50 rounded text-micro font-data text-muted-foreground"
                  >
                    {sym}
                  </span>
                ))}
                {digest.symbols.length > 6 && (
                  <span className="px-1.5 py-0.5 text-micro text-muted-foreground">
                    +{digest.symbols.length - 6}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Right: Actions */}
          <div className="flex sm:flex-col items-center sm:items-end gap-3 shrink-0">
            <Link
              href={`/for-you/${digest.id}`}
              className="px-5 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium text-sm transition-all hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/20 inline-flex items-center gap-2 cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              阅读报告
            </Link>
            <SubscriptionToggle
              isSubscribed={isSubscribed}
              subscribing={subscribing}
              checkingSubscription={checkingSubscription}
              onToggle={onToggleSubscription}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function DigestGenerateCard({
  generating,
  symbolCount,
  isSubscribed,
  subscribing,
  checkingSubscription,
  onGenerate,
  onToggleSubscription,
}: {
  generating: boolean;
  symbolCount: number;
  isSubscribed: boolean;
  subscribing: boolean;
  checkingSubscription: boolean;
  onGenerate: () => void;
  onToggleSubscription: () => void;
}) {
  return (
    <div className="relative terminal-card overflow-hidden">
      {/* Subtle border glow */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />

      <div className="p-6 md:p-8">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          {/* Left: Content */}
          <div className="space-y-3 min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-card border border-border/50">
                <svg className="w-3.5 h-3.5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span className="text-muted-foreground text-xs font-medium">今日日报</span>
              </span>
            </div>

            <h3 className="text-lg md:text-xl font-editorial text-foreground leading-snug">
              生成你的专属市场分析
            </h3>

            <p className="text-sm text-muted-foreground leading-relaxed">
              基于 {symbolCount} 只关注股票，AI 将为你生成今日市场洞察、持仓分析和重要事件提醒
            </p>
          </div>

          {/* Right: Actions */}
          <div className="flex sm:flex-col items-center sm:items-end gap-3 shrink-0">
            <button
              onClick={onGenerate}
              disabled={generating}
              className="px-5 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium text-sm transition-all hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/20 disabled:opacity-60 disabled:cursor-not-allowed disabled:shadow-none inline-flex items-center gap-2 cursor-pointer"
            >
              {generating ? (
                <>
                  <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                  生成中...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  生成日报
                </>
              )}
            </button>
            <SubscriptionToggle
              isSubscribed={isSubscribed}
              subscribing={subscribing}
              checkingSubscription={checkingSubscription}
              onToggle={onToggleSubscription}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function SubscriptionToggle({
  isSubscribed,
  subscribing,
  checkingSubscription,
  onToggle,
}: {
  isSubscribed: boolean;
  subscribing: boolean;
  checkingSubscription: boolean;
  onToggle: () => void;
}) {
  const loading = subscribing || checkingSubscription;

  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
      disabled={loading}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
        isSubscribed
          ? 'text-primary hover:text-destructive'
          : 'text-muted-foreground hover:text-foreground'
      }`}
      aria-label={isSubscribed ? '取消邮件订阅' : '开启邮件订阅'}
    >
      {loading ? (
        <div className="w-3.5 h-3.5 rounded-full border-2 border-current/20 border-t-current animate-spin" />
      ) : (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      )}
      {isSubscribed ? '已订阅邮件' : '订阅邮件'}
    </button>
  );
}
