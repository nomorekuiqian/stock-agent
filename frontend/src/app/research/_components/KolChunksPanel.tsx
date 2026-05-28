'use client';

import { Fragment, useState } from 'react';
import { ChevronDown, ChevronUp, FileText } from 'lucide-react';

import type { KolPersonaChunk } from '@/lib/api';

interface KolChunksPanelProps {
  chunks: KolPersonaChunk[];
  /** Layout variant: 'inline' is the legacy collapsed footer; 'panel' is the
   *  full-width right-column tweet card list. Default is 'panel'. */
  variant?: 'inline' | 'panel';
}

/**
 * KOL citation panel — Twitter-styled card list of the tweets the agent
 * retrieved during the current turn.
 */
export default function KolChunksPanel({ chunks, variant = 'panel' }: KolChunksPanelProps) {
  if (!chunks || chunks.length === 0) {
    if (variant === 'panel') {
      return (
        <div className="flex h-full flex-col items-center justify-center p-8 text-center">
          <FileText className="mb-3 h-8 w-8 text-muted-foreground/40" strokeWidth={1.4} />
          <p className="font-data text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            原文支持
          </p>
          <p className="mt-2 max-w-xs text-xs leading-relaxed text-muted-foreground/70">
            提问后，AI 检索到的博主历史推文会显示在这里，点击 [#N] 引用可跳到对应卡片。
          </p>
        </div>
      );
    }
    return null;
  }

  if (variant === 'inline') {
    return <InlineFooter chunks={chunks} />;
  }
  return <CardList chunks={chunks} />;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} 小时前`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay} 天前`;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return sameYear
    ? `${d.getMonth() + 1}月${d.getDate()}日`
    : `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

function avatarSrcFor(author: string | null | undefined): string {
  if (!author) return '';
  return `/kol-avatars/${author.toLowerCase()}.png`;
}

/**
 * Linkify tweet text:
 *   - https?:// URLs (incl. https://t.co/...)  → blue clickable link
 *   - @mentions                                → blue link to x.com/handle
 *   - $cashtags ($NVDA, $美光-style)           → blue, no link
 * Returns an array of React nodes (mixed text + anchors).
 *
 * Twitter blue: tailwind sky-500 ≈ #0ea5e9 (close enough to twitter's #1d9bf0
 * for our muted theme). Hover gets underline like twitter.
 */
export function linkifyTweetText(text: string): React.ReactNode[] {
  if (!text) return [];
  // Combined regex: URL | @handle | $cashtag (latin + CJK alnum allowed in cashtags)
  const regex = /(https?:\/\/[^\s一-鿿]+)|(@[A-Za-z0-9_]{1,15})|(\$[A-Za-z]{1,10}(?![A-Za-z0-9]))/g;
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const token = m[0];
    if (m[1]) {
      // URL
      out.push(
        <a
          key={`l-${key++}`}
          href={token}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sky-500 hover:underline"
        >
          {token}
        </a>,
      );
    } else if (m[2]) {
      // @mention
      const handle = token.slice(1);
      out.push(
        <a
          key={`l-${key++}`}
          href={`https://x.com/${handle}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sky-500 hover:underline"
        >
          {token}
        </a>,
      );
    } else if (m[3]) {
      // $cashtag — color but not linked (no canonical target)
      out.push(
        <span key={`l-${key++}`} className="text-sky-500">
          {token}
        </span>,
      );
    }
    last = m.index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out.map((node, i) => <Fragment key={i}>{node}</Fragment>);
}

// ---------------------------------------------------------------------------
// Panel variant — Twitter-styled card list
// ---------------------------------------------------------------------------

function CardList({ chunks }: { chunks: KolPersonaChunk[] }) {
  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border/40 px-4 py-3">
        <p className="font-data text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          原文支持
        </p>
        <p className="mt-1 text-sm text-foreground">
          {chunks.length} 条博主历史推文
        </p>
      </div>
      <ul className="flex-1 divide-y divide-border/40 overflow-y-auto">
        {chunks.map((chunk) => (
          <TweetCard key={`${chunk.source_id}-${chunk.citation_index}`} chunk={chunk} />
        ))}
      </ul>
    </div>
  );
}

/**
 * The vector ingest pipeline (scripts/index_kol_tweets.py::_content_for_tweet)
 * prepends a block of metadata fields (Author / Date / Tweet type / Quality /
 * Tickers / Sectors / Events / Summary) to the embedded content for better
 * recall. We strip those at render time and show only the original tweet text
 * + the quoted tweet (if any).
 */
