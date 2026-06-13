'use client';

import Image from 'next/image';
import { useState } from 'react';

interface Props {
  username: string;
  displayName: string;
  description?: string | null;
  lastUpdatedRelative?: string | null;
  totalCount?: number | null;
  /** Optional avatar URL. Falls back to monogram on missing / 404. */
  avatarUrl?: string | null;
}

/**
 * Compact persona header. Avatar image (or monogram fallback) + name +
 * 1-line portrait + meta column. Height ~96px.
 */
export default function PersonaHero({
  username,
  displayName,
  description,
  lastUpdatedRelative,
  totalCount,
  avatarUrl,
}: Props) {
  const monogram = (displayName || username || '?').trim().slice(0, 1).toUpperCase();
  const xProfileUrl = `https://x.com/${encodeURIComponent(username)}`;
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = !!avatarUrl && !imgFailed;

  return (
    <header className="border-b border-border/60 bg-background">
      <div className="mx-auto flex max-w-7xl items-center gap-5 px-4 py-5 md:px-6">
        {/* Avatar: image preferred, monogram fallback; links to X profile */}
        <a
          href={xProfileUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`在 X 上查看 ${displayName}`}
          className="group/avatar block shrink-0 rounded-full ring-offset-2 ring-offset-background transition focus-visible:ring-2 focus-visible:ring-primary"
        >
          {showImage ? (
            <Image
              src={avatarUrl!}
              alt={`${displayName} 头像`}
              width={48}
              height={48}
              onError={() => setImgFailed(true)}
              className="h-12 w-12 rounded-full border border-border/60 object-cover transition group-hover/avatar:border-primary/60"
              loading="eager"
            />
          ) : (
            <div
              aria-hidden
              className="grid h-12 w-12 place-items-center rounded-full border border-primary/30 bg-primary/10 font-editorial text-2xl text-primary transition group-hover/avatar:border-primary/60"
            >
              {monogram}
            </div>
          )}
        </a>

        {/* Name + portrait */}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-3">
            <h1 className="truncate font-editorial text-2xl text-foreground md:text-3xl">
              <a
                href={xProfileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="transition hover:text-primary"
              >
                {displayName}
              </a>
            </h1>
            <a
              href={xProfileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden font-data text-xs uppercase tracking-[0.18em] text-muted-foreground transition hover:text-primary md:inline"
            >
              @{username}
            </a>
          </div>
          {description ? (
            <p
              className="mt-0.5 line-clamp-2 text-sm leading-relaxed text-muted-foreground"
              title={description}
            >
              {description}
            </p>
          ) : null}
        </div>

        {/* Meta column */}
        {(lastUpdatedRelative || typeof totalCount === 'number') && (
          <div className="hidden shrink-0 flex-col items-end gap-0.5 text-right md:flex">
            {lastUpdatedRelative ? (
              <div className="flex items-center gap-1.5 font-data text-xs text-muted-foreground">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
                最新更新 · {lastUpdatedRelative}
              </div>
            ) : null}
            {typeof totalCount === 'number' ? (
              <div className="font-data text-xs text-muted-foreground tabular-nums">
                累计 {totalCount.toLocaleString()} 条推文
              </div>
            ) : null}
          </div>
        )}

      </div>
    </header>
  );
}
