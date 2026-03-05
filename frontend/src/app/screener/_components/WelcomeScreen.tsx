'use client';

import { useState } from 'react';
import ChatInput from './ChatInput';

/** All available preset queries, grouped by theme */
const ALL_PRESETS = [
  // Core strategies
  '稳健收息',
  '高成长潜力',
  '被低估的好公司',
  '跟着趋势走',
  // Thematic / sector
  'AI 和芯片相关的股票',
  '新能源和电动车相关股票',
  '医药和生物科技领域的股票',
  '网络安全相关股票',
  // Style / profile
  '自由现金流很强的公司',
  '波动小、比较抗跌的股票',
  '市值小但成长快的黑马股',
  '分析师评级最高的股票',
  // Situational
  '最近跌了很多、可能超跌反弹的股票',
  '连续 10 年以上稳定分红的股票',
  '利润率高、负债又低的优质公司',
  '最近成交量放大、突破均线的股票',
];

const FOCUS_INPUT = '__focus_input__';

/** Pick a random subset of presets, always including core strategies */
function getWelcomeOptions() {
  const core = ALL_PRESETS.slice(0, 4);
  const extended = ALL_PRESETS.slice(4);
  const shuffled = extended.sort(() => Math.random() - 0.5);
  return [...core, ...shuffled.slice(0, 4), FOCUS_INPUT];
}

interface WelcomeScreenProps {
  onSelect: (value: string) => void;
  universeSize?: number;
}

/**
 * WelcomeScreen - Centered initial state with emerald icon, title, chips, and input.
 *
 * Premium feel: breathing emerald glow, staggered chip entry, editorial typography.
 * Transitions out with fade-out-up when user makes first interaction.
 */
export default function WelcomeScreen({ onSelect, universeSize }: WelcomeScreenProps) {
  const [options] = useState(getWelcomeOptions);

  const handleChipClick = (query: string) => {
    if (query === FOCUS_INPUT) {
      const input = document.querySelector<HTMLTextAreaElement>('.welcome-input textarea');
      input?.focus();
      return;
    }
    onSelect(query);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] px-4 py-12">
      <div className="w-full max-w-lg space-y-8 text-center">
        {/* Emerald icon with breathing glow */}
        <div className="flex justify-center">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center animate-fade-in-up">
            <svg className="w-7 h-7 text-emerald-600 dark:text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
        </div>

        {/* Title */}
        <div className="space-y-3 animate-fade-in-up delay-100">
          <h1 className="text-2xl md:text-3xl font-editorial text-foreground tracking-tight">
            找到适合你的投资机会
          </h1>
          <p className="text-sm md:text-base text-muted-foreground leading-relaxed max-w-sm mx-auto">
            {universeSize
              ? `从 ${universeSize.toLocaleString()}+ 只美股中，AI 帮你挑选`
              : 'AI 帮你从美股中挑选适合的投资标的'
            }
          </p>
        </div>

        {/* Chips */}
        <div className="flex flex-wrap justify-center gap-2.5 animate-fade-in-up delay-200">
          {options.map((query, i) => (
            <button
              key={query}
              onClick={() => handleChipClick(query)}
              className="animate-chip-enter px-4 py-2 rounded-full text-sm border border-border/50 bg-card/60 text-muted-foreground hover:border-emerald-500/40 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-500/5 active:scale-95 transition-all duration-200 cursor-pointer"
              style={{ animationDelay: `${300 + i * 60}ms` }}
            >
              {query === FOCUS_INPUT ? '我有具体想法' : query}
            </button>
          ))}
        </div>

        {/* Input */}
        <div className="welcome-input w-full max-w-md mx-auto animate-fade-in-up delay-400">
          <ChatInput
            onSubmit={onSelect}
            placeholder="或者直接描述你想找的股票..."
            autoFocus={false}
          />
        </div>

        {/* Subtle hint */}
        <p className="text-xs text-muted-foreground/60 animate-fade-in delay-700">
          点击上方选项或输入你的想法，AI 会引导你一步步找到心仪的股票
        </p>
      </div>
    </div>
  );
}
