'use client';

import type { ConversationSummary } from '@/lib/api';

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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ConversationSidebarProps {
  conversations: ConversationSummary[];
  loading?: boolean;
  currentId?: string | null;
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
  onNewChat: () => void;
  /** Disables conversation switching while an AI request is in-flight */
  requestInFlight?: boolean;
}

export default function ConversationSidebar({
  conversations,
  loading = false,
  currentId,
  onLoad,
  onDelete,
  onNewChat,
  requestInFlight = false,
}: ConversationSidebarProps) {
  return (
    <div className="h-full w-full flex flex-col">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-border/20 flex items-center justify-between shrink-0">
        <span className="text-micro font-medium text-muted-foreground/50 uppercase tracking-wider">
          历史对话
        </span>
        <button
          onClick={onNewChat}
          aria-label="新对话"
          title="新对话"
          className="p-1 rounded-md text-muted-foreground/40 hover:text-primary hover:bg-primary/5 transition-colors cursor-pointer"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto py-1 conversation-scroll">
        {loading ? (
          <div className="px-3 py-3 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-1.5">
                <div className="h-2.5 bg-muted/40 rounded animate-pulse w-4/5" />
                <div className="h-2 bg-muted/20 rounded animate-pulse w-1/2" />
              </div>
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <p className="text-xs text-muted-foreground/30">暂无历史对话</p>
          </div>
        ) : (
          conversations.map((conv) => (
            <div
              key={conv.id}
              className={`group relative mx-1 rounded-lg transition-all duration-150 border ${
                conv.id === currentId
                  ? 'bg-primary/[0.08] border-primary/20'
                  : 'border-transparent hover:bg-muted/30 hover:border-border/30'
              }`}
            >
              <button
                onClick={() => !requestInFlight && onLoad(conv.id)}
                disabled={requestInFlight}
                className={`w-full text-left px-2.5 py-2 pr-6 ${requestInFlight ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
              >
                <p className={`text-xs leading-snug line-clamp-2 ${
                  conv.id === currentId ? 'text-foreground' : 'text-foreground/70'
                }`}>
                  {conv.title || '未命名对话'}
                </p>
                <p className="text-micro text-muted-foreground/40 mt-0.5">
                  {formatRelativeTime(conv.updated_at)}
                </p>
              </button>
              <button
                onClick={() => onDelete(conv.id)}
                aria-label={`删除对话: ${conv.title || '未命名对话'}`}
                className="absolute top-2 right-1.5 opacity-0 group-hover:opacity-100 p-0.5 text-muted-foreground/30 hover:text-red-500 transition-all duration-150 cursor-pointer"
              >
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
