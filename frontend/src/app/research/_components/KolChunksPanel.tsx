'use client';

import { Fragment, type ReactNode, useState } from 'react';
import { ChevronDown, ChevronUp, FileText } from 'lucide-react';

import MarkdownBody from '@/components/MarkdownBody';
import type { KolPersonaChunk } from '@/lib/api';
import {
  getPersonaDisplayLabel,
  replacePersonaUsernamesForDisplay,
} from '../_lib/personaDisplay';

/** Official X (Twitter) logo mark. */
function XLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.65l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

const ZSXQ_LOGO_SRC = '/kol-avatars/zsxq_logo.png';
const PANDACIRCLE_AVATAR_SRC = '/kol-avatars/pandacircle.png';
const ZSXQ_PERSONA_CIRCLE_NAMES: Record<string, string> = {
  pandacircle: '潘大的科技交流圈',
};
const TWEET_SIGNAL_AVATAR_BY_AUTHOR: Record<string, string> = {
  johnsonz91127: PANDACIRCLE_AVATAR_SRC,
};

type SourceAwareChunk = Pick<KolPersonaChunk, 'content' | 'title' | 'url' | 'metadata'> & {
  source_type?: string | null;
};

interface KolChunksPanelProps {
  chunks: KolPersonaChunk[];
  /** Layout variant: 'inline' is the legacy collapsed footer; 'panel' is the
   *  full-width right-column evidence card list. Default is 'panel'. */
  variant?: 'inline' | 'panel';
}

/**
 * KOL citation panel — source-aware card list of the evidence the agent
 * retrieved during the current turn.
 */
