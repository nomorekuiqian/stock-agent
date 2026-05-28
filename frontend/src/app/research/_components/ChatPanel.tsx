'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import ChatMessage from './ChatMessage';
import OptionChips from './OptionChips';
import ChatInput from './ChatInput';
import type { ChatMsg } from '../_lib/researchReducer';
import type { KolPersonaChunk } from '@/lib/api';

export type { ChatMsg };

export interface ToolActivity {
  tool: string;
  description: string;
  status: 'start' | 'end';
}

interface QuotaInfo {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
  unlimited: boolean;
}

interface ChatPanelProps {
  messages: ChatMsg[];
  onSend: (message: string) => void;
  loading: boolean;
  onCancelLoading?: () => void;
  inputPlaceholder?: string;
  toolActivities?: ToolActivity[];
  quota?: QuotaInfo | null;
  /** Citation chunks for the latest KOL turn — used to make [#N] clickable. */
  citations?: KolPersonaChunk[];
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
export default function ChatPanel({ messages, onSend, loading, onCancelLoading, inputPlaceholder, toolActivities = [], quota, citations }: ChatPanelProps) {
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
        className="flex-1 overflow-y-auto px-3 sm:px-4 py-4 space-y-4"
      >
        {messages.map((msg, i) => (
            <div key={msg.id}>
              <ChatMessage
                role={msg.role}
                content={msg.content}
                animate={msg.role === 'assistant' && i === lastAssistantIdx && !msg.streaming}
                isError={msg.isError}
                streaming={msg.streaming}
                thinking={msg.thinking}
                citations={i === lastAssistantIdx ? citations : undefined}
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

        {/* Agent status — shows current activity (swap in place, like ChatGPT).
            Hidden once the last assistant message starts streaming (either
            thinking or token output) — from that point the in-message progress
            UI (ThinkingLine swap → token stream) is the indicator and a second
            spinner below would be redundant. */}
        {loading && !(messages[messages.length - 1]?.role === 'assistant'
          && messages[messages.length - 1]?.streaming
          && (!!messages[messages.length - 1]?.thinking?.trim()
              || !!messages[messages.length - 1]?.content?.trim())) && (
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
              <div className="px-4 py-2.5 rounded-2xl rounded-tl-sm bg-card border border-border/60">
                {(() => {
                  const visible = toolActivities.filter(a => a.tool !== 'set_model_response');
                  const latest = visible[visible.length - 1];
                  const label = latest?.description;
                  return (
                    <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <span className="thinking-dot" />
                        <span className="thinking-dot" />
                        <span className="thinking-dot" />
                      </span>
                      {label && (
                        <span key={label} className="animate-status-label">
                          {label}
                        </span>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
            {onCancelLoading && (
              <p className="text-xs text-transparent group-hover:text-muted-foreground/70 transition-colors ml-10 mt-1">
                点击取消
              </p>
            )}
          </div>
        )}

        {/* Scroll anchor */}
        <div ref={bottomRef} />
      </div>

      {/* Scroll to bottom button */}
      {userScrolled && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-10 animate-fade-in-up">
          <button
            onClick={scrollToBottom}
            className="px-3 py-1.5 rounded-full bg-card/90 backdrop-blur-sm border border-border/50 text-xs text-muted-foreground hover:text-primary hover:border-primary/30 transition-all duration-200 shadow-lg"
          >
            <svg className="w-3 h-3 inline mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12l7 7 7-7" />
            </svg>
            最新消息
          </button>
        </div>
      )}

      {/* Input area */}
      <div className="shrink-0 px-3 sm:px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
        <ChatInput
          onSubmit={onSend}
          loading={loading}
          onCancel={onCancelLoading}
          placeholder={inputPlaceholder}
          quota={quota}
        />
      </div>
    </div>
  );
}
