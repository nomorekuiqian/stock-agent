'use client';

import { useState } from 'react';
import { AnalysisSection } from './shared';
import { SectionCard } from './StockDetailContent';
import { InsiderTradingSection, PriceTargetBar, NewsFeed } from './NewsEnhancements';
import { useNewsFeed, useInsiderTrading } from '@/hooks/queries/use-stock-data';

// =============================================================================
// Types
// =============================================================================

interface NewsAnalysis {
  title: string;
  news_summary: string;
  analyst_activity: string;
  upcoming_catalysts: string;
  sentiment_assessment: string;
}

interface MacroAnalysis {
  title: string;
  macro_impact: string;
  sector_positioning: string;
  market_regime: string;
  outlook_and_risks: string;
}

interface MarketTabProps {
  symbol: string;
  companyName: string;
  // News
  newsAnalysis: NewsAnalysis | null;
  newsLoading: boolean;
  onGenerateNews: () => void;
  onRegenerateNews: () => void;
  // Macro
  macroAnalysis: MacroAnalysis | null;
  macroLoading: boolean;
  onGenerateMacro: () => void;
  onRegenerateMacro: () => void;
}

// =============================================================================
// Sub-tab Switcher
// =============================================================================

type SubTab = 'news' | 'macro';

function SubTabSwitcher({ active, onChange }: {
  active: SubTab;
  onChange: (tab: SubTab) => void;
}) {
  const tabs: { key: SubTab; label: string }[] = [
    { key: 'news', label: '新闻' },
    { key: 'macro', label: '宏观' },
  ];

  return (
    <div className="flex items-center gap-1">
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-1 focus-visible:ring-offset-background ${
              isActive
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                : 'text-muted-foreground hover:text-foreground hover:bg-card/60 border border-transparent'
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

// =============================================================================
// AI Analysis Panels
// =============================================================================

function NewsAnalysisPanel({ symbol, companyName, analysis, loading, onGenerate, onRegenerate }: {
  symbol: string;
  companyName: string;
  analysis: NewsAnalysis | null;
  loading: boolean;
  onGenerate: () => void;
  onRegenerate: () => void;
}) {
  if (!analysis && !loading) {
    return (
      <div className="p-6 text-center">
        <div className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.15em] text-emerald-500/50 mb-3">
          <div className="w-4 h-px bg-emerald-500/25" />
          AI 新闻解读
          <div className="w-4 h-px bg-emerald-500/25" />
        </div>
        <h3 className="font-editorial text-lg text-foreground mb-2">{symbol} 新闻分析</h3>
        <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
          AI 分析 {companyName} 的近期新闻、分析师动态与市场情绪
        </p>
        <button
          onClick={onGenerate}
          className="group inline-flex items-center gap-2 px-5 py-2 bg-emerald-500/10 border border-emerald-500/25 rounded-lg
            text-sm font-medium text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/40 transition-all cursor-pointer
            focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:outline-none"
        >
          <span>生成新闻分析</span>
          <svg className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
          </svg>
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-8 text-center">
        <div className="w-6 h-6 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mx-auto mb-3" />
        <p className="text-xs text-muted-foreground">正在分析 {symbol} 新闻...</p>
      </div>
    );
  }

  if (!analysis) return null;

  return (
    <>
      <div className="px-4 py-2.5 border-b border-border/20 bg-card/40 flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">AI 解读</span>
        <button
          onClick={onRegenerate}
          className="text-muted-foreground hover:text-emerald-400 transition-colors p-1 rounded cursor-pointer
            focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:outline-none"
          title="重新生成"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
          </svg>
        </button>
      </div>
      <div className="px-4 py-3">
        {analysis.title && (
          <h3 className="font-editorial text-sm text-foreground leading-snug mb-3">
            {analysis.title}
          </h3>
        )}
        <AnalysisSection label="新闻速递" content={analysis.news_summary} accentColor="emerald" />
        <AnalysisSection label="分析师动态" content={analysis.analyst_activity} accentColor="emerald" />
        <AnalysisSection label="催化事件" content={analysis.upcoming_catalysts} accentColor="emerald" />
        <AnalysisSection label="情绪判断" content={analysis.sentiment_assessment} accentColor="emerald" />
      </div>
    </>
  );
}

function MacroAnalysisPanel({ symbol, companyName, analysis, loading, onGenerate, onRegenerate }: {
  symbol: string;
  companyName: string;
  analysis: MacroAnalysis | null;
  loading: boolean;
  onGenerate: () => void;
  onRegenerate: () => void;
}) {
  if (!analysis && !loading) {
    return (
      <div className="p-6 text-center">
        <div className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.15em] text-emerald-500/50 mb-3">
          <div className="w-4 h-px bg-emerald-500/25" />
          AI 宏观解读
          <div className="w-4 h-px bg-emerald-500/25" />
        </div>
        <h3 className="font-editorial text-lg text-foreground mb-2">{symbol} 宏观分析</h3>
        <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
          AI 分析宏观经济对 {companyName} 的影响与板块定位
        </p>
        <button
          onClick={onGenerate}
          className="group inline-flex items-center gap-2 px-5 py-2 bg-emerald-500/10 border border-emerald-500/25 rounded-lg
            text-sm font-medium text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/40 transition-all cursor-pointer
            focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:outline-none"
        >
          <span>生成宏观分析</span>
          <svg className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
          </svg>
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-8 text-center">
        <div className="w-6 h-6 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mx-auto mb-3" />
        <p className="text-xs text-muted-foreground">正在分析 {symbol} 宏观环境...</p>
      </div>
    );
  }

  if (!analysis) return null;

  return (
    <>
      <div className="px-4 py-2.5 border-b border-border/20 bg-card/40 flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">AI 解读</span>
        <button
          onClick={onRegenerate}
          className="text-muted-foreground hover:text-emerald-400 transition-colors p-1 rounded cursor-pointer
            focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:outline-none"
          title="重新生成"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
          </svg>
        </button>
      </div>
      <div className="px-4 py-3">
        {analysis.title && (
          <h3 className="font-editorial text-sm text-foreground leading-snug mb-3">
            {analysis.title}
          </h3>
        )}
        <AnalysisSection label="宏观影响" content={analysis.macro_impact} accentColor="emerald" />
        <AnalysisSection label="板块定位" content={analysis.sector_positioning} accentColor="emerald" />
        <AnalysisSection label="市场环境" content={analysis.market_regime} accentColor="emerald" />
        <AnalysisSection label="展望与风险" content={analysis.outlook_and_risks} accentColor="emerald" />
      </div>
    </>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function MarketTab({
  symbol,
  companyName,
  newsAnalysis,
  newsLoading,
  onGenerateNews,
  onRegenerateNews,
  macroAnalysis,
  macroLoading,
  onGenerateMacro,
  onRegenerateMacro,
}: MarketTabProps) {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('news');

  // Fetch data for the right panel
  const { data: newsFeed } = useNewsFeed(symbol);
  const { data: insiderData } = useInsiderTrading(symbol);

  return (
    <div className="space-y-5">
      {/* Main Layout: Left AI + Right Data */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">

        {/* ============================================================ */}
        {/* LEFT: AI Analysis                                            */}
        {/* Mobile: second, Desktop: left                                */}
        {/* ============================================================ */}
        <div className="order-2 lg:order-1 lg:sticky lg:top-4">
          <div className="bg-card/50 border border-border/30 rounded-xl overflow-hidden">
            {/* Sub-tab header */}
            <div className="px-4 py-2.5 border-b border-border/20 bg-card/40 flex items-center justify-between">
              <SubTabSwitcher active={activeSubTab} onChange={setActiveSubTab} />
            </div>

            {/* Content based on active sub-tab */}
            {activeSubTab === 'news' ? (
              <NewsAnalysisPanel
                symbol={symbol}
                companyName={companyName}
                analysis={newsAnalysis}
                loading={newsLoading}
                onGenerate={onGenerateNews}
                onRegenerate={onRegenerateNews}
              />
            ) : (
              <MacroAnalysisPanel
                symbol={symbol}
                companyName={companyName}
                analysis={macroAnalysis}
                loading={macroLoading}
                onGenerate={onGenerateMacro}
                onRegenerate={onRegenerateMacro}
              />
            )}
          </div>
        </div>

        {/* ============================================================ */}
        {/* RIGHT: Market Data                                           */}
        {/* Mobile: first, Desktop: right                                */}
        {/* ============================================================ */}
        <div className="order-1 lg:order-2 space-y-5">
          {/* Insider Trading */}
          {insiderData?.trades && insiderData.trades.length > 0 && (
            <SectionCard title="内部人交易" titleEn="Insider Trading" numberLabel="01">
              <InsiderTradingSection trades={insiderData.trades} />
            </SectionCard>
          )}

          {/* Price Target */}
          <PriceTargetBar consensus={null} currentPrice={0} />

          {/* News Feed */}
          {newsFeed?.news && newsFeed.news.length > 0 && (
            <SectionCard title="相关新闻" titleEn="News Feed" numberLabel="02">
              <NewsFeed articles={newsFeed.news} />
            </SectionCard>
          )}

          {/* Empty state when no data loaded yet */}
          {!insiderData?.trades && !newsFeed?.news && (
            <div className="bg-card/50 border border-border/30 rounded-xl p-8 text-center">
              <div className="w-6 h-6 border-2 border-border/40 border-t-muted-foreground rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">正在加载市场数据...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
