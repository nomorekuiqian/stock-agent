'use client';

/**
 * TypingIndicator - 3-dot bounce animation shown while AI is thinking.
 * Matches the AI message bubble styling for visual consistency.
 */
export default function TypingIndicator() {
  return (
    <div className="flex items-start gap-3 animate-msg-enter">
      {/* AI avatar — brand "M" mark */}
      <div className="shrink-0 w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
        <svg className="w-4 h-4" viewBox="0 0 32 32" fill="none">
          <path
            d="M4 24V12L10 6V24M10 6L16 14L22 6M22 6V24M28 24V12L22 6"
            stroke="url(#typing-avatar-grad)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <defs>
            <linearGradient id="typing-avatar-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#10B981" />
              <stop offset="100%" stopColor="#6EE7B7" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* Bubble with dots */}
      <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-card border border-border/50">
        <div className="flex items-center gap-1.5">
          <span className="typing-dot w-1.5 h-1.5 rounded-full bg-primary/60" />
          <span className="typing-dot w-1.5 h-1.5 rounded-full bg-primary/60" />
          <span className="typing-dot w-1.5 h-1.5 rounded-full bg-primary/60" />
        </div>
      </div>
    </div>
  );
}
