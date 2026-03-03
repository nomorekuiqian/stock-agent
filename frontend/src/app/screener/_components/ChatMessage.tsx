'use client';

import { useMemo, useState, useEffect } from 'react';

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  /** Whether to play word-by-word animation (only for newest AI message) */
  animate?: boolean;
  /** Whether this message represents an error */
  isError?: boolean;
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
  const [animationDone, setAnimationDone] = useState(!animate);

  // Split content into characters for animation
  const chars = useMemo(() => {
    if (!animate || role !== 'assistant') return [];
    return content.split('');
  }, [content, animate, role]);

  // Mark animation complete after all characters have appeared
  useEffect(() => {
    if (!animate || role !== 'assistant') return;
    const totalDuration = chars.length * 15 + 350; // delay per char + animation duration
    const timer = setTimeout(() => setAnimationDone(true), totalDuration);
    return () => clearTimeout(timer);
  }, [animate, role, chars.length]);

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
        <svg className="w-3.5 h-3.5 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
        </svg>
      </div>

      {/* Message bubble */}
      <div className={`max-w-[85%] px-4 py-3 rounded-2xl rounded-tl-sm text-sm leading-relaxed ${
        isError
          ? 'bg-red-500/10 border border-red-500/20 text-red-300'
          : 'bg-zinc-800/60 border border-border/30 text-zinc-200'
      }`}>
        {animate && !animationDone ? (
          // Word-by-word animation
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
        ) : (
          // Static text (after animation or for old messages)
          content
        )}
      </div>
    </div>
  );
}
