'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface QuotaInfo {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
  unlimited: boolean;
}

interface ChatInputProps {
  onSubmit: (message: string) => void;
  loading?: boolean;
  onCancel?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  quota?: QuotaInfo | null;
}

export default function ChatInput({
  onSubmit,
  loading = false,
  onCancel,
  placeholder = '描述你想找的股票...',
  autoFocus = false,
  quota,
}: ChatInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isComposingRef = useRef(false);

  const hasValue = value.trim().length > 0;
  const quotaExhausted = quota && !quota.unlimited && !quota.allowed;

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [value]);

  const handleSubmit = () => {
    const msg = value.trim();
    if (!msg || loading || quotaExhausted) return;
    onSubmit(msg);
    setValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true;
  }, []);

  const handleCompositionEnd = useCallback(() => {
    // Chrome/macOS: compositionend fires BEFORE keydown for the Enter that
    // confirms IME selection. Delay clearing so the subsequent keydown is
    // still suppressed.
    setTimeout(() => { isComposingRef.current = false; }, 0);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isComposingRef.current || e.nativeEvent.isComposing) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  if (quotaExhausted) {
    return (
      <div className="relative flex w-full flex-col gap-2">
        <div className="rounded-2xl border border-primary/20 bg-primary/[0.03] p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                今日 {quota.limit} 次免费提问已用完
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                升级 Max 解锁无限提问、AI 深度个股分析等全部功能
              </p>
            </div>
            <a
              href="/pricing"
              className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              升级 Max
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex w-full flex-col gap-2">
      <div className="relative flex w-full flex-col gap-2 rounded-2xl border border-border bg-card p-2.5 outline-none">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          placeholder={placeholder}
          disabled={loading}
          rows={1}
          className="max-h-32 min-h-10 w-full resize-none bg-transparent px-2 py-1 text-sm text-foreground outline-none focus-visible:outline-none placeholder:text-muted-foreground/70"
          aria-label="消息输入"
        />
        <div className="flex items-center justify-end">
          {loading && onCancel ? (
            <button
              onClick={onCancel}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/90 active:scale-95"
              aria-label="停止生成"
            >
              <svg className="w-3 h-3 fill-current" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="1" />
              </svg>
            </button>
          ) : loading ? (
            <div className="flex h-8 w-8 items-center justify-center">
              <div className="w-4 h-4 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
            </div>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!hasValue}
              className={`flex h-8 w-8 items-center justify-center rounded-full transition-all duration-150 ${
                hasValue
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-md hover:shadow-primary/20 active:scale-90 active:shadow-none'
                  : 'bg-muted text-muted-foreground/70 cursor-default'
              }`}
              aria-label="发送消息"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            </button>
          )}
        </div>
      </div>
      {quota && !quota.unlimited && (
        <div className="px-1 text-xs text-muted-foreground/70">
          <span>今日剩余 {quota.remaining} 次</span>
        </div>
      )}
    </div>
  );
}
