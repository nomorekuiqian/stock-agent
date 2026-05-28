'use client';

import { useMemo, useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';

import type { KolPersonaChunk } from '@/lib/api';

/**
 * Inline "Thinking..." line that ChatGPT-style swaps the latest paragraph
 * of the chain-of-thought stream. Hidden once:
 *   - the final answer is no longer streaming, OR
 *   - the main answer has started outputting text (token streaming is the
 *     progress indicator from that point on).
 */
function ThinkingLine({
  thinking,
  streaming,
  hasContent,
}: {
  thinking: string | undefined;
  streaming: boolean;
  hasContent: boolean;
}) {
  // Show only while we're still thinking AND haven't started flowing tokens.
  const visible = streaming && !hasContent && !!thinking?.trim();
  // Extract the most recent paragraph as the displayed status line.
  const latest = useMemo(() => {
    if (!thinking) return '';
    const parts = thinking.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    return parts[parts.length - 1] || '';
  }, [thinking]);

  // Animation key — when latest paragraph changes, remount triggers fade.
  const swapKey = useRef(0);
  const prevLatest = useRef(latest);
  if (prevLatest.current !== latest) {
    swapKey.current += 1;
    prevLatest.current = latest;
  }

  if (!visible) return null;

  return (
    <div className="flex items-start gap-2 text-xs text-muted-foreground/85">
      <span className="mt-0.5 flex shrink-0 items-center gap-1">
        <span className="thinking-dot" />
        <span className="thinking-dot" />
        <span className="thinking-dot" />
      </span>
      <span
        key={swapKey.current}
        className="animate-fade-in line-clamp-2 italic"
      >
        {latest}
      </span>
    </div>
  );
}

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  animate?: boolean;
  isError?: boolean;
  /** Streaming flag — disables char-by-char animation, appends caret. */
  streaming?: boolean;
  /** Chain-of-thought text accumulated during streaming (KOL agent). */
  thinking?: string;
  /** Optional citation chunks. If provided, [#N] inline refs become clickable. */
  citations?: KolPersonaChunk[];
}

function hasMarkdown(text: string): boolean {
  return /(?:^#{1,6}\s|[*_]{1,2}\S|\n[-*]\s|\n\d+\.\s|\|.+\||\n>|\n```|^\s*[-*]\s)/m.test(text);
}

/**
 * Convert "[#3]" patterns in markdown text into clickable links that open the
 * matching citation's URL in a new tab. We rewrite the markdown BEFORE feeding
 * it to ReactMarkdown so that the existing prose-a styling applies.
 *
 * When a [#N] reference has NO matching url (chunk missing or url empty),
 * we strip the marker entirely to avoid leaving "broken" plain-text [#N]
 * residue in the rendered answer. Also collapses any whitespace left behind.
 */
export function annotateCitations(text: string, citations: KolPersonaChunk[] | undefined): string {
  const byIndex = new Map<number, KolPersonaChunk>();
  if (citations) {
    for (const c of citations) byIndex.set(c.citation_index, c);
  }
  // Replace all [#N] occurrences. Capture any leading whitespace so we drop
  // it along with the marker (avoids "...X .Y" double-space artifacts).
  let out = text.replace(/(\s?)\[#(\d+)\]/g, (_full, lead, n) => {
    const idx = Number(n);
    const chunk = byIndex.get(idx);
    if (chunk?.url) {
      return `${lead}[\\[#${idx}\\]](${chunk.url})`;
    }
    return '';
  });
  // Belt-and-suspenders: catch any chained `[#A][#B]` that the previous pass
  // missed (e.g. when chunk B was kept and A was dropped) and tidy up.
  out = out.replace(/\s+([,，.。;；!！?？])/g, '$1');
  return out;
}

export default function ChatMessage({
  role,
  content,
  animate = false,
  isError = false,
  streaming = false,
  thinking,
  citations,
}: ChatMessageProps) {
  const isMarkdown = useMemo(() => role === 'assistant' && hasMarkdown(content), [role, content]);
  // Skip per-char animation while streaming (delta-driven) or when content is markdown.
  const shouldAnimate = animate && !isMarkdown && !streaming;
  const [animationDone, setAnimationDone] = useState(!shouldAnimate);

  const annotatedContent = useMemo(
    () => annotateCitations(content, citations),
    [content, citations],
  );

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
        <div className="flex-1 min-w-0 space-y-2">
          {/* Chain-of-thought — single-line swap (only while streaming, hidden once content starts or final lands).
              We split accumulated thinking text by paragraph and only show the
              latest paragraph, so the UI feels like a status line replacing
              itself (ChatGPT-style), not a growing log. */}
          <ThinkingLine thinking={thinking} streaming={streaming} hasContent={!!content} />

          <div className={`rounded-2xl rounded-tl-sm border px-4 py-3 text-sm leading-relaxed ${
            isError
              ? 'border-red-500/20 bg-red-500/5 text-red-600 dark:text-red-300'
              : 'border-border/60 bg-card text-foreground'
          }`}>
            {isError && <p>{content}</p>}

            {!isError && !content ? (
              <div className="flex items-center gap-1 py-0.5">
                <span className="thinking-dot" />
                <span className="thinking-dot" />
                <span className="thinking-dot" />
              </div>
            ) : !isError && shouldAnimate && !animationDone ? (
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
            ) : !isError && (isMarkdown || streaming) ? (
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
                <ReactMarkdown
                  components={{
                    // All markdown links open in a new tab so the chat session
                    // is preserved (citation links to original tweets, etc.).
                    a: ({ node: _node, ...props }) => (
                      <a {...props} target="_blank" rel="noopener noreferrer" />
                    ),
                  }}
                >
                  {annotatedContent}
                </ReactMarkdown>
                {streaming && (
                  <span className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 animate-pulse bg-primary/70 align-baseline" />
                )}
              </div>
            ) : !isError ? (
              <span>
                {content}
                {streaming && (
                  <span className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 animate-pulse bg-primary/70 align-baseline" />
                )}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
