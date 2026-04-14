'use client';

import dynamic from 'next/dynamic';
import { TechnicalSignalDashboard } from '@/components/technical/TechnicalSignalDashboard';
import { AnalysisSection } from './shared';
import { SectionCard } from './StockDetailContent';

const TechnicalChart = dynamic(
  () => import('@/components/technical/TechnicalChart').then(mod => mod.TechnicalChart),
  { ssr: false, loading: () => <div className="h-[400px] bg-card/30 animate-pulse rounded-xl" /> },
);

// =============================================================================
// Types
// =============================================================================

interface TechnicalTabProps {
  symbol: string;
  companyName: string;
  // Timeframe
  timeframe: 'daily' | 'weekly';
  onTimeframeChange: (tf: 'daily' | 'weekly') => void;
  // AI Analysis
  technicalAnalysis: {
    title?: string;
    trend_analysis?: string;
    entry_exit_signals?: string;
    pattern_analysis?: string;
    technical_summary?: string;
  } | null;
  technicalLoading: boolean;
  onGenerate: () => void;
  onRegenerate: () => void;
  // Signal Dashboard
  technicalSnapshot: any;
  snapshotLoading: boolean;
}

// =============================================================================
// TechnicalTab Component
// =============================================================================

export function TechnicalTab({
  symbol,
  companyName,
  timeframe,
  onTimeframeChange,
  technicalAnalysis,
  technicalLoading,
  onGenerate,
  onRegenerate,
  technicalSnapshot,
  snapshotLoading,
}: TechnicalTabProps) {

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">

      {/* ============================================================ */}
      {/* LEFT: AI Technical Analysis                                  */}
      {/* Mobile: second, Desktop: left                                */}
      {/* ============================================================ */}
      <div className="order-2 lg:order-1 lg:sticky lg:top-4">
        <div className="bg-card/50 border border-border/30 rounded-xl overflow-hidden">
          {!technicalAnalysis && !technicalLoading ? (
            <div className="p-6 text-center">
              <div className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.15em] text-emerald-500/50 mb-3">
                <div className="w-4 h-px bg-emerald-500/25" />
                AI 技术分析
                <div className="w-4 h-px bg-emerald-500/25" />
              </div>
              <h3 className="font-editorial text-lg text-foreground mb-2">{symbol} 技术分析</h3>
              <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
                AI 分析 {companyName} 的技术指标、趋势信号、支撑阻力位和图形形态
              </p>
              <button
                onClick={onGenerate}
                className="group inline-flex items-center gap-2 px-5 py-2 bg-emerald-500/10 border border-emerald-500/25 rounded-lg
                  text-sm font-medium text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/40 transition-all cursor-pointer
                  focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:outline-none"
              >
                <span>生成技术分析</span>
                <svg className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </button>
            </div>
          ) : technicalLoading ? (
            <div className="p-8 text-center">
              <div className="w-6 h-6 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mx-auto mb-3" />
              <p className="text-xs text-muted-foreground">正在生成 {symbol} 技术分析...</p>
            </div>
          ) : technicalAnalysis ? (
            <>
              <div className="px-4 py-2.5 border-b border-border/20 bg-card/40 flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">AI 技术分析</span>
                <button
                  onClick={onRegenerate}
                  disabled={technicalLoading}
                  className="text-muted-foreground hover:text-emerald-400 transition-colors p-1 rounded cursor-pointer
                    focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:outline-none disabled:opacity-50"
                  title="重新生成"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                  </svg>
                </button>
              </div>
              <div className="px-4 py-3">
                {technicalAnalysis.title && (
                  <h3 className="font-editorial text-sm text-foreground leading-snug mb-3">
                    {technicalAnalysis.title}
                  </h3>
                )}
                <AnalysisSection label="技术总结" content={technicalAnalysis.technical_summary || ''} accentColor="emerald" />
                <AnalysisSection label="趋势分析" content={technicalAnalysis.trend_analysis || ''} accentColor="emerald" />
                <AnalysisSection label="关键价位" content={technicalAnalysis.entry_exit_signals || ''} accentColor="emerald" />
                <AnalysisSection label="信号与风险" content={technicalAnalysis.pattern_analysis || ''} accentColor="emerald" />
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* ============================================================ */}
      {/* RIGHT: Chart + Signals                                       */}
      {/* Mobile: first, Desktop: right                                */}
      {/* ============================================================ */}
      <div className="order-1 lg:order-2 space-y-5">

        {/* Timeframe Switcher */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">周期</span>
          <div className="flex gap-0.5 p-0.5 bg-muted/40 rounded-lg border border-border/30">
            <button
              onClick={() => onTimeframeChange('daily')}
              className={`px-4 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer
                focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none ${
                timeframe === 'daily'
                  ? 'bg-primary/15 text-primary border border-primary/30 shadow-sm'
                  : 'text-muted-foreground hover:text-foreground border border-transparent'
              }`}
            >
              日线
            </button>
            <button
              onClick={() => onTimeframeChange('weekly')}
              className={`px-4 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer
                focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none ${
                timeframe === 'weekly'
                  ? 'bg-primary/15 text-primary border border-primary/30 shadow-sm'
                  : 'text-muted-foreground hover:text-foreground border border-transparent'
              }`}
            >
              周线
            </button>
          </div>
        </div>

        {/* K-Line Chart */}
        <TechnicalChart symbol={symbol} interval={timeframe === 'weekly' ? 'W' : 'D'} />

        {/* Signal Dashboard */}
        <SectionCard title="信号仪表盘" titleEn="Signals" numberLabel="01">
          {snapshotLoading ? (
            <div className="animate-pulse space-y-3">
              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 3].map(i => <div key={i} className="h-16 bg-muted/30 rounded-lg" />)}
              </div>
              <div className="h-16 bg-muted/30 rounded-lg" />
              <div className="grid grid-cols-2 gap-2">
                {[1, 2].map(i => <div key={i} className="h-20 bg-muted/30 rounded-lg" />)}
              </div>
            </div>
          ) : technicalSnapshot ? (
            <TechnicalSignalDashboard snapshot={technicalSnapshot} timeframe={timeframe} />
          ) : (
            <div className="py-4 text-center text-sm text-muted-foreground">
              正在加载信号数据...
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
