'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Pencil, Pin, RefreshCw, Search, X } from 'lucide-react';
import type { ConversationSummary } from '@/lib/api';
import { replacePersonaUsernamesForDisplay } from '../_lib/personaDisplay';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function conversationTimeValue(value: string | null | undefined): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function compareConversationSummaries(a: ConversationSummary, b: ConversationSummary): number {
  const pinnedDelta = Number(Boolean(b.is_pinned)) - Number(Boolean(a.is_pinned));
  if (pinnedDelta !== 0) return pinnedDelta;
  if (a.is_pinned || b.is_pinned) {
    const pinnedAtDelta = conversationTimeValue(b.pinned_at) - conversationTimeValue(a.pinned_at);
    if (pinnedAtDelta !== 0) return pinnedAtDelta;
  }
  return conversationTimeValue(b.updated_at) - conversationTimeValue(a.updated_at);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ConversationSidebarProps {
  conversations: ConversationSummary[];
  loading?: boolean;
  error?: string | null;
  currentId?: string | null;
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
  onRename?: (id: string, title: string) => Promise<void> | void;
  onTogglePin?: (id: string, nextPinned: boolean) => Promise<void> | void;
  onNewChat: () => void;
  requestInFlight?: boolean;
  onToggle?: () => void;
  userName?: string | null;
  userEmail?: string | null;
  /** Subscription tier label shown next to the user avatar. 'max'/'pro'/null. */
  userTier?: 'max' | 'pro' | null;
  /** Pagination: more pages exist on the server. */
  hasMore?: boolean;
  /** Pagination: a load-more request is in flight. */
  loadingMore?: boolean;
  /** Pagination: handler invoked when the user clicks "加载更多". */
  onLoadMore?: () => void;
  onSearchOpen?: () => void;
  onRetry?: () => void;
}

type PinOverride = {
  is_pinned: boolean;
  pinned_at: string | null;
};

export default function ConversationSidebar({
  conversations,
  loading = false,
  error = null,
  currentId,
  onLoad,
  onDelete,
  onRename,
  onTogglePin,
  onNewChat,
  requestInFlight = false,
  onToggle,
  userName,
  userEmail,
  userTier,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  onSearchOpen,
  onRetry,
}: ConversationSidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [savingRenameId, setSavingRenameId] = useState<string | null>(null);
  const [pinningId, setPinningId] = useState<string | null>(null);
  const [pinOverrides, setPinOverrides] = useState<Record<string, PinOverride>>({});

  useEffect(() => {
    setPinOverrides((current) => {
      let changed = false;
      const next = { ...current };

      for (const [id, override] of Object.entries(current)) {
        const conversation = conversations.find((item) => item.id === id);
        if (!conversation || Boolean(conversation.is_pinned) === override.is_pinned) {
          delete next[id];
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [conversations]);

  const displayedConversations = useMemo(() => (
    conversations
      .map((conversation) => {
        const override = pinOverrides[conversation.id];
        if (!override) return conversation;
        return {
          ...conversation,
          is_pinned: override.is_pinned,
          pinned_at: override.pinned_at,
        };
      })
      .sort(compareConversationSummaries)
  ), [conversations, pinOverrides]);

  const startRename = (conversation: ConversationSummary) => {
    if (!onRename || requestInFlight) return;
    setEditingId(conversation.id);
    setDraftTitle(replacePersonaUsernamesForDisplay(conversation.title || '未命名对话'));
  };

  const cancelRename = () => {
    setEditingId(null);
    setDraftTitle('');
    setSavingRenameId(null);
  };

  const submitRename = async (conversation: ConversationSummary) => {
    if (!onRename) return;
    const nextTitle = draftTitle.trim();
    if (!nextTitle || nextTitle === (conversation.title || '未命名对话')) {
      cancelRename();
      return;
    }
    setSavingRenameId(conversation.id);
    try {
      await onRename(conversation.id, nextTitle);
      cancelRename();
    } catch {
      setSavingRenameId(null);
    }
  };

  const togglePin = async (conversation: ConversationSummary) => {
    if (!onTogglePin || requestInFlight || pinningId) return;
    const nextPinned = !conversation.is_pinned;
    const nextPinnedAt = nextPinned ? new Date().toISOString() : null;
    setPinningId(conversation.id);
    setPinOverrides((current) => ({
      ...current,
      [conversation.id]: {
        is_pinned: nextPinned,
        pinned_at: nextPinnedAt,
      },
    }));
    try {
      await onTogglePin(conversation.id, nextPinned);
    } catch {
      setPinOverrides((current) => {
        const { [conversation.id]: _removed, ...rest } = current;
        void _removed;
        return rest;
      });
    } finally {
      setPinningId(null);
    }
  };

  // Auto-load the next page when the sentinel at the list bottom scrolls into
  // view. rootMargin=120px primes the next page slightly before it's visible
  // so the user doesn't see a stutter. Button below still works as a manual
  // fallback (e.g. when IntersectionObserver isn't available).
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!hasMore || !onLoadMore || loadingMore) return;
    const node = sentinelRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            onLoadMore();
            break;
          }
        }
      },
      { root: null, rootMargin: '120px', threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, onLoadMore, displayedConversations.length]);

  return (
    <div data-testid="research-conversation-sidebar" className="h-full min-h-0 w-full flex flex-col">
      {/* ── Logo header ── */}
      <div className="px-3 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5" viewBox="0 0 32 32" fill="none">
            <path
              d="M4 24V12L10 6V24M10 6L16 14L22 6M22 6V24M28 24V12L22 6"
              stroke="url(#sidebar-logo-grad)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <defs>
              <linearGradient id="sidebar-logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#10B981" />
                <stop offset="100%" stopColor="#6EE7B7" />
              </linearGradient>
            </defs>
          </svg>
          <span className="text-xs font-medium text-foreground">投研助手</span>
        </div>
        {onToggle && (
          <button
            onClick={onToggle}
            className="p-1 rounded-md text-muted-foreground/70 hover:text-foreground hover:bg-muted/40 transition-colors cursor-pointer"
            title="收起侧栏"
            aria-label="收起历史对话"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M9 3v18" />
            </svg>
          </button>
        )}
      </div>

      {/* ── New chat button ── */}
      <div className="px-2 mb-1">
        <button
          onClick={onNewChat}
          className="group w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
        >
          <svg className="w-3.5 h-3.5 transition-transform duration-200 group-hover:rotate-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
          新对话
        </button>
        {onSearchOpen && (
          <button
            type="button"
            onClick={onSearchOpen}
            className="group w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
          >
            <Search className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="min-w-0 flex-1 text-left">搜索对话</span>
            <span className="hidden xl:inline-flex items-center rounded border border-border/60 px-1.5 py-0.5 text-xs text-muted-foreground">
              ⌘K
            </span>
          </button>
        )}
      </div>

      {/* ── Conversation list ── */}
      <div className="flex-1 overflow-y-auto px-1 conversation-scroll">
        {loading ? (
          <div className="px-2 py-3 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-1.5">
                <div className="h-2.5 bg-muted/40 rounded animate-pulse w-4/5" />
                <div className="h-2 bg-muted/20 rounded animate-pulse w-1/2" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="px-3 py-6 text-center">
            <p className="text-xs text-muted-foreground/70">{error}</p>
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
        ) : displayedConversations.length === 0 ? (
          <div className="px-3 py-6 text-center">
            <p className="text-sm text-muted-foreground">开始对话后会保存在这里</p>
          </div>
        ) : (
          <>
            {displayedConversations.map((conv) => {
              const displayTitle = replacePersonaUsernamesForDisplay(conv.title || '未命名对话');
              return (
                <div
                  key={conv.id}
                  className={`group relative mx-0.5 rounded-lg transition-all duration-150 border mb-0.5 ${
                    conv.id === currentId
                      ? 'bg-primary/[0.08] border-primary/20'
                      : 'border-transparent hover:bg-muted/60 hover:border-border/60'
                  }`}
                >
                {editingId === conv.id ? (
                  <form
                    className="px-2.5 py-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void submitRename(conv);
                    }}
                  >
                    <div className="flex items-center gap-1.5">
                      <input
                        value={draftTitle}
                        onChange={(event) => setDraftTitle(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') {
                            event.preventDefault();
                            cancelRename();
                          }
                        }}
                        onFocus={(event) => event.currentTarget.select()}
                        autoFocus
                        maxLength={50}
                        disabled={savingRenameId === conv.id}
                        className="min-w-0 flex-1 rounded-md border border-primary/25 bg-background px-2 py-1 text-xs text-foreground outline-none focus:border-primary/45 disabled:opacity-60"
                      />
                      <button
                        type="submit"
                        disabled={savingRenameId === conv.id || draftTitle.trim().length === 0}
                        className="p-1 rounded-md text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                        aria-label="保存名称"
                      >
                        <Check className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={cancelRename}
                        disabled={savingRenameId === conv.id}
                        className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 disabled:opacity-40 transition-colors cursor-pointer"
                        aria-label="取消重命名"
                      >
                        <X className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <button
                      onClick={() => !requestInFlight && onLoad(conv.id)}
                      disabled={requestInFlight}
                      className={`w-full text-left px-2.5 py-2 pr-16 ${requestInFlight ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                    >
                      <span className="flex min-w-0 items-start gap-1.5">
                        {conv.is_pinned && (
                          <Pin className="mt-0.5 h-3 w-3 shrink-0 text-primary" aria-hidden="true" />
                        )}
                        <span className="min-w-0 flex-1 text-xs leading-snug line-clamp-2 text-foreground">
                          {displayTitle}
                        </span>
                      </span>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatRelativeTime(conv.updated_at)}
                      </p>
                    </button>
                    <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150">
                      {onTogglePin && (
                        <button
                          type="button"
                          onClick={() => void togglePin(conv)}
                          disabled={requestInFlight || pinningId === conv.id}
                          aria-label={`${conv.is_pinned ? '取消置顶' : '置顶'}对话: ${displayTitle}`}
                          title={conv.is_pinned ? '取消置顶' : '置顶'}
                          className={`p-0.5 rounded transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 ${
                            conv.is_pinned
                              ? 'text-primary hover:bg-primary/10'
                              : 'text-muted-foreground hover:text-foreground hover:bg-muted/70'
                          }`}
                        >
                          <Pin className="w-3 h-3" aria-hidden="true" />
                        </button>
                      )}
                      {onRename && (
                        <button
                          type="button"
                          onClick={() => startRename(conv)}
                          disabled={requestInFlight}
                          aria-label={`重命名对话: ${displayTitle}`}
                          className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/70 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                        >
                          <Pencil className="w-3 h-3" aria-hidden="true" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onDelete(conv.id)}
                        aria-label={`删除对话: ${displayTitle}`}
                        className="p-0.5 rounded text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                      >
                        <X className="w-3 h-3" aria-hidden="true" />
                      </button>
                    </div>
                  </>
                )}
                </div>
              );
            })}
            {hasMore && onLoadMore && (
              <div ref={sentinelRef} className="px-1 py-2">
                <button
                  type="button"
                  onClick={onLoadMore}
                  disabled={loadingMore}
                  className={`w-full text-center text-xs py-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors ${loadingMore ? 'opacity-60 cursor-wait' : 'cursor-pointer'}`}
                >
                  {loadingMore ? '加载中…' : '继续加载'}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Bottom: settings + account ── */}
      <div className="shrink-0 border-t border-border/50 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] space-y-0.5">
        <a
          href="/profile"
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          设置
        </a>
        {(userName || userEmail) && (
          <div className="flex items-center gap-2 px-2.5 py-1.5">
            <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-micro text-primary font-medium shrink-0">
              {(userName || userEmail || '?')[0].toUpperCase()}
            </div>
            <span className="text-xs text-muted-foreground truncate min-w-0 flex-1">
              {userName || userEmail}
            </span>
            {userTier === 'max' ? (
              <span className="shrink-0 rounded bg-gradient-to-br from-emerald-500 to-emerald-600 px-1.5 py-0.5 text-xs font-bold tracking-wide text-white">
                MAX
              </span>
            ) : userTier === 'pro' ? (
              <span className="shrink-0 rounded border border-emerald-200 bg-emerald-100 px-1.5 py-0.5 text-xs font-bold tracking-wide text-emerald-700">
                PRO
              </span>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
