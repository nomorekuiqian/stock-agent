'use client';

import { useMemo, useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  animate?: boolean;
  isError?: boolean;
}

function hasMarkdown(text: string): boolean {
  return /(?:^#{1,6}\s|[*_]{1,2}\S|\n[-*]\s|\n\d+\.\s|\|.+\||\n>|\n```|^\s*[-*]\s)/m.test(text);
}

export default function ChatMessage({ role, content, animate = false, isError = false }: ChatMessageProps) {
  const isMarkdown = useMemo(() => role === 'assistant' && hasMarkdown(content), [role, content]);
  const shouldAnimate = animate && !isMarkdown;
  const [animationDone, setAnimationDone] = useState(!shouldAnimate);

  const chars = useMemo(() => {
    if (!shouldAnimate || role !== 'assistant') return [];
    return content.split('');
  }, [content, shouldAnimate, role]);

  useEffect(() => {
    if (!shouldAnimate || role !== 'assistant') return;
    const totalDuration = chars.length * 15 + 350;
    const timer = setTimeout(() => setAnimationDone(true), totalDuration);
    return () => clearTimeout(timer);
  }, [shouldAnimate, role, chars.length]);

  // User message
  if (role === 'user') {
    return (
      <div className="flex justify-end animate-msg-enter py-3">
        <div className="max-w-[85%] rounded-2xl bg-muted px-4 py-2.5 text-sm text-foreground leading-relaxed border border-border/40">
          {content}
        </div>
      </div>
    );
  }

  // AI message
  return (
    <div className="animate-msg-enter py-3">
      <div className="flex items-start gap-2 sm:gap-3">
        {/* AI avatar */}
        <div className="shrink-0 w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mt-0.5">
          <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" viewBox="0 0 32 32" fill="none">
            <path
              d="M4 24V12L10 6V24M10 6L16 14L22 6M22 6V24M28 24V12L22 6"
              stroke="url(#msg-avatar-grad)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <defs>
              <linearGradient id="msg-avatar-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#10B981" />
                <stop offset="100%" stopColor="#6EE7B7" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        {/* Message content */}
        <div className={`flex-1 min-w-0 rounded-2xl rounded-tl-sm border px-4 py-3 text-sm leading-relaxed ${
          isError
            ? 'border-red-500/20 bg-red-500/5 text-red-600 dark:text-red-300'
            : 'border-border/60 bg-card text-foreground'
        }`}>
          {isError && <p>{content}</p>}

          {!isError && shouldAnimate && !animationDone ? (
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
          ) : !isError && isMarkdown ? (
            <div className={`prose prose-sm max-w-none dark:prose-invert
              prose-headings:text-foreground prose-headings:font-medium prose-headings:mt-3 prose-headings:mb-1.5
              prose-p:text-inherit prose-p:my-1.5 prose-p:leading-relaxed
              prose-strong:text-foreground prose-strong:font-medium
              prose-ul:my-1.5 prose-li:my-0.5 prose-li:text-inherit
              prose-ol:my-1.5
              prose-code:text-primary prose-code:font-normal prose-code:before:content-none prose-code:after:content-none
              prose-a:text-primary prose-a:no-underline hover:prose-a:underline
              prose-blockquote:border-l-primary/50 prose-blockquote:text-muted-foreground prose-blockquote:not-italic
              prose-table:text-xs
              prose-th:text-foreground prose-th:font-medium prose-th:pb-2 prose-th:border-b prose-th:border-border
              prose-td:py-1.5 prose-td:text-inherit prose-td:border-b prose-td:border-border/50
              ${animate ? 'animate-fade-in' : ''}`}
            >
              <ReactMarkdown>{content}</ReactMarkdown>
            </div>
          ) : !isError ? (
            content
          ) : null}
        </div>
      </div>
    </div>
  );
}
