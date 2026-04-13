'use client';

import { useState, useRef, useEffect } from 'react';

interface ChatInputProps {
  onSubmit: (message: string) => void;
  loading?: boolean;
  onCancel?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export default function ChatInput({
  onSubmit,
  loading = false,
  onCancel,
  placeholder = '描述你想找的股票...',
  autoFocus = false,
}: ChatInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const hasValue = value.trim().length > 0;

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
    if (!msg || loading) return;
    onSubmit(msg);
    setValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="relative flex w-full flex-col gap-2 rounded-2xl border border-border bg-card p-2.5 outline-none">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={loading}
        rows={1}
        className="max-h-32 min-h-10 w-full resize-none bg-transparent px-2 py-1 text-sm text-foreground outline-none focus-visible:outline-none placeholder:text-muted-foreground/60"
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
                : 'bg-muted text-muted-foreground/60 cursor-default'
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
  );
}
