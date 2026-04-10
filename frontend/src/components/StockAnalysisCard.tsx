'use client';

import { useState } from 'react';
import { formatTimestamp } from '@/lib/timezone';

interface StockAIAnalysis {
  title: string;
  company_profile: string;
  financial_health: string;
  valuation_judgment: string;
  catalysts_and_risks: string;
  investment_summary: string;
  // Legacy fields (backward compatibility with cached analysis)
  fundamentals_analysis?: string;
  financials_analysis?: string;
  company_overview?: string;
  valuation_range?: string;
  opportunities?: string;
  risks?: string;
}

interface StockAnalysisCardProps {
  symbol: string;
  analysis?: StockAIAnalysis | null;
  onGenerate?: () => Promise<void>;
  loading?: boolean;
  error?: string | null;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

function SubsectionHeader({ title, titleEn }: { title: string; titleEn: string }) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-medium uppercase tracking-wide mb-3">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400/80" />
      <span className="text-amber-400">{title}</span>
      <span className="text-muted-foreground/70 font-normal normal-case">{titleEn}</span>
    </h3>
  );
}

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-card/50 border border-border/40 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-border/30 bg-card/40">
        <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
          <div className="w-1 h-5 bg-primary rounded-full" />
          <span>AI 分析</span>
          <span className="text-muted-foreground text-sm font-normal">Investment View</span>
        </h2>
      </div>
      <div className="p-5">
        {children}
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-6 w-3/4 bg-muted rounded" />
      <div className="space-y-2">
        <div className="h-4 w-full bg-muted rounded" />
        <div className="h-4 w-5/6 bg-muted rounded" />
        <div className="h-4 w-4/5 bg-muted rounded" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="h-20 bg-muted rounded-lg" />
        <div className="h-20 bg-muted rounded-lg" />
      </div>
    </div>
  );
}

function EmptyState({ onGenerate, loading }: { onGenerate: () => void; loading: boolean }) {
  return (
    <div className="text-center py-8">
      <div className="w-14 h-14 mx-auto rounded-xl bg-primary/10 flex items-center justify-center mb-4">
        <svg className="w-7 h-7 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      </div>
      <h3 className="text-base font-medium text-foreground mb-2">AI 分析</h3>
      <p className="text-sm text-muted-foreground mb-4 max-w-xs mx-auto">
        点击下方按钮，生成该股票的 AI 综合分析报告
      </p>
      <button
        onClick={onGenerate}
        disabled={loading}
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium text-sm transition-all hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? (
          <>
            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            分析中...
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            生成 AI 分析
          </>
        )}
      </button>
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="text-center py-6">
      <div className="w-12 h-12 mx-auto rounded-xl bg-red-500/10 flex items-center justify-center mb-3">
        <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <p className="text-sm text-muted-foreground mb-3">{error}</p>
      <button
        onClick={onRetry}
        className="text-sm text-primary hover:text-primary/70 transition-colors"
      >
        重试
      </button>
    </div>
  );
}