export function extractTweetBody(raw: string): { original: string; quoted: string } {
  if (!raw) return { original: '', quoted: '' };
  const origMarker = 'Original tweet:';
  const quoteMarker = 'Quoted tweet:';
  const origIdx = raw.indexOf(origMarker);
  // If the marker isn't there, the chunk wasn't built by the standard pipeline.
  // Fall back to raw text so we don't accidentally hide actual content.
  if (origIdx < 0) return { original: raw.trim(), quoted: '' };
  const afterOrig = raw.slice(origIdx + origMarker.length);
  const quoteIdx = afterOrig.indexOf(quoteMarker);
  if (quoteIdx < 0) {
    return { original: afterOrig.trim(), quoted: '' };
  }
  return {
    original: afterOrig.slice(0, quoteIdx).trim(),
    quoted: afterOrig.slice(quoteIdx + quoteMarker.length).trim(),
  };
}

function TweetCard({ chunk }: { chunk: KolPersonaChunk }) {
  const [expanded, setExpanded] = useState(false);

  const { original, quoted } = extractTweetBody(chunk.content || '');
  const combinedLen = original.length + quoted.length;
  const longText = combinedLen > 280;
  const truncate = (text: string, max: number) =>
    text.length > max ? `${text.slice(0, max)}...` : text;
  const shownOriginal = expanded || !longText ? original : truncate(original, 280);
  const shownQuoted = expanded || !longText ? quoted : truncate(quoted, 140);

  const author = chunk.author_username || 'unknown';
  const avatar = avatarSrcFor(chunk.author_username);
  const timestamp = formatRelativeTime(chunk.created_at);

  return (
    <li
      id={`kol-citation-${chunk.citation_index}`}
      className="group relative px-4 py-3 transition hover:bg-muted/30"
    >
      {/* Whole-card click target → opens original tweet (like Twitter's "click anywhere on card") */}
      {chunk.url && (
        <a
          href={chunk.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="打开原推"
          className="absolute inset-0 z-0"
        />
      )}

      <div className="relative z-10 flex gap-3" style={{ fontFamily: '"Twitter Chirp", system-ui, -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif' }}>
        {/* Avatar */}
        <div className="shrink-0">
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatar}
              alt={author}
              className="h-10 w-10 rounded-full bg-muted object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
                (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
              }}
            />
          ) : null}
          <div className="hidden h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-[15px] font-bold text-primary">
            {author.slice(0, 2).toUpperCase()}
          </div>
        </div>

        {/* Main content */}
        <div className="min-w-0 flex-1">
          {/* Header: display name + @handle + relative time, all on one line */}
          <div className="flex flex-wrap items-baseline gap-x-1 text-[15px] leading-5">
            <span className="truncate font-bold tracking-tight text-foreground">
              {author}
            </span>
            <a
              href={`https://x.com/${author}`}
              target="_blank"
              rel="noopener noreferrer"
              className="relative z-20 truncate text-[15px] text-muted-foreground hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              @{author}
            </a>
            {timestamp && (
              <>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">{timestamp}</span>
              </>
            )}
          </div>

          {/* Tweet body — main text with auto-linkification */}
          <div className="mt-0.5 whitespace-pre-wrap break-words text-[15px] leading-[1.45] text-foreground">
            {linkifyTweetText(shownOriginal)}
          </div>

          {/* Quoted tweet — Twitter's quote-card style: rounded bordered card */}
          {shownQuoted && (
            <div className="mt-2 overflow-hidden rounded-2xl border border-border/60 px-3 py-2">
              <div className="whitespace-pre-wrap break-words text-[14px] leading-[1.45] text-foreground/85">
                {linkifyTweetText(shownQuoted)}
              </div>
            </div>
          )}

          {/* Footer: expand/collapse only — "see original" is the whole-card link */}
          {longText && (
            <div className="mt-2 text-[13px]">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setExpanded((v) => !v);
                }}
                className="relative z-20 inline-flex items-center gap-0.5 text-sky-500 hover:underline"
              >
                {expanded ? (
                  <>
                    <ChevronUp className="h-3 w-3" />
                    收起
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3 w-3" />
                    展开全文
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Inline variant — legacy collapsed footer (kept for back-compat)
// ---------------------------------------------------------------------------

function InlineFooter({ chunks }: { chunks: KolPersonaChunk[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2 mx-2 rounded-md border border-emerald-100 bg-emerald-50/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-50 transition rounded-md"
      >
        <span>原文支持 ({chunks.length})</span>
        <span className="text-emerald-500">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <ul className="px-3 pb-3 space-y-2">
          {chunks.map((c) => (
            <li
              key={`${c.source_id}-${c.citation_index}`}
              className="text-xs text-gray-700 border-l-2 border-emerald-200 pl-2"
            >
              <div className="font-medium text-emerald-700">
                @{c.author_username || 'unknown'}
                {c.created_at && (
                  <span className="text-gray-400"> · {c.created_at.slice(0, 10)}</span>
                )}
              </div>
              <div className="mt-0.5 line-clamp-3 whitespace-pre-wrap">{c.content}</div>
              {c.url && (
                <a
                  href={c.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-0.5 inline-block text-emerald-600 hover:underline"
                >
                  查看原推 →
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
