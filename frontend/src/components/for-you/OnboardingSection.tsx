'use client';

import { useState } from 'react';
import { PORTFOLIO_TEMPLATES, PortfolioTemplate } from '@/lib/portfolio-templates';

interface OnboardingSectionProps {
  onSelectTemplate: (symbols: string[]) => Promise<void>;
  userId: string;
  userEmail?: string;
}

export default function OnboardingSection({
  onSelectTemplate,
}: OnboardingSectionProps) {
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSelectTemplate = async (template: PortfolioTemplate) => {
    setActivatingId(template.id);
    setError(null);
    try {
      await onSelectTemplate(template.symbols);
    } catch (err) {
      setError(err instanceof Error ? err.message : '设置失败，请重试');
      setActivatingId(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-10">
      {/* Hero Text */}
      <div className="text-center mb-10">
        <h2 className="font-editorial text-2xl text-foreground mb-2">
          一键选择，立即获取你的专属分析
        </h2>
        <p className="text-muted-foreground text-sm">
          选择一个投资模板，立刻生成你的首份专属日报
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
          {error}
        </div>
      )}

      {/* Template Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {PORTFOLIO_TEMPLATES.map((template) => {
          const isActivating = activatingId === template.id;
          const isDisabled = activatingId !== null && !isActivating;

          return (
            <button
              key={template.id}
              onClick={() => handleSelectTemplate(template)}
              disabled={activatingId !== null}
              className={`terminal-card p-5 text-left transition-all group ${
                isActivating
                  ? 'border-emerald-500/60 bg-card/80'
                  : isDisabled
                    ? 'opacity-50 pointer-events-none'
                    : 'hover:border-emerald-500/40 hover:bg-card/80'
              }`}
            >
              {isActivating ? (
                <div className="flex flex-col items-center justify-center py-4 gap-3">
                  <div className="w-8 h-8 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 animate-spin" />
                  <p className="text-sm text-emerald-400 font-medium">
                    正在生成你的首份日报...
                  </p>
                </div>
              ) : (
                <>
                  <h3 className="text-base font-medium text-foreground group-hover:text-emerald-400 transition-colors mb-2">
                    {template.name}
                  </h3>
                  <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
                    {template.description}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {template.symbols.slice(0, 5).map((sym) => (
                      <span
                        key={sym}
                        className="px-2 py-0.5 bg-card border border-border/50 rounded text-xs font-data text-muted-foreground"
                      >
                        {sym}
                      </span>
                    ))}
                    {template.symbols.length > 5 && (
                      <span className="px-2 py-0.5 text-xs text-muted-foreground">
                        +{template.symbols.length - 5}
                      </span>
                    )}
                  </div>
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
