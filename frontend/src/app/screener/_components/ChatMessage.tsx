'use client';

import { useMemo, useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  /** Whether to play word-by-word animation (only for newest AI message) */
  animate?: boolean;
  /** Whether this message represents an error */
  isError?: boolean;
}

/** Check if content contains markdown syntax worth rendering */
function hasMarkdown(text: string): boolean {
  return /(?:^#{1,6}\s|[*_]{1,2}\S|\n[-*]\s|\n\d+\.\s|\|.+\||\n>|\n```|^\s*[-*]\s)/m.test(text);
}

/**
 * ChatMessage - Single message bubble with premium word-by-word animation.
 *
 * AI messages: left-aligned, glass background, emerald accent.
 * User messages: right-aligned, emerald gradient.
 *
 * Word-by-word animation splits Chinese text by character and applies
 * staggered fade-in with blur effect for a "materializing from fog" feel.
 */
export default function ChatMessage({ role, content, animate = false, isError = false }: ChatMessageProps) {
  const isMarkdown = useMemo(() => role === 'assistant' && hasMarkdown(content), [role, content]);

  // Skip char-by-char animation for markdown content (symbols like ** ## look bad mid-animation)
  const shouldAnimate = animate && !isMarkdown;
  const [animationDone, setAnimationDone] = useState(!shouldAnimate);

  // Split content into characters for animation
  const chars = useMemo(() => {
    if (!shouldAnimate || role !== 'assistant') return [];
    return content.split('');
  }, [content, shouldAnimate, role]);

  // Mark animation complete after all characters have appeared
  useEffect(() => {
    if (!shouldAnimate || role !== 'assistant') return;
    const totalDuration = chars.length * 15 + 350; // delay per char + animation duration
    const timer = setTimeout(() => setAnimationDone(true), totalDuration);
    return () => clearTimeout(timer);
  }, [shouldAnimate, role, chars.length]);

  if (role === 'user') {
    return (
      <div className="flex justify-end animate-msg-enter">
        <div className="max-w-[80%] px-4 py-2.5 rounded-2xl rounded-tr-sm bg-emerald-600 text-white text-sm leading-relaxed">
          {content}
        </div>
      </div>
    );
  }

  // AI message
  return (
    <div className="flex items-start gap-3 animate-msg-enter">
      {/* AI avatar */}
      <div className="shrink-0 w-7 h-7 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mt-0.5">
        <svg className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
        </svg>
      </div>

      {/* Message bubble */}
      <div className={`max-w-[85%] px-4 py-3 rounded-2xl rounded-tl-sm text-sm leading-relaxed ${
        isError
          ? 'bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-300'
          : 'bg-card border border-border/50 text-foreground/90'
      }`}>
        {shouldAnimate && !animationDone ? (
          // Word-by-word animation (plain text only)
          <span>
            {chars.map((char, i) => (
              <span
                key={i}
                className="animate-word inline"
                style={{ animationDelay: `${i * 15}ms` }}
              >
                {char}
              </span>
            ))}
          </span>
        ) : isMarkdown ? (
          // Markdown rendering with prose styling
          <div className={`prose prose-sm max-w-none dark:prose-invert
            prose-headings:text-foreground prose-headings:font-medium prose-headings:mt-3 prose-headings:mb-1.5
            prose-p:text-inherit prose-p:my-1.5 prose-p:leading-relaxed
            prose-strong:text-foreground prose-strong:font-medium
            prose-ul:my-1.5 prose-li:my-0.5 prose-li:text-inherit
            prose-ol:my-1.5
            prose-code:text-emerald-600 dark:prose-code:text-emerald-400 prose-code:font-normal prose-code:before:content-none prose-code:after:content-none
            prose-blockquote:border-l-emerald-500/50 prose-blockquote:text-muted-foreground prose-blockquote:not-italic
            prose-table:text-xs
            prose-th:text-foreground prose-th:font-medium prose-th:pb-2 prose-th:border-b prose-th:border-border
            prose-td:py-1.5 prose-td:text-inherit prose-td:border-b prose-td:border-border/30
            ${animate ? 'animate-fade-in' : ''}`}
          >
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        ) : (
          // Static plain text
          content
        )}
      </div>
    </div>
  );
}
