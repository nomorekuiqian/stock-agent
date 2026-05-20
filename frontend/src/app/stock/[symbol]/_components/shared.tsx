'use client';

import { useState } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import { useAuth, getAccessTokenAsync as getAccessToken } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useEntitlements } from '@/contexts/EntitlementsContext';
import { Crown, ArrowRight, Lock, Zap } from 'lucide-react';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

// =============================================================================
// AI Paywall - inline CTA shown when user lacks stock_research entitlement
// =============================================================================

export function AIPaywall({ symbol, label }: { symbol: string; label: string }) {
  const { isAuthenticated } = useAuth();
  const { refreshSubscription } = useSubscription();
  const { trialEligible, refresh: refreshEntitlements } = useEntitlements();

  const [isActivating, setIsActivating] = useState(false);
  const [activateError, setActivateError] = useState('');
  const trialUsed = !trialEligible;

  const handleActivateTrial = async () => {
    setIsActivating(true);
    setActivateError('');
    try {
      const token = await getAccessToken();
      if (!token) {
        setActivateError('登录已过期，请重新登录');
        setIsActivating(false);
        return;
      }
      const res = await fetch(`${API_BASE_URL}/invites/auto-trial`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        // Always refresh — `already_active=true` may mean the trial is
        // currently running, not expired. Server truth wins.
        await refreshSubscription();
        await refreshEntitlements({ fresh: true });
      } else {
        const data = await res.json().catch(() => ({}));
        setActivateError(data.detail || '激活失败，请稍后再试');
      }
    } catch {
      setActivateError('网络错误，请稍后再试');
    } finally {
      setIsActivating(false);
    }
  };

  return (
    <div className="px-6 py-8 text-center">
      {/* Label — matches sibling generate CTA style */}
      <div className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.15em] text-amber-400/60 mb-3">
        <div className="w-4 h-px bg-amber-400/25" />
        {label}
        <div className="w-4 h-px bg-amber-400/25" />
      </div>

      {/* Title — gives the paywall visual weight matching the generate CTA */}
      <h3 className="font-editorial text-lg text-foreground mb-2">
        <Lock className="w-4 h-4 text-amber-400/70 inline -mt-0.5 mr-1.5" />
        Max 订阅专属
      </h3>

      <p className="text-xs text-muted-foreground mb-6 leading-relaxed max-w-[260px] mx-auto">
        {!isAuthenticated
          ? '注册即可免费体验 14 天全部 AI 投研功能'
          : '解锁 AI 深度个股分析 + AI 投研引擎无限使用'}
      </p>

      {/* --- CTA area --- */}
      {!isAuthenticated ? (
        <Link
          href={`/login?redirect=/stock/${symbol}`}
          className="group inline-flex items-center gap-2 px-5 py-2.5 bg-primary/10 border border-primary/25 rounded-lg
            text-sm font-medium text-primary hover:bg-primary/20 hover:border-primary/40 transition-all"
        >
          <span>免费注册体验</span>
          <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      ) : trialUsed ? (
        <div>
          <p className="text-xs text-muted-foreground mb-3">你的试用已结束</p>
          <Link
            href="/pricing"
            className="group inline-flex items-center gap-2 px-5 py-2.5 bg-amber-400/10 border border-amber-400/25 rounded-lg
              text-sm font-medium text-amber-400 hover:bg-amber-400/20 hover:border-amber-400/40 transition-all"
          >
            <Crown className="w-3.5 h-3.5" />
            <span>查看订阅方案</span>
            <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      ) : (
        <div>
          <button
            onClick={handleActivateTrial}
            disabled={isActivating}
            className="group inline-flex items-center gap-2 px-5 py-2.5 bg-primary/10 border border-primary/25 rounded-lg
              text-sm font-medium text-primary hover:bg-primary/20 hover:border-primary/40 transition-all cursor-pointer
              disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isActivating ? (
              <>
                <span className="w-3.5 h-3.5 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                <span>激活中...</span>
              </>
            ) : (
              <>
                <Zap className="w-3.5 h-3.5" />
                <span>开启 14 天免费试用</span>
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </button>
          {activateError && (
            <p className="text-xs text-red-400 mt-2">{activateError}</p>
          )}
          <div className="mt-4">
            <Link
              href="/pricing"
              className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            >
              或查看订阅方案 &rarr;
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// AnalysisSection - collapsible markdown section
// =============================================================================

const ACCENT_BAR_COLORS: Record<string, string> = {
  emerald: 'bg-emerald-500/60',
  teal: 'bg-teal-500/60',
  sky: 'bg-sky-500/60',
  amber: 'bg-amber-400/60',
  blue: 'bg-blue-500/60',
  violet: 'bg-violet-500/60',
};

export function AnalysisSection({ label, content, accentColor = 'teal', defaultOpen = true }: {
  label: string;
  content: string;
  accentColor?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (!content) return null;

  const barColor = ACCENT_BAR_COLORS[accentColor] || ACCENT_BAR_COLORS.teal;

  return (
    <div className="mt-3 first:mt-0">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-left cursor-pointer group
          bg-white/[0.08] light:bg-black/[0.05] rounded-lg border border-white/[0.12] light:border-black/[0.1]
          hover:bg-white/[0.12] light:hover:bg-black/[0.08] transition-colors
          focus-visible:ring-2 focus-visible:ring-teal-500/40 focus-visible:outline-none">
        <div className="flex items-center gap-2.5">
          <div className={`w-1 h-4 rounded-full ${barColor}`} />
          <h4 className="text-sm font-medium text-foreground group-hover:text-foreground transition-colors">{label}</h4>
        </div>
        <svg className={`w-3.5 h-3.5 text-muted-foreground/40 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="px-3 pb-4 pt-3 text-[13px] text-muted-foreground leading-[1.8] prose prose-sm max-w-none
          prose-headings:text-foreground prose-headings:font-semibold
          prose-strong:text-foreground prose-strong:font-medium
          prose-p:text-muted-foreground prose-p:my-2.5
          prose-li:text-muted-foreground prose-li:my-1
          prose-ul:my-2 prose-ul:pl-4 prose-ol:my-2
          prose-a:text-primary prose-a:no-underline hover:prose-a:underline
          prose-code:text-amber-500 prose-code:bg-amber-500/10 prose-code:px-1 prose-code:rounded
          prose-hr:border-border/30
          prose-blockquote:border-border prose-blockquote:text-muted-foreground">
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}
