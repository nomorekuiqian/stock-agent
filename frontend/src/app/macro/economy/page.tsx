'use client';

import { useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { MacroPageHeader } from '@/components/MacroPageHeader';
import type { SubDimension } from '@/lib/api';
import { useEconomicFundamentals } from '@/hooks/queries/use-macro-data';
import { useWeeklyReport } from '@/hooks/queries/use-weekly-report';
import { queryKeys } from '@/hooks/queries/query-keys';
import { InsightBanner } from '@/components/InsightBanner';
import { formatTimestamp } from '@/lib/timezone';
import {
  HERO_CONFIG,
  SECONDARY_FORMAT,
  SUB_DIM_NAMES,
  findIndicator,
  getColorClass,
  DeepDiveSection,
} from './components';

// ---------------------------------------------------------------------------
// Page-local components
// ---------------------------------------------------------------------------

function HeroCardSkeleton({ index }: { index: number }) {
  return (
    <div
      className="bg-card rounded-2xl border border-border/50 p-3 sm:p-5"
      style={{ animationDelay: `${index * 100}ms` }}
    >
      <div className="animate-pulse">
        <div className="h-3 w-12 bg-muted rounded mb-3" />
        <div className="h-10 w-28 bg-muted rounded mb-2" />
        <div className="h-3 w-24 bg-muted rounded mb-3" />
        <div className="h-px bg-border my-3" />
        <div className="h-3 w-32 bg-muted rounded" />
      </div>
    </div>
  );
}

function HeroCard({
  dim,
  index,
  selected,
  onSelect,
}: {
  dim: SubDimension;
  index: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const config = HERO_CONFIG[dim.name];
  if (!config) return null;

  const primaryInd = findIndicator(dim, config.primary);
  const secondaryInd = findIndicator(dim, config.secondary);

  const formatted = primaryInd ? config.format(primaryInd) : 'N/A';
  const interpretation = primaryInd ? config.interpret(primaryInd) : { color: 'amber' };

  const secConfig = SECONDARY_FORMAT[config.secondary];
  const secFormatted = secondaryInd && secConfig ? secConfig.format(secondaryInd) : null;

  const accentColor = interpretation.color;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`
        group relative rounded-2xl p-3 sm:p-5 flex flex-col text-left
        transition-all duration-300 ease-out cursor-pointer
        ${selected
          ? 'bg-card border-2 translate-y-[-3px]'
          : 'bg-card/60 border border-border/40 hover:bg-card hover:border-border/60 hover:translate-y-[-2px]'
        }
        ${selected
          ? accentColor === 'emerald' ? 'border-emerald-500' :
            accentColor === 'amber' ? 'border-amber-500' :
            'border-red-500'
          : ''
        }
      `}
      style={{
        boxShadow: selected
          ? accentColor === 'emerald' ? '0 8px 32px rgba(16,185,129,0.15), 0 0 0 1px rgba(16,185,129,0.1)' :
            accentColor === 'amber' ? '0 8px 32px rgba(245,158,11,0.15), 0 0 0 1px rgba(245,158,11,0.1)' :
            '0 8px 32px rgba(239,68,68,0.15), 0 0 0 1px rgba(239,68,68,0.1)'
          : undefined,
        animationDelay: `${index * 120}ms`,
      }}
    >
      <div className="mb-2 sm:mb-3">
        <span className="text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground">
          {SUB_DIM_NAMES[dim.name] || dim.name_zh}
        </span>
      </div>

      <div className="mb-1">
        <span className={`text-2xl sm:text-data-hero font-bold font-data tracking-tighter leading-tight transition-colors duration-300 ${
          selected ? getColorClass(accentColor) : 'text-foreground group-hover:text-foreground'
        }`}>
          {formatted}
        </span>
      </div>

      <p className="text-xs text-muted-foreground mb-3">{config.label}</p>

      <div className="h-px bg-border/50 mb-3 mt-auto" />

      {secConfig && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{secConfig.label}</span>
          <span className="font-data font-medium text-foreground">{secFormatted || 'N/A'}</span>
        </div>
      )}

      <div className={`absolute inset-x-0 bottom-2 flex justify-center transition-opacity duration-200 ${
        selected ? 'opacity-0' : 'opacity-0 group-hover:opacity-100'
      }`}>
        <span className="text-micro text-muted-foreground bg-background/80 px-2 py-0.5 rounded-full">
          点击查看详情
        </span>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function EconomyPage() {
  const [theme] = useState<'light' | 'dark'>('dark');
  const [selectedDim, setSelectedDim] = useState<string>('growth');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    return () => {
      if (transitionTimer.current) clearTimeout(transitionTimer.current);
    };
  }, []);

  const { data: econResponse, isLoading: loading, error: econError } = useEconomicFundamentals();
  const { data: weeklyResponse, isLoading: weeklyLoading } = useWeeklyReport();

  const data = econResponse?.success ? econResponse.data : null;
  const lastUpdated = econResponse?.timestamp ?? null;
  const error = econError ? (econError instanceof Error ? econError.message : 'Failed to fetch data') : null;
  const weeklyReport = weeklyResponse?.success ? weeklyResponse.data : null;

  const growthDim = data?.sub_dimensions.find((d) => d.name === 'growth');
  const employmentDim = data?.sub_dimensions.find((d) => d.name === 'employment');
  const creditDim = data?.sub_dimensions.find((d) => d.name === 'credit');
  const orderedDims = [growthDim, employmentDim, creditDim].filter((d): d is SubDimension => d != null);

  return (
    <main className="min-h-screen bg-background">
      <MacroPageHeader
        section="Economy"
        title="经济基本面"
        question="经济是在变好还是变差?"
        lastUpdated={lastUpdated ? formatTimestamp(lastUpdated) : null}
        loading={loading}
        onRefresh={() => queryClient.invalidateQueries({ queryKey: queryKeys.macro.economy() })}
      />

      {error && (
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-4">
          <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
            {error}
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 space-y-8">
        <section>
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            {loading ? (
              [0, 1, 2].map((i) => <HeroCardSkeleton key={i} index={i} />)
            ) : (
              orderedDims.map((dim, i) => (
                <HeroCard
                  key={dim.name}
                  dim={dim}
                  index={i}
                  selected={selectedDim === dim.name}
                  onSelect={() => {
                    if (selectedDim === dim.name) return;
                    setIsTransitioning(true);
                    if (transitionTimer.current) clearTimeout(transitionTimer.current);
                    transitionTimer.current = setTimeout(() => {
                      setSelectedDim(dim.name);
                      setIsTransitioning(false);
                      transitionTimer.current = null;
                    }, 200);
                  }}
                />
              ))
            )}
          </div>
        </section>

        <InsightBanner
          sectionTitle="经济基本面"
          analysis={weeklyReport?.economy_analysis ?? null}
          signalColor={weeklyReport?.signal_lights.economy ?? null}
          weekLabel={weeklyReport?.week_label ?? null}
          loading={weeklyLoading}
        />

        {orderedDims
          .filter((dim) => dim.name === selectedDim)
          .map((dim) => (
            <div
              key={dim.name}
              className={`transition-all duration-300 ease-out ${
                isTransitioning ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'
              }`}
            >
              <DeepDiveSection dim={dim} theme={theme} interval="W" />
            </div>
          ))}

        <section className="text-center py-4">
          <Link
            href="/macro"
            className="group inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors duration-200"
          >
            <svg className="w-4 h-4 transition-transform duration-200 group-hover:-translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
            </svg>
            返回宏观总览
          </Link>
          <p className="mt-3 text-xs text-muted-foreground">
            数据来源{' '}
            <a href="https://fred.stlouisfed.org/" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80 transition-colors">FRED</a>
            {' '}&middot;{' '}图表{' '}
            <a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80 transition-colors">TradingView</a>
          </p>
        </section>
      </div>
    </main>
  );
}