export function StockAnalysisCard({
  symbol,
  analysis: initialAnalysis,
  onGenerate: externalOnGenerate,
  loading: externalLoading,
  error: externalError,
}: StockAnalysisCardProps) {
  const [analysis, setAnalysis] = useState<StockAIAnalysis | null>(initialAnalysis || null);
  const [loading, setLoading] = useState(externalLoading || false);
  const [error, setError] = useState<string | null>(externalError || null);
  const [fromCache, setFromCache] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  const handleGenerate = async (force: boolean = false) => {
    if (externalOnGenerate) {
      await externalOnGenerate();
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/stocks/${symbol}/analysis?force=${force}`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(`Failed to generate analysis: ${response.status}`);
      }

      const data = await response.json();

      if (data.success && data.analysis) {
        setAnalysis(data.analysis);
        setFromCache(data.meta?.from_cache || false);
        setGeneratedAt(data.meta?.generated_at || null);
      } else {
        throw new Error(data.error || 'Failed to generate analysis');
      }
    } catch (err) {
      console.error('Analysis error:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate analysis');
    } finally {
      setLoading(false);
    }
  };

  const isLoading = loading || (externalLoading ?? false);
  const currentError = error || externalError;

  if (!analysis && !isLoading && !currentError) {
    return (
      <CardShell>
        <EmptyState onGenerate={() => handleGenerate(false)} loading={isLoading} />
      </CardShell>
    );
  }

  if (currentError && !analysis) {
    return (
      <CardShell>
        <ErrorState error={currentError} onRetry={() => handleGenerate(false)} />
      </CardShell>
    );
  }

  if (isLoading && !analysis) {
    return (
      <CardShell>
        <LoadingState />
      </CardShell>
    );
  }

  // Render analysis
  const {
    title,
    fundamentals_analysis,
    financials_analysis,
    company_overview,
    opportunities,
    risks,
    investment_summary,
  } = analysis!;

  return (
    <div className="bg-card/50 border border-border/40 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border/30 bg-card/40">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2 mb-1">
              <div className="w-1 h-5 bg-primary rounded-full" />
              <span>AI Analysis</span>
              <span className="text-muted-foreground text-sm font-normal">Investment View</span>
            </h2>
            {title && (
              <p className="text-sm text-foreground/80 font-medium">{title}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {fromCache && (
              <span className="text-xs text-muted-foreground">已缓存</span>
            )}
            <button
              onClick={() => handleGenerate(true)}
              disabled={isLoading}
              className="p-2 text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
              title="重新生成"
            >
              <svg className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* Company Overview */}
        {company_overview && (
          <div>
            <SubsectionHeader title="公司概况" titleEn="Overview" />
            <p className="text-sm text-muted-foreground leading-relaxed">{company_overview}</p>
          </div>
        )}

        {/* Fundamentals Analysis */}
        {fundamentals_analysis && (
          <div className="pt-4 border-t border-border/30">
            <SubsectionHeader title="基本面" titleEn="Fundamentals" />
            <p className="text-sm text-muted-foreground leading-relaxed">{fundamentals_analysis}</p>
          </div>
        )}

        {/* Financials Analysis */}
        {financials_analysis && (
          <div className="pt-4 border-t border-border/30">
            <SubsectionHeader title="财务分析" titleEn="Financials" />
            <p className="text-sm text-muted-foreground leading-relaxed">{financials_analysis}</p>
          </div>
        )}

        {/* Opportunities & Risks */}
        {(opportunities || risks) && (
          <div className="pt-4 border-t border-border/30">
            <div className="grid md:grid-cols-2 gap-4">
              {opportunities && (
                <div>
                  <SubsectionHeader title="投资机会" titleEn="Opportunities" />
                  <p className="text-sm text-muted-foreground leading-relaxed">{opportunities}</p>
                </div>
              )}
              {risks && (
                <div>
                  <SubsectionHeader title="风险因素" titleEn="Risks" />
                  <p className="text-sm text-muted-foreground leading-relaxed">{risks}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Investment Summary */}
        {investment_summary && (
          <div className="pt-4 border-t border-border/30">
            <SubsectionHeader title="投资总结" titleEn="Summary" />
            <div className="p-4 bg-card/60 border border-border/40 rounded-lg">
              <p className="text-sm text-foreground/90 leading-relaxed">{investment_summary}</p>
            </div>
          </div>
        )}

        {/* Footer */}
        {generatedAt && (
          <div className="pt-3 border-t border-border/20 text-xs text-muted-foreground/60">
            生成时间: {formatTimestamp(generatedAt)}
          </div>
        )}
      </div>
    </div>
  );
}

export function InlineAnalysisText({
  text,
  loading,
}: {
  text?: string;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        <div className="h-4 w-full bg-muted rounded" />
        <div className="h-4 w-5/6 bg-muted rounded" />
        <div className="h-4 w-4/5 bg-muted rounded" />
      </div>
    );
  }

  if (!text) return null;

  return (
    <p className="text-sm text-muted-foreground leading-relaxed">{text}</p>
  );
}

export type { StockAIAnalysis };
