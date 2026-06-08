'use client';

import { memo, useMemo, useState, useEffect } from 'react';
import { Copy, Check } from 'lucide-react';

import MarkdownBody from '@/components/MarkdownBody';
import type { KolPersonaChunk } from '@/lib/api';
import AssistantAvatar from './AssistantAvatar';

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

  if (!visible) return null;

  return (
    <div className="text-xs text-muted-foreground/80">
      <span
        key={latest}
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
  /** When set, AI avatar swaps from the brand mark to the persona's avatar. */
  personaUsername?: string | null;
}

function hasMarkdown(text: string): boolean {
  return /(?:^#{1,6}\s|[*_]{1,2}\S|\n[-*]\s|\n\d+\.\s|^\s*\|.+\|\s*$|\n>|\n```|^\s*[-*]\s)/m.test(text);
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

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard unavailable */
        }
      }}
      aria-label="复制回答"
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground/70 transition-colors hover:bg-muted/60 hover:text-foreground"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? '已复制' : '复制'}
    </button>
  );
}

function ChatMessage({
  role,
  content,
  animate = false,
  isError = false,
  streaming = false,
  thinking,
  citations,
  personaUsername,
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

  // AI message — blockless layout. The avatar column carries a vertical hair-
  // line that stretches the full height of the response, giving the eye a
  // clear "this is one AI turn" boundary without dropping a heavy card
  // around content that often contains its own (table / blockquote) blocks.
  return (
    <div className="group animate-msg-enter py-3">
      <div className="flex gap-2 sm:gap-3">
        {/* Avatar column: avatar + a hairline rail beneath that auto-stretches. */}
        <div className="flex flex-col items-center shrink-0">
          <AssistantAvatar personaUsername={personaUsername} gradientIdSuffix="msg" />
          <div aria-hidden className="flex-1 w-px bg-border/50 mt-1.5 min-h-2" />
        </div>

        {/* Message content */}
        <div className="flex-1 min-w-0 space-y-2 pt-0.5">
          {/* Chain-of-thought — single-line swap (only while streaming, hidden once content starts or final lands).
              We split accumulated thinking text by paragraph and only show the
              latest paragraph, so the UI feels like a status line replacing
              itself (ChatGPT-style), not a growing log. */}
          <ThinkingLine thinking={thinking} streaming={streaming} hasContent={!!content} />

          {/* Error is the one case that still uses a contained block — error
              boundary needs to read as a discrete state, not flow into the page. */}
          {isError ? (
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm leading-relaxed text-red-600 dark:text-red-300">
              {content}
            </div>
          ) : !content ? (
            !thinking?.trim() ? (
              <div className="py-0.5 text-sm italic text-muted-foreground/70 animate-pulse-subtle">正在思考…</div>
            ) : null
          ) : shouldAnimate && !animationDone ? (
            <div className="text-sm leading-relaxed text-foreground">
              {chars.map((char, i) => (
                <span
                  key={i}
                  className="animate-word inline"
                  style={{ animationDelay: `${i * 15}ms` }}
                >
                  {char}
                </span>
              ))}
            </div>
          ) : (isMarkdown || streaming) ? (
            <div className={`prose prose-sm max-w-none dark:prose-invert text-sm leading-relaxed text-foreground
              prose-headings:text-foreground prose-headings:font-semibold prose-headings:mt-4 prose-headings:mb-2
              prose-h1:text-base prose-h2:text-base prose-h3:text-sm prose-h4:text-sm
              prose-p:text-inherit prose-p:my-2 prose-p:leading-relaxed
              prose-strong:text-foreground prose-strong:font-semibold
              prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-li:text-inherit
              [&_li_p]:my-0
              ${animate ? 'animate-fade-in' : ''}`}
            >
              <MarkdownBody>{annotatedContent}</MarkdownBody>
              {streaming && (
                <span className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 chat-caret bg-primary/70 align-baseline" />
              )}
            </div>
          ) : (
            <div className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
              {content}
              {streaming && (
                <span className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 chat-caret bg-primary/70 align-baseline" />
              )}
            </div>
          )}

          {/* Hover action row — copy the answer (ChatGPT-style). */}
          {!streaming && !isError && !!content && (
            <div className="opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              <CopyButton text={content} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* Memoized: during streaming only the active (changing) message re-renders;
   the rest of the transcript is skipped, so per-token cost stops scaling with
   conversation length. */
export default memo(ChatMessage);
