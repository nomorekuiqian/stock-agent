'use client';

import ChatInput from './ChatInput';

/** Welcome chip options - hardcoded for zero-latency first screen */
const WELCOME_OPTIONS = [
  { label: '稳健收息', value: '稳健收息' },
  { label: '高成长潜力', value: '高成长潜力' },
  { label: '被低估的好公司', value: '被低估的好公司' },
  { label: '跟着趋势走', value: '跟着趋势走' },
  { label: '我有具体想法', value: '__focus_input__' },
];

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
  const handleChipClick = (value: string) => {
    if (value === '__focus_input__') {
      // Focus the input instead of sending
      const input = document.querySelector<HTMLTextAreaElement>('.welcome-input textarea');
      input?.focus();
      return;
    }
    onSelect(value);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] px-4 py-12">
      <div className="w-full max-w-lg space-y-8 text-center">
        {/* Emerald icon with breathing glow */}
        <div className="flex justify-center">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center animate-emerald-breathe animate-fade-in-up">
            <svg className="w-7 h-7 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
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
          <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
            {universeSize
              ? `从 ${universeSize.toLocaleString()}+ 只美股中，AI 帮你挑选`
              : 'AI 帮你从美股中挑选适合的投资标的'
            }
          </p>
        </div>

        {/* Chips */}
        <div className="flex flex-wrap justify-center gap-2.5 animate-fade-in-up delay-200">
          {WELCOME_OPTIONS.map((opt, i) => (
            <button
              key={opt.value}
              onClick={() => handleChipClick(opt.value)}
              className="animate-chip-enter px-4 py-2 rounded-full text-sm border border-border/40 bg-zinc-800/40 text-zinc-300 hover:border-emerald-500/30 hover:text-emerald-400 hover:bg-emerald-500/5 active:scale-95 transition-all duration-200 cursor-pointer"
              style={{ animationDelay: `${300 + i * 60}ms` }}
            >
              {opt.label}
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
        <p className="text-xs text-zinc-600 animate-fade-in delay-700">
          点击上方选项或输入你的想法，AI 会引导你一步步找到心仪的股票
        </p>
      </div>
    </div>
  );
}
