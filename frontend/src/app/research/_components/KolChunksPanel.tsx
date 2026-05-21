'use client';

import { useState } from 'react';
import type { KolPersonaChunk } from '@/lib/api';

interface KolChunksPanelProps {
  chunks: KolPersonaChunk[];
}

/**
 * Collapsed citation footer rendered under the latest KOL assistant turn.
 * Shows the [#N] indexed tweet excerpts the agent cited, expandable.
 */
export default function KolChunksPanel({ chunks }: KolChunksPanelProps) {
  const [open, setOpen] = useState(false);
  if (!chunks || chunks.length === 0) return null;

  return (
    <div className="mt-2 mx-2 rounded-md border border-emerald-100 bg-emerald-50/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-50 transition rounded-md"
      >
        <span>📎 博主历史观点 ({chunks.length})</span>
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
                [#{c.citation_index}] @{c.author_username || 'unknown'}
                {c.created_at && (
                  <span className="text-gray-400"> · {c.created_at.slice(0, 10)}</span>
                )}
                {c.tickers?.length > 0 && (
                  <span className="ml-1 text-gray-400">
                    [{c.tickers.slice(0, 3).join(', ')}]
                  </span>
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