export default function KolChunksPanel({ chunks, variant = 'panel' }: KolChunksPanelProps) {
  if (!chunks || chunks.length === 0) {
    if (variant === 'panel') {
      return (
        <div className="flex h-full flex-col items-center justify-center p-8 text-center">
          <FileText className="mb-3 h-8 w-8 text-muted-foreground/70" strokeWidth={1.4} />
          <p className="text-xs font-medium text-muted-foreground">
            原文支持
          </p>
          <p className="mt-2 max-w-xs text-xs leading-relaxed text-muted-foreground">
            提问后，AI 检索到的原文证据会显示在这里，点击 [#N] 引用可跳到对应卡片。
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
  const dateOnly = iso.match(/^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})$/);
  const d = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(iso);
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

function zsxqAuthorAvatarSrcFor(chunk: KolPersonaChunk): string {
  return avatarSrcFor(chunk.author_username) || PANDACIRCLE_AVATAR_SRC;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function parseChunkDateCandidate(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const dateOnly = trimmed.match(/^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})$/);
  const d = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d;
}

function chunkDateCandidates(chunk: Pick<KolPersonaChunk, 'created_at' | 'content' | 'metadata'>): string[] {
  const metadata = chunk.metadata || {};
  const metadataDate = (chunk.content || '').match(/^日期\s*[:：]\s*([0-9]{4}-[0-9]{1,2}-[0-9]{1,2}(?:[T ][^\n]+)?)/m)?.[1] || '';
  return [
    metadataDate,
    asString(metadata.date),
    asString(metadata.created_at),
    asString(metadata.createdAt),
    chunk.created_at || '',
  ];
}

export function isZsxqChunk(chunk: SourceAwareChunk): boolean {
  const metadata = chunk.metadata || {};
  const sourceType = [
    asString(chunk.source_type),
    asString(metadata.source_type),
    asString(metadata.sourceType),
    asString(metadata.source),
  ].join(' ');
  const haystack = [
    sourceType,
    chunk.url || '',
  ].join('\n');
  return /\bz?zsxq_thread\b/i.test(sourceType)
    || /Source:\s*zsxq_thread/i.test(chunk.content || '')
    || /(?:^|[/.])zsxq(?:\.com|[/.?#]|$)/i.test(haystack);
}

export function getChunkTimeLabel(chunk: Pick<KolPersonaChunk, 'created_at' | 'content' | 'metadata'>): string {
  for (const candidate of chunkDateCandidates(chunk)) {
    const label = formatRelativeTime(candidate);
    if (label) return label;
  }
  return '';
}

export function getChunkTimestamp(chunk: Pick<KolPersonaChunk, 'created_at' | 'content' | 'metadata'>): number | null {
  for (const candidate of chunkDateCandidates(chunk)) {
    const d = parseChunkDateCandidate(candidate);
    if (d) return d.getTime();
  }
  return null;
}

export function getZsxqCircleName(chunk: Pick<KolPersonaChunk, 'author_username' | 'content' | 'metadata'>): string {
  const metadata = chunk.metadata || {};
  const rawName = [
    asString(metadata.circle_name),
    asString(metadata.circleName),
    asString(metadata.source_name),
    asString(metadata.sourceName),
    asString(metadata.source),
    (chunk.content || '').match(/^来源\s*[:：]\s*([^\n]+)/m)?.[1] || '',
  ].find((value) => value.trim());

  const name = (rawName || '')
    .replace(/[（(]\s*知识星球(?:动态|原文)?\s*[）)]/g, '')
    .trim();

  if (name) return name;

  const persona = [
    chunk.author_username || '',
    asString(metadata.author_username),
    asString(metadata.persona_username),
    asString(metadata.personaUsername),
  ].find((value) => value.trim().toLowerCase() in ZSXQ_PERSONA_CIRCLE_NAMES);

  return persona ? ZSXQ_PERSONA_CIRCLE_NAMES[persona.trim().toLowerCase()] : '知识星球';
}

export function sortChunksByTimeDesc(chunks: KolPersonaChunk[]): KolPersonaChunk[] {
  return chunks
    .map((chunk, index) => ({
      chunk,
      index,
      timestamp: getChunkTimestamp(chunk),
    }))
    .sort((a, b) => {
      if (a.timestamp !== null && b.timestamp !== null && a.timestamp !== b.timestamp) {
        return b.timestamp - a.timestamp;
      }
      if (a.timestamp !== null && b.timestamp === null) return -1;
      if (a.timestamp === null && b.timestamp !== null) return 1;
      return a.index - b.index;
    })
    .map((entry) => entry.chunk);
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
    if (m.index > last) {
      out.push(replacePersonaUsernamesForDisplay(text.slice(last, m.index)));
    }
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
      const displayLabel = getPersonaDisplayLabel(handle, token);
      out.push(
        <a
          key={`l-${key++}`}
          href={`https://x.com/${handle}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sky-500 hover:underline"
        >
          {displayLabel}
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
  if (last < text.length) {
    out.push(replacePersonaUsernamesForDisplay(text.slice(last)));
  }
  return out.map((node, i) => <Fragment key={i}>{node}</Fragment>);
}

// ---------------------------------------------------------------------------
// Panel variant — source-aware card list
// ---------------------------------------------------------------------------

function CardList({ chunks }: { chunks: KolPersonaChunk[] }) {
  const sortedChunks = sortChunksByTimeDesc(chunks);
  const zsxqChunks = sortedChunks.filter(isZsxqChunk);
  const tweetChunks = sortedChunks.filter((chunk) => !isZsxqChunk(chunk));
  const zsxqCount = zsxqChunks.length;
  const tweetCount = tweetChunks.length;
  const hasMixedSources = zsxqCount > 0 && tweetCount > 0;
  const sourceSummary = zsxqCount === chunks.length
    ? `${chunks.length} 条知识星球内容`
    : zsxqCount > 0
      ? `${chunks.length} 条混合原文证据`
      : `${chunks.length} 条 X 推文`;

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border/40 px-4 py-3">
        <p className="text-xs font-medium text-muted-foreground">
          原文支持
        </p>
        <p className="mt-1 text-sm text-foreground">
          {sourceSummary}
        </p>
        {hasMixedSources && (
          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-medium">
            <SourcePill icon={<XLogo className="h-3 w-3" />}>
              X 推文 {tweetCount}
            </SourcePill>
            <SourcePill
              icon={(
                // eslint-disable-next-line @next/next/no-img-element
                <img src={ZSXQ_LOGO_SRC} alt="" aria-hidden className="h-3 w-3 rounded-sm object-contain" />
              )}
            >
              知识星球 {zsxqCount}
            </SourcePill>
          </div>
        )}
      </div>
      {hasMixedSources ? (
        <div className="flex-1 overflow-y-auto">
          {tweetCount > 0 && (
            <EvidenceSection
              title="X / Twitter 推文"
              count={tweetCount}
              icon={<XLogo className="h-3.5 w-3.5" />}
              chunks={tweetChunks}
            />
          )}
          {zsxqCount > 0 && (
            <EvidenceSection
              title="知识星球内容"
              count={zsxqCount}
              icon={(
                // eslint-disable-next-line @next/next/no-img-element
                <img src={ZSXQ_LOGO_SRC} alt="" aria-hidden className="h-3.5 w-3.5 rounded-sm object-contain" />
              )}
              chunks={zsxqChunks}
            />
          )}
        </div>
      ) : (
        <ul className="flex-1 divide-y divide-border/40 overflow-y-auto">
          {sortedChunks.map((chunk) => (
            <EvidenceCard key={`${chunk.source_id}-${chunk.citation_index}`} chunk={chunk} />
          ))}
        </ul>
      )}
    </div>
  );
}

function SourcePill({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/35 px-2 py-0.5 text-muted-foreground">
      {icon}
      {children}
    </span>
  );
}

function EvidenceSection({
  title,
  count,
  icon,
  chunks,
}: {
  title: string;
  count: number;
  icon: ReactNode;
  chunks: KolPersonaChunk[];
}) {
  return (
    <section className="border-b border-border/40 last:border-b-0">
      <div className="flex min-h-10 items-center justify-between border-b border-border/40 bg-background px-4 py-2.5">
        <div className="inline-flex items-center gap-2 text-xs font-medium text-foreground">
          {icon}
          <span>{title}</span>
        </div>
        <span className="text-[11px] text-muted-foreground">{count} 条</span>
      </div>
      <ul className="divide-y divide-border/40">
        {chunks.map((chunk) => (
          <EvidenceCard key={`${chunk.source_id}-${chunk.citation_index}`} chunk={chunk} />
        ))}
      </ul>
    </section>
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
  const canonicalMarker = 'Canonical tweet content:';
  const canonicalIdx = raw.indexOf(canonicalMarker);
  const origIdx = raw.indexOf(origMarker);

  if (canonicalIdx >= 0) {
    return extractTweetSections(raw.slice(canonicalIdx + canonicalMarker.length));
  }

  if (origIdx >= 0) {
    return extractTweetSections(raw.slice(origIdx + origMarker.length));
  }

  return { original: stripTweetIndexMetadata(raw), quoted: '' };
}

function extractTweetSections(raw: string): { original: string; quoted: string } {
  const quoteMarker = 'Quoted tweet:';
  const tweetMarker = 'Tweet:';
  const imageMarker = /\n\s*Image\s+\d+\s+text\b/i;
  let body = raw.trim();
  if (body.startsWith(tweetMarker)) {
    body = body.slice(tweetMarker.length).trim();
  }
  const imageIdx = body.search(imageMarker);
  const visibleBody = imageIdx >= 0 ? body.slice(0, imageIdx).trim() : body;
  const quoteIdx = visibleBody.indexOf(quoteMarker);
  if (quoteIdx < 0) {
    return { original: stripTweetIndexMetadata(visibleBody), quoted: '' };
  }
  return {
    original: stripTweetIndexMetadata(visibleBody.slice(0, quoteIdx)),
    quoted: stripTweetIndexMetadata(visibleBody.slice(quoteIdx + quoteMarker.length)),
  };
}

function stripTweetIndexMetadata(raw: string): string {
  if (!raw) return '';
  const lines = raw.split(/\r?\n/);
  const metadataLine = /^(?:Source|Source ID|Title|Author|Date|Tweet type|Quality|Content type|Tickers|Sectors|Events|Summary|Persona|Source author|Article title)\s*[:：]/i;
  let lastMetadataLine = -1;

  for (let i = 0; i < Math.min(lines.length, 40); i += 1) {
    const line = lines[i].trim();
    if (!line) continue;
    if (metadataLine.test(line)) {
      lastMetadataLine = i;
    }
  }

  const bodyLines = lastMetadataLine >= 0 ? lines.slice(lastMetadataLine + 1) : lines.slice();
  while (bodyLines.length > 0 && !bodyLines[0].trim()) bodyLines.shift();
  while (bodyLines.length > 0 && !bodyLines[bodyLines.length - 1].trim()) bodyLines.pop();
  return bodyLines.join('\n').trim();
}

export function extractZsxqBody(raw: string): string {
  if (!raw) return '';
  const lines = raw.split(/\r?\n/);
  const metadataLine = /^(?:Source|Source ID|Title|Section|来源|作者|日期|类型|标签|标的|标题)\s*[:：]/i;
  let lastMetadataLine = -1;

  for (let i = 0; i < Math.min(lines.length, 60); i += 1) {
    const line = lines[i].trim();
    if (!line) continue;
    if (metadataLine.test(line)) {
      lastMetadataLine = i;
    }
  }

  const bodyLines = lastMetadataLine >= 0 ? lines.slice(lastMetadataLine + 1) : lines.slice();
  while (bodyLines.length > 0 && !bodyLines[0].trim()) bodyLines.shift();
  while (bodyLines.length > 0 && !bodyLines[bodyLines.length - 1].trim()) bodyLines.pop();
  return bodyLines
    .join('\n')
    .trim()
    .replace(/\*\*([^*\n]+?)\*\*/g, '$1');
}

function truncateText(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function tweetAvatarSrcFor(chunk: KolPersonaChunk): string {
  const metadata = chunk.metadata || {};
  const persona = asString(metadata.persona_username) || asString(metadata.personaUsername);
  if (persona) return avatarSrcFor(persona);
  const author = (chunk.author_username || '').trim().toLowerCase();
  if (author && TWEET_SIGNAL_AVATAR_BY_AUTHOR[author]) {
    return TWEET_SIGNAL_AVATAR_BY_AUTHOR[author];
  }
  return avatarSrcFor(chunk.author_username) || PANDACIRCLE_AVATAR_SRC;
}

function tweetMetadataValue(chunk: KolPersonaChunk, key: string, label: string): string {
  const metadata = chunk.metadata || {};
  const value = metadata[key];
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  const match = (chunk.content || '').match(new RegExp(`^${label}\\s*[:：]\\s*([^\\n]+)`, 'im'));
  return match?.[1]?.trim() || '';
}

function tweetBadgeValues(chunk: KolPersonaChunk): string[] {
  const values = [
    tweetMetadataValue(chunk, 'tweet_type', 'Tweet type'),
    tweetMetadataValue(chunk, 'quality', 'Quality'),
  ]
    .map((value) => value.trim())
    .filter((value) => value && !/^n\/a$/i.test(value));
  return Array.from(new Set(values)).slice(0, 2);
}

function EvidenceCard({ chunk }: { chunk: KolPersonaChunk }) {
  if (isZsxqChunk(chunk)) {
    return <ZsxqCard chunk={chunk} />;
  }
  return <TweetCard chunk={chunk} />;
}

function ZsxqCard({ chunk }: { chunk: KolPersonaChunk }) {
  const [expanded, setExpanded] = useState(false);
  const body = extractZsxqBody(chunk.content || '');
  const longText = body.length > 520;
  const shownBody = expanded || !longText ? body : truncateText(body, 520);
  const timestamp = getChunkTimeLabel(chunk);
  const circleName = getZsxqCircleName(chunk);

  return (
    <li
      id={`kol-citation-${chunk.citation_index}`}
      className="group relative px-4 py-4 transition hover:bg-muted/25"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex min-w-0 items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={zsxqAuthorAvatarSrcFor(chunk)}
            alt={chunk.author_username || 'pandacircle'}
            className="h-6 w-6 shrink-0 rounded-full bg-muted object-cover"
          />
          <span className="truncate text-sm font-medium text-foreground">
            {circleName}
          </span>
          {timestamp && (
            <>
              <span className="shrink-0 text-muted-foreground">·</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {timestamp}
              </span>
            </>
          )}
          <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            #{chunk.citation_index}
          </span>
        </div>
      </div>

      <div className="mt-3 rounded-md border border-border/60 bg-background px-3 py-3">
        <div className="prose prose-sm max-w-none text-foreground dark:prose-invert
          prose-headings:mt-3 prose-headings:mb-2 prose-headings:text-foreground prose-headings:font-semibold
          prose-p:my-2 prose-p:leading-7 prose-p:text-inherit
          prose-strong:text-foreground prose-strong:font-semibold
          prose-ul:my-2 prose-ol:my-2 prose-li:my-1 prose-li:text-inherit
          [&_li_p]:my-0"
        >
          <MarkdownBody>
            {shownBody || '暂无可展示正文'}
          </MarkdownBody>
        </div>
      </div>

      {(chunk.url || longText) && (
        <div className="mt-2 flex items-center gap-4 text-xs">
          {chunk.url && (
            <a
              href={chunk.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="relative z-20 inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={ZSXQ_LOGO_SRC}
                alt=""
                aria-hidden
                className="h-3.5 w-3.5 rounded-sm object-contain"
              />
              在星球中查看原文
            </a>
          )}
          {longText && (
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
          )}
        </div>
      )}
    </li>
  );
}

function TweetCard({ chunk }: { chunk: KolPersonaChunk }) {
  const [expanded, setExpanded] = useState(false);

  const { original, quoted } = extractTweetBody(chunk.content || '');
  const combinedLen = original.length + quoted.length;
  const longText = combinedLen > 280;
  const shownOriginal = expanded || !longText ? original : truncateText(original, 280);
  const shownQuoted = expanded || !longText ? quoted : truncateText(quoted, 140);

  const avatar = tweetAvatarSrcFor(chunk);
  const timestamp = getChunkTimeLabel(chunk);
  const badges = tweetBadgeValues(chunk);

  return (
    <li
      id={`kol-citation-${chunk.citation_index}`}
      className="group relative px-4 py-3 transition hover:bg-muted/30"
    >
      <div className="relative z-10 flex gap-3" style={{ fontFamily: '"Twitter Chirp", system-ui, -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif' }}>
        {/* Avatar */}
        <div className="shrink-0">
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatar}
              alt=""
              aria-hidden
              className="h-10 w-10 rounded-full bg-muted object-cover"
              onError={(e) => {
                const image = e.target as HTMLImageElement;
                if (image.src.endsWith(PANDACIRCLE_AVATAR_SRC)) return;
                image.src = PANDACIRCLE_AVATAR_SRC;
              }}
            />
          ) : null}
          <div className="hidden h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
            X
          </div>
        </div>

        {/* Main content */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-xs leading-5 text-muted-foreground">
            {timestamp && (
              <span>{timestamp}</span>
            )}
            {badges.map((badge) => (
              <span
                key={badge}
                className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground"
              >
                {badge}
              </span>
            ))}
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
              #{chunk.citation_index}
            </span>
          </div>

          {/* Tweet body — main text with auto-linkification */}
          <div className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
            {linkifyTweetText(shownOriginal)}
          </div>

          {/* Quoted tweet — Twitter's quote-card style: rounded bordered card */}
          {shownQuoted && (
            <div className="mt-2 overflow-hidden rounded-2xl border border-border/60 px-3 py-2">
              <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
                {linkifyTweetText(shownQuoted)}
              </div>
            </div>
          )}

          {/* Footer: explicit "view original on X" link + optional expand/collapse */}
          {(chunk.url || longText) && (
            <div className="mt-2 flex items-center gap-4 text-xs">
              {chunk.url && (
                <a
                  href={chunk.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="relative z-20 inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <XLogo className="h-3.5 w-3.5" />
                  在 X 查看原文
                </a>
              )}
              {longText && (
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
              )}
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
  const sortedChunks = sortChunksByTimeDesc(chunks);
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
          {sortedChunks.map((c) => {
            const isZsxq = isZsxqChunk(c);
            const tweetBody = extractTweetBody(c.content || '').original;
            const body = isZsxq ? extractZsxqBody(c.content || '') : (tweetBody || c.content);
            const circleName = isZsxq ? getZsxqCircleName(c) : '';
            const displayAuthor = getPersonaDisplayLabel(
              c.author_username || 'unknown',
              c.author_username || 'unknown',
            );
            return (
              <li
                key={`${c.source_id}-${c.citation_index}`}
                className="rounded-md border border-emerald-200/70 bg-background/70 px-2 py-1.5 text-xs text-foreground"
              >
                <div className="font-medium text-emerald-700">
                  {isZsxq ? circleName : displayAuthor}
                  {!isZsxq && c.created_at && (
                    <span className="text-muted-foreground/70"> · {c.created_at.slice(0, 10)}</span>
                  )}
                </div>
                <div className="mt-0.5 line-clamp-3 whitespace-pre-wrap">
                  {replacePersonaUsernamesForDisplay(body)}
                </div>
                {c.url && (
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-0.5 inline-block text-emerald-600 hover:underline"
                  >
                    {isZsxq ? '在星球中查看原文 →' : '查看原推 →'}
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
