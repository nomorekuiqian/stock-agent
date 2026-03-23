'use client';

import { useState, useRef, useCallback, type KeyboardEvent } from 'react';

interface ScreenerInputProps {
  onSubmit: (message: string) => void;
  loading: boolean;
  disabled?: boolean;
  placeholder?: string;
  roundCount?: number;
  maxRounds?: number;
}

export default function ScreenerInput({
  onSubmit,
  loading,
  disabled = false,
  placeholder,
  roundCount = 0,
  maxRounds = 5,
}: ScreenerInputProps) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const isMaxed = roundCount >= maxRounds;

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || loading || disabled || isMaxed) return;
    onSubmit(trimmed);
    setValue('');
  }, [value, loading, disabled, isMaxed, onSubmit]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  const defaultPlaceholder = roundCount === 0
    ? '或用自然语言描述，例如 "PE<15 ROE>10% 的科技股"'
    : '继续描述，在当前结果上叠加条件...';

  return (
    <div className="space-y-2">
      <div className="relative">
        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/40 pointer-events-none">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
        </div>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isMaxed ? '已达最大对话轮数，请重新开始' : (placeholder || defaultPlaceholder)}
          disabled={loading || disabled || isMaxed}
          className={`
            w-full pl-10 pr-12 py-2.5
            bg-transparent border border-border/30 rounded-lg
            text-sm text-foreground placeholder:text-muted-foreground/40
            focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/40
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-all duration-200
          `}
        />

        {/* Submit button */}
        <button
          onClick={handleSubmit}
          disabled={!value.trim() || loading || disabled || isMaxed}
          className={`
            absolute right-2 top-1/2 -translate-y-1/2
            p-1.5 rounded-lg transition-all duration-200
            ${value.trim() && !loading && !disabled && !isMaxed
              ? 'text-primary hover:bg-primary/10 cursor-pointer'
              : 'text-muted-foreground/30 cursor-not-allowed'
            }
          `}
          aria-label="Send"
        >
          {loading ? (
            <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 12h14" />
            </svg>
          )}
        </button>
      </div>

      {/* Round indicator */}
      {roundCount > 0 && (
        <div className="flex items-center justify-between px-1">
          <p className="text-xs text-muted-foreground/50">
            {isMaxed
              ? '已达最大对话轮数'
              : `对话轮次 ${roundCount}/${maxRounds}`
            }
          </p>
          {isMaxed && (
            <p className="text-xs text-amber-400">
              点击策略卡片或清除条件重新开始
            </p>
          )}
        </div>
      )}
    </div>
  );
}
