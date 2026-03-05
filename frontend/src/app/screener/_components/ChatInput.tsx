'use client';

import { useState, useRef, useEffect } from 'react';

interface ChatInputProps {
  onSubmit: (message: string) => void;
  loading?: boolean;
  placeholder?: string;
  /** Auto-focus the input */
  autoFocus?: boolean;
}

/**
 * ChatInput - Bottom input with emerald send button.
 *
 * Features:
 * - Enter to send, Shift+Enter for newline
 * - Send button glows when input has text
 * - Disabled state during loading
 * - Auto-resizing textarea
 */
export default function ChatInput({
  onSubmit,
  loading = false,
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

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [value]);

  const handleSubmit = () => {
    const msg = value.trim();
    if (!msg || loading) return;
    onSubmit(msg);
    setValue('');
    // Reset height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="relative flex items-end gap-2 p-2 rounded-2xl bg-card/80 border border-border/50 transition-colors focus-within:border-emerald-500/40">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={loading}
        rows={1}
        className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 resize-none outline-none px-2 py-1.5 max-h-[120px]"
      />
      <button
        onClick={handleSubmit}
        disabled={!hasValue || loading}
        className={`
          shrink-0 w-8 h-8 rounded-xl flex items-center justify-center
          transition-all duration-200
          ${hasValue && !loading
            ? 'bg-emerald-600 dark:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-500 dark:hover:bg-emerald-400 active:scale-95'
            : 'bg-muted text-muted-foreground/50 cursor-default'
          }
        `}
      >
        {loading ? (
          <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />
        ) : (
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        )}
      </button>
    </div>
  );
}
