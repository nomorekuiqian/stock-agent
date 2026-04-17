'use client';

import { useState } from 'react';
import type { PressRelease } from '@/hooks/queries/use-stock-data';

interface NewsArticle {
  title: string;
  publishedDate: string;
  source: string;
  url: string;
  summary?: string;
}

function timeAgo(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr.replace(' ', 'T'));
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const hours = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60));
  if (hours < 1) return '刚刚';
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}天前`;
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

export function NewsAndReleasesCard({
  articles,
  releases,
  loading,
}: {
  articles: NewsArticle[];
  releases: PressRelease[];
  loading?: boolean;
}) {
  const [tab, setTab] = useState<'news' | 'releases'>('news');
  const [showAll, setShowAll] = useState(false);

  const active = tab === 'news' ? articles : releases;
  const visible = showAll ? active : active.slice(0, 10);

  return (
    <div className="bg-card/50 border border-border/30 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-border/20 bg-card/40 flex items-center gap-2">
        <span className="text-base">📰</span>
        <h3 className="text-sm font-medium text-foreground">新闻与公告</h3>

        <div className="ml-auto flex items-center gap-1">
          <TabButton active={tab === 'news'} onClick={() => { setTab('news'); setShowAll(false); }} label={`全部新闻 (${articles.length})`} />
          <TabButton active={tab === 'releases'} onClick={() => { setTab('releases'); setShowAll(false); }} label={`官方公告 (${releases.length})`} />
        </div>
      </div>

      <div className="divide-y divide-border/15">
        {loading ? (
          <div className="p-8 text-center">
            <div className="w-5 h-5 border-2 border-border/40 border-t-muted-foreground rounded-full animate-spin mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">加载中...</p>
          </div>
        ) : visible.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground">
            {tab === 'news' ? '暂无相关新闻' : '暂无官方公告'}
          </div>
        ) : tab === 'news' ? (
          (visible as NewsArticle[]).map((a, i) => (
            <a
              key={i}
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block px-5 py-3 hover:bg-card/60 transition-colors group"
            >
              <div className="flex items-start justify-between gap-3">
                <h4 className="text-sm text-muted-foreground group-hover:text-foreground transition-colors leading-snug line-clamp-2 flex-1">
                  {a.title}
                </h4>
                <svg className="w-3.5 h-3.5 text-muted-foreground/70 group-hover:text-muted-foreground transition-colors flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </div>
              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                <span>{a.source}</span>
                <span>·</span>
                <span>{timeAgo(a.publishedDate)}</span>
              </div>
            </a>
          ))
        ) : (
          (visible as PressRelease[]).map((r, i) => (
            <a
              key={i}
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block px-5 py-3 hover:bg-card/60 transition-colors group"
            >
              <div className="flex items-start justify-between gap-3">
                <h4 className="text-sm text-muted-foreground group-hover:text-foreground transition-colors leading-snug line-clamp-2 flex-1">
                  {r.title}
                </h4>
                <svg className="w-3.5 h-3.5 text-muted-foreground/70 group-hover:text-muted-foreground transition-colors flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </div>
              {r.preview && (
                <p className="text-xs text-muted-foreground/80 mt-1.5 line-clamp-2 leading-relaxed">
                  {r.preview}
                </p>
              )}
              <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                <span className="px-1.5 py-0.5 bg-blue-500/10 border border-blue-500/25 rounded text-blue-400 text-xs font-medium">
                  公告
                </span>
                <span>{r.publisher}</span>
                <span>·</span>
                <span>{timeAgo(r.published_date)}</span>
              </div>
            </a>
          ))
        )}
      </div>

      {active.length > 10 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="w-full py-2.5 text-xs text-muted-foreground hover:text-foreground transition-colors border-t border-border/20 cursor-pointer focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:outline-none"
        >
          {showAll ? '收起' : `查看全部 ${active.length} 条`}
        </button>
      )}
    </div>
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-2.5 py-1 rounded-md cursor-pointer transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:outline-none ${
        active
          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
          : 'text-muted-foreground hover:text-foreground border border-transparent'
      }`}
    >
      {label}
    </button>
  );
}
