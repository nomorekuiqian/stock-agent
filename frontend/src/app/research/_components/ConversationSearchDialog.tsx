'use client';

import { Loader2, MessageSquare, RefreshCw, Search, X } from 'lucide-react';
import type { ConversationSearchMatch, ConversationSummary } from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { replacePersonaUsernamesForDisplay } from '../_lib/personaDisplay';

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return `${diffMin}分钟前`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}小时前`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}天前`;
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function splitSearchTerms(value: string): string[] {
  return value.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

function HighlightedSnippet({ text, terms }: { text: string; terms: string[] }) {
  if (terms.length === 0) return <>{text}</>;
  const pattern = new RegExp(
    `(${terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
    'ig',
  );
  const parts = text.split(pattern);
  return (
    <>
      {parts.map((part, index) => {
        const isMatch = terms.some((term) => part.toLowerCase() === term);
        return isMatch ? (
          <mark key={`${part}-${index}`} className="rounded-sm bg-amber-400/20 px-0.5 text-amber-600 dark:text-amber-300">
            {part}
          </mark>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        );
      })}
    </>
  );
}

function SearchMatchLine({
  match,
  terms,
}: {
  match: ConversationSearchMatch;
  terms: string[];
}) {
  const sourceLabel = match.role === 'assistant' ? '助手' : match.role === 'user' ? '你' : '';
  return (
    <div className="min-w-0 text-xs leading-5 text-muted-foreground">
      {sourceLabel && (
        <span className="mr-1.5 text-xs text-muted-foreground">
          {sourceLabel}
        </span>
      )}
      <span className="line-clamp-2 min-w-0 align-middle">
        <HighlightedSnippet text={replacePersonaUsernamesForDisplay(match.snippet)} terms={terms} />
      </span>
    </div>
  );
}

interface ConversationSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  query: string;
  onQueryChange: (query: string) => void;
  recentConversations: ConversationSummary[];
  recentLoading?: boolean;
  recentError?: string | null;
  searchResults: ConversationSummary[];
  searchLoading?: boolean;
  searchError?: string | null;
  hasMoreRecent?: boolean;
  loadingMoreRecent?: boolean;
  onLoadMoreRecent?: () => void;
  onRetryRecent?: () => void;
  hasMoreSearch?: boolean;
  loadingMoreSearch?: boolean;
  onLoadMoreSearch?: () => void;
  onRetrySearch?: () => void;
  onLoad: (id: string) => void;
  requestInFlight?: boolean;
}

export default function ConversationSearchDialog({
  open,
  onOpenChange,
  query,
  onQueryChange,
  recentConversations,
  recentLoading = false,
  recentError = null,
  searchResults,
  searchLoading = false,
  searchError = null,
  hasMoreRecent = false,
  loadingMoreRecent = false,
  onLoadMoreRecent,
  onRetryRecent,
  hasMoreSearch = false,
  loadingMoreSearch = false,
  onLoadMoreSearch,
  onRetrySearch,
  onLoad,
  requestInFlight = false,
}: ConversationSearchDialogProps) {
  const terms = splitSearchTerms(query);
  const isSearching = terms.length > 0;
  const list = isSearching ? searchResults : recentConversations;
  const loading = isSearching ? searchLoading : recentLoading;
  const error = isSearching ? searchError : recentError;
  const hasMore = isSearching ? hasMoreSearch : hasMoreRecent;
  const loadingMore = isSearching ? loadingMoreSearch : loadingMoreRecent;
  const onLoadMore = isSearching ? onLoadMoreSearch : onLoadMoreRecent;
  const onRetry = isSearching ? onRetrySearch : onRetryRecent;

  const handleSelect = (id: string) => {
    if (requestInFlight) return;
    onLoad(id);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-[12vh] translate-y-0 gap-0 overflow-hidden rounded-xl border-border/60 bg-background/98 p-0 shadow-2xl sm:max-w-2xl"
      >
        <DialogTitle className="sr-only">搜索聊天记录</DialogTitle>
        <DialogDescription className="sr-only">
          搜索投研助手历史聊天内容并定位相关对话。
        </DialogDescription>

        <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            autoFocus
            role="searchbox"
            aria-label="搜索聊天记录"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="搜索聊天记录"
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/70"
            maxLength={120}
          />
          {query.trim().length > 0 && (
            <button
              type="button"
              onClick={() => onQueryChange('')}
              aria-label="清空搜索"
              className="rounded-md p-1 text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md border border-border/60 px-2 py-1 text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors cursor-pointer"
          >
            Esc
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-2 py-2">
          <div className="px-2 pb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {isSearching ? '搜索结果' : '最近对话'}
          </div>

          {loading ? (
            <div className="space-y-2 px-2 py-3">
              {[1, 2, 3].map((item) => (
                <div key={item} className="space-y-2 rounded-lg px-2 py-2">
                  <div className="h-3 w-3/5 rounded bg-muted/50 animate-pulse" />
                  <div className="h-2.5 w-4/5 rounded bg-muted/30 animate-pulse" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="px-3 py-12 text-center">
              <MessageSquare className="mx-auto h-5 w-5 text-muted-foreground/50" aria-hidden="true" />
              <p className="mt-3 text-sm text-muted-foreground">{error}</p>
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="mx-auto mt-3 inline-flex items-center gap-1.5 rounded-md border border-border/60 px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                >
                  <RefreshCw className="h-3 w-3" aria-hidden="true" />
                  重新加载
                </button>
              )}
            </div>
          ) : list.length === 0 ? (
            <div className="px-3 py-12 text-center">
              <MessageSquare className="mx-auto h-5 w-5 text-muted-foreground/70" aria-hidden="true" />
              <p className="mt-3 text-sm text-muted-foreground">
                {isSearching ? '没有找到匹配的对话' : '还没有历史对话'}
              </p>
              {isSearching && (
                <p className="mt-1 text-xs text-muted-foreground/70">
                  试试更具体的股票代码、关键词或一句原话。
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-0.5">
              {list.map((conversation) => {
                const matches = conversation.search_matches ?? [];
                const messageMatches = matches.filter((match) => match.type !== 'title');
                const displayTitle = replacePersonaUsernamesForDisplay(
                  conversation.title || '未命名对话',
                );
                return (
                  <button
                    type="button"
                    key={conversation.id}
                    onClick={() => handleSelect(conversation.id)}
                    disabled={requestInFlight}
                    className="group w-full rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted/70 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                        {displayTitle}
                      </p>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatRelativeTime(conversation.updated_at)}
                      </span>
                    </div>
                    {isSearching && messageMatches.length > 0 ? (
                      <div className="mt-1.5 space-y-1">
                        {messageMatches.slice(0, 3).map((match, index) => (
                          <SearchMatchLine key={`${conversation.id}-${index}`} match={match} terms={terms} />
                        ))}
                      </div>
                    ) : !isSearching ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {conversation.message_count > 0 ? `${conversation.message_count} 条消息` : '最近更新'}
                      </p>
                    ) : null}
                  </button>
                );
              })}

              {hasMore && onLoadMore && (
                <div className="px-2 py-2">
                  <button
                    type="button"
                    onClick={onLoadMore}
                    disabled={loadingMore}
                    className="flex w-full items-center justify-center gap-2 rounded-md py-2 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:cursor-wait disabled:opacity-60"
                  >
                    {loadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                    {loadingMore ? '加载中' : '继续加载'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
