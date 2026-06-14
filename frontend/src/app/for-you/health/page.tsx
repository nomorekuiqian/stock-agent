'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { ForYouBreadcrumb } from '@/components/for-you/ForYouBreadcrumb';
import PaywallGuard from '@/components/PaywallGuard';
import { usePortfolio } from '@/hooks/queries/use-portfolio';
import { useHealthReport, useGenerateHealthCheck } from '@/hooks/queries/use-health';
import { HealthScore, DiagnosisOutput } from '@/lib/api';

const DIMENSION_LABELS: Record<keyof Omit<HealthScore, 'total'>, { label: string; icon: string; desc: string }> = {
  dispersion: { label: '分散度', icon: '🎯', desc: '板块分布均衡程度' },
  performance: { label: '表现', icon: '📈', desc: '近期收益 vs 大盘' },
  macro_fit: { label: '宏观适配', icon: '🌍', desc: '与当前宏观环境匹配' },
  stability: { label: '稳定性', icon: '⚖️', desc: '组合波动率水平' },
};

function ScoreCard({ dimension, score, max = 25 }: { dimension: string; score: number; max?: number }) {
  const info = DIMENSION_LABELS[dimension as keyof typeof DIMENSION_LABELS] || { label: dimension, icon: '📊', desc: '' };
  const pct = (score / max) * 100;
  const color = pct >= 70 ? 'text-emerald-500' : pct >= 40 ? 'text-amber-500' : 'text-red-400';
  const barColor = pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-400';

  return (
    <div className="rounded-xl border border-border/50 bg-card/50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">{info.icon}</span>
          <span className="text-sm font-medium text-foreground">{info.label}</span>
        </div>
        <span className={`text-xl font-data font-semibold ${color}`}>{score}</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${barColor} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">{info.desc}</p>
    </div>
  );
}

function TotalScore({ score }: { score: number }) {
  const color = score >= 70 ? 'text-emerald-500' : score >= 40 ? 'text-amber-500' : 'text-red-400';
  const label = score >= 80 ? '优秀' : score >= 60 ? '良好' : score >= 40 ? '需关注' : '需改善';

  return (
    <div className="flex flex-col items-center gap-2 py-6">
      <span className={`text-6xl font-data font-bold ${color}`}>{score}</span>
      <span className="text-sm text-muted-foreground">/ 100</span>
      <span className={`text-sm font-medium ${color}`}>{label}</span>
    </div>
  );
}

