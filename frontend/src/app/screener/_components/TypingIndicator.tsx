'use client';

/**
 * TypingIndicator - 3-dot bounce animation shown while AI is thinking.
 * Matches the AI message bubble styling for visual consistency.
 */
export default function TypingIndicator() {
  return (
    <div className="flex items-start gap-3 animate-msg-enter">
      {/* AI avatar */}
      <div className="shrink-0 w-7 h-7 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
        <svg className="w-3.5 h-3.5 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
        </svg>
      </div>

      {/* Bubble with dots */}
      <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-zinc-800/60 border border-border/30">
        <div className="flex items-center gap-1.5">
          <span className="typing-dot w-1.5 h-1.5 rounded-full bg-emerald-500/60" />
          <span className="typing-dot w-1.5 h-1.5 rounded-full bg-emerald-500/60" />
          <span className="typing-dot w-1.5 h-1.5 rounded-full bg-emerald-500/60" />
        </div>
      </div>
    </div>
  );
}
