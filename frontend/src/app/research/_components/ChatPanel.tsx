'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import ChatMessage from './ChatMessage';
import OptionChips from './OptionChips';
import ChatInput from './ChatInput';
import type { ChatMsg } from '../_lib/researchReducer';

export type { ChatMsg };

export interface ToolActivity {
  tool: string;
  description: string;
  status: 'start' | 'end';
}

interface ChatPanelProps {
  messages: ChatMsg[];
  onSend: (message: string) => void;
  loading: boolean;
  onCancelLoading?: () => void;
  inputPlaceholder?: string;
  toolActivities?: ToolActivity[];
}

/**
 * ChatPanel - Left side chat interface.
 *
 * Features:
 * - Message list with auto-scroll
 * - "Scroll to bottom" button when user scrolls up
 * - Typing indicator while AI is thinking
 * - Newest AI message gets word-by-word animation
 * - Option chips under AI messages
 */
export default function ChatPanel({ messages, onSend, loading, onCancelLoading, inputPlaceholder, toolActivities = [] }: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [userScrolled, setUserScrolled] = useState(false);

  // Detect user scroll up
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    setUserScrolled(!atBottom);
  }, []);

  // Auto-scroll to bottom on new messages (unless user scrolled up)
  useEffect(() => {
    if (!userScrolled) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, loading, userScrolled]);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    setUserScrolled(false);
  };

  // Find the last assistant message index for animation
  const lastAssistantIdx = messages.reduce(
    (acc, msg, i) => (msg.role === 'assistant' ? i : acc),
    -1,
  );

  return (
    <div className="relative flex flex-col h-full">
      {/* Messages area */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
      >
        {messages.map((msg, i) => (
          <div key={msg.id}>
            <ChatMessage
              role={msg.role}
              content={msg.content}
              animate={msg.role === 'assistant' && i === lastAssistantIdx}
              isError={msg.isError}
            />
            {msg.role === 'assistant' && msg.options && msg.options.length > 0 && (
              <OptionChips
                options={msg.options}
                onSelect={(value) => {
                  if (!msg.selectedOption && !loading) onSend(value);
                }}
                disabled={!!msg.selectedOption || loading}
                selectedValue={msg.selectedOption}
              />
            )}
          </div>
        ))}

        {/* Agent status — shows current activity (swap in place, like ChatGPT) */}
        {loading && (
          <div
            onClick={onCancelLoading}
            className={onCancelLoading ? 'cursor-pointer group' : ''}
            title={onCancelLoading ? '点击取消' : undefined}
          >
            <div className="flex items-start gap-3 animate-msg-enter">
              {/* AI avatar */}
              <div className="shrink-0 w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                <svg className="w-4 h-4" viewBox="0 0 32 32" fill="none">
                  <path
                    d="M4 24V12L10 6V24M10 6L16 14L22 6M22 6V24M28 24V12L22 6"
                    stroke="url(#status-avatar-grad)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <defs>
                    <linearGradient id="status-avatar-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#10B981" />
                      <stop offset="100%" stopColor="#6EE7B7" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>

              {/* Single status line — shows current activity, swaps in place */}
              <div className="px-4 py-2.5 rounded-2xl rounded-tl-sm bg-card border border-border/50">
                {(() => {
                  // Show the last user-facing tool's description (regardless of start/end status,
                  // because React batching may merge them in the same render)
                  const visible = toolActivities.filter(a => a.tool !== 'set_model_response');
                  const latest = visible[visible.length - 1];
                  const label = latest?.description || '正在思考...';
                  const isActive = latest?.status === 'start';
                  return (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {isActive ? (
                        <span className="inline-block w-3 h-3 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <span className="inline-block w-3 h-3 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                      )}
                      <span>{label}</span>
                    </div>
                  );
                })()}
              </div>
            </div>
            {onCancelLoading && (
              <p className="text-micro text-muted-foreground/0 group-hover:text-muted-foreground/60 transition-colors ml-10 mt-1">
                点击取消等待
              </p>
            )}
          </div>
        )}

        {/* Scroll anchor */}
        <div ref={bottomRef} />
      </div>

      {/* Scroll to bottom button */}
      {userScrolled && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-10">
          <button
            onClick={scrollToBottom}
            className="px-3 py-1.5 rounded-full bg-card border border-border/50 text-xs text-muted-foreground hover:text-foreground transition-colors shadow-lg"
          >
            <svg className="w-3 h-3 inline mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12l7 7 7-7" />
            </svg>
            最新消息
          </button>
        </div>
      )}

      {/* Input area */}
      <div className="shrink-0 px-4 pb-4 pt-2">
        <ChatInput
          onSubmit={onSend}
          loading={loading}
          placeholder={inputPlaceholder}
        />
      </div>
    </div>
  );
}