function DiagnosisPanel({ diagnosis }: { diagnosis: DiagnosisOutput }) {
  return (
    <div className="space-y-4">
      {/* One-line summary */}
      <div className="rounded-xl border border-border/50 bg-card/50 p-4">
        <p className="text-sm font-medium text-foreground">{diagnosis.one_line}</p>
        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
          <span>风格: {diagnosis.sector_dna}</span>
          <span>·</span>
          <span>宏观敏感度: {diagnosis.macro_sensitivity_tag === 'high' ? '高' : diagnosis.macro_sensitivity_tag === 'mid' ? '中' : '低'}</span>
        </div>
      </div>

      {/* Top risk */}
      {diagnosis.top_risk && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span className="text-sm text-amber-700 dark:text-amber-400">主要风险: {diagnosis.top_risk}</span>
        </div>
      )}

      {/* Diagnosis markdown */}
      <div className="rounded-xl border border-border/50 bg-card/50 p-4">
        <h3 className="text-sm font-medium text-foreground mb-3">AI 诊断</h3>
        <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground">
          {diagnosis.diagnosis_markdown.split('\n\n').map((para, i) => (
            <p key={i} className="mb-3 last:mb-0 text-sm leading-relaxed">{para}</p>
          ))}
        </div>
      </div>

      {/* Next action */}
      {diagnosis.next_action.type !== 'none' && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </div>
            <span className="text-sm font-medium text-foreground">建议: {diagnosis.next_action.text}</span>
          </div>
          {diagnosis.next_action.symbols.length > 0 && (
            <div className="flex gap-2 mt-2 ml-8">
              {diagnosis.next_action.symbols.map((sym) => (
                <Link
                  key={sym}
                  href={`/stock/${sym}`}
                  className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                >
                  {sym}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  );
}

function HealthContent() {
  const router = useRouter();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const { data: portfolio, isLoading: portfolioLoading } = usePortfolio(user?.id);
  const generateHealth = useGenerateHealthCheck();

  const [hasGenerated, setHasGenerated] = useState(false);

  // Auto-fetch report (POST with cache) when portfolio exists
  const shouldFetch = !!user?.id && !!portfolio?.holdings?.length && !portfolioLoading;
  const { data: report, isLoading: reportLoading, isError, error } = useHealthReport(shouldFetch);

  if (authLoading) return null;
  if (!isAuthenticated) {
    router.push('/login?redirect=/for-you/health');
    return null;
  }

  const isLoading = portfolioLoading || reportLoading;
  const hasHoldings = portfolio?.holdings && portfolio.holdings.length > 0;
  const showFirstTime = !report && !isLoading && hasHoldings && !hasGenerated;

  const handleGenerate = (force = false) => {
    setHasGenerated(true);
    generateHealth.mutate({ force });
  };

  const displayReport = generateHealth.data || report;

  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <section className="border-b border-border/50">
        <div className="max-w-4xl mx-auto px-4 md:px-6 py-8 md:py-12">
          <ForYouBreadcrumb current="持仓体检" />
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-primary to-transparent" />
            <span className="text-primary text-xs font-semibold tracking-[0.25em] uppercase">Health Check</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-editorial text-foreground tracking-tight leading-[1.1] mt-4">
            持仓体检
          </h1>
          <p className="text-muted-foreground text-sm mt-2">
            4 维量化评分 + AI 诊断，帮你发现组合中的隐患和优化空间
          </p>
        </div>
      </section>

      <div className="max-w-4xl mx-auto px-4 md:px-6 py-8">
        {/* Empty portfolio */}
        {!isLoading && !hasHoldings && (
          <div className="flex flex-col items-center justify-center gap-4 py-16 rounded-xl border border-dashed border-border/50 bg-card/30">
            <p className="text-sm text-muted-foreground">请先添加持仓</p>
            <Link
              href="/for-you/portfolio"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:bg-primary/90 transition-colors"
            >
              添加持仓
            </Link>
          </div>
        )}

        {/* Loading */}
        {(isLoading || generateHealth.isPending) && (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-3 py-8">
              <div className="w-8 h-8 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
              <p className="text-sm text-muted-foreground">
                {generateHealth.isPending ? `正在分析你的 ${portfolio?.holdings?.length || 0} 只持仓...` : '加载中...'}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-28 bg-muted/40 rounded-xl animate-pulse" />
              ))}
            </div>
          </div>
        )}

        {/* First time - generate CTA */}
        {showFirstTime && !generateHealth.isPending && (
          <div className="flex flex-col items-center justify-center gap-4 py-16 rounded-xl border border-dashed border-primary/30 bg-primary/5">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
              <svg className="w-7 h-7 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              基于你的 {portfolio?.holdings?.length || 0} 只持仓，从分散度、表现、宏观适配、稳定性四个维度评估
            </p>
            <button
              type="button"
              onClick={() => handleGenerate(false)}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              生成我的第一份体检
            </button>
          </div>
        )}

        {/* Error */}
        {isError && !generateHealth.isPending && (
          <div className="flex flex-col items-center gap-3 py-12 rounded-xl border border-dashed border-red-500/30 bg-red-500/5">
            <p className="text-sm text-red-400">体检生成失败</p>
            <p className="text-xs text-muted-foreground">{(error as Error)?.message || '请稍后重试'}</p>
            <button
              type="button"
              onClick={() => handleGenerate(true)}
              className="text-sm px-4 py-2 rounded-lg border border-border/50 hover:border-primary/30 transition-colors"
            >
              重试
            </button>
          </div>
        )}

        {/* Report display */}
        {displayReport && !generateHealth.isPending && (
          <div className="space-y-6">
            {/* Total score */}
            <TotalScore score={displayReport.score.total} />

            {/* 4 score cards */}
            <div className="grid grid-cols-2 gap-3">
              <ScoreCard dimension="dispersion" score={displayReport.score.dispersion} />
              <ScoreCard dimension="performance" score={displayReport.score.performance} />
              <ScoreCard dimension="macro_fit" score={displayReport.score.macro_fit} />
              <ScoreCard dimension="stability" score={displayReport.score.stability} />
            </div>

            {/* Diagnosis */}
            {displayReport.diagnosis && (
              <DiagnosisPanel diagnosis={displayReport.diagnosis} />
            )}

            {/* Metadata + regenerate */}
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-4 border-t border-border/30">
              <span>
                生成于 {new Date(displayReport.generated_at).toLocaleString('zh-CN')}
                {displayReport.from_cache && ' (缓存)'}
                {displayReport.is_first_report && ' · 首次体检'}
              </span>
              <button
                type="button"
                onClick={() => handleGenerate(true)}
                disabled={generateHealth.isPending}
                className="text-xs text-primary hover:text-primary/80 transition-colors disabled:opacity-50"
              >
                重新生成
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

export default function HealthPage() {
  return (
    <PaywallGuard requiredFeature="for_you_website">
      <HealthContent />
    </PaywallGuard>
  );
}
