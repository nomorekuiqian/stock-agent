'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { ChevronDown } from 'lucide-react';
import ChatMessage from './ChatMessage';
import OptionChips from './OptionChips';
import ChatInput from './ChatInput';
import AssistantAvatar from './AssistantAvatar';
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
  /** Username shown as a persona chip directly above the input. */
  personaUsername?: string | null;
}

/**
 * ChatPanel - Left side chat interface.
 *
 * Features:
 * - Message list with auto-scroll (paused when user scrolls up)
 * - Typing indicator while AI is thinking
 * - Newest AI message gets word-by-word animation
 * - Option chips under AI messages
 */
export default function ChatPanel({ messages, onSend, loading, onCancelLoading, inputPlaceholder, toolActivities = [], quota, citations, personaUsername }: ChatPanelProps) {
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

  // Auto-scroll to bottom on new messages AND as the streaming answer grows.
  // The last message is mutated in place during streaming (its array length
  // doesn't change), so we also key the effect on its content/thinking. While
  // streaming we use instant scroll so rapid growth follows tightly without
  // smooth-scroll animations stacking/fighting each other.
  const lastMsg = messages[messages.length - 1];
  useEffect(() => {
    if (!userScrolled) {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: lastMsg?.streaming ? 'auto' : 'smooth',
      });
    }
  }, [messages.length, lastMsg?.content, lastMsg?.thinking, lastMsg?.streaming, loading, userScrolled]);

  // Find the last assistant message index for animation
  const lastAssistantIdx = messages.reduce(
    (acc, msg, i) => (msg.role === 'assistant' ? i : acc),
    -1,
  );

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Messages area */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        data-testid="research-chat-scroll"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 sm:px-4 py-4 space-y-4"
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
                personaUsername={personaUsername}
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
            className={onCancelLoading ? 'cursor-pointer group animate-msg-enter' : 'animate-msg-enter'}
            title={onCancelLoading ? '点击取消' : undefined}
          >
            {/* Mirror ChatMessage AI layout: avatar column + content column, no bubble. */}
            <div className="flex gap-2 sm:gap-3">
              <div className="flex flex-col items-center shrink-0">
                <AssistantAvatar personaUsername={personaUsername} gradientIdSuffix="status" />
                <div aria-hidden className="flex-1 w-px bg-border/50 mt-1.5 min-h-2" />
              </div>

              {/* Single status line — shows current activity, swaps in place */}
              <div className="flex-1 min-w-0 pt-1.5">
                {(() => {
                  const visible = toolActivities.filter(a => a.tool !== 'set_model_response');
                  const latest = visible[visible.length - 1];
                  const label = latest?.description;
                  return (
                    <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
                      <span key={label || 'thinking'} className="animate-status-label animate-pulse-subtle">
                        {label || '正在思考…'}
                      </span>
                    </div>
                  );
                })()}
                {onCancelLoading && (
                  <p className="text-xs text-transparent group-hover:text-muted-foreground/70 transition-colors mt-1">
                    点击取消
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Scroll anchor */}
        <div ref={bottomRef} />
      </div>

      {/* Jump to latest — appears when the user has scrolled up. */}
      {userScrolled && messages.length > 0 && (
        <button
          type="button"
          onClick={() => {
            scrollRef.current?.scrollTo({
              top: scrollRef.current.scrollHeight,
              behavior: 'smooth',
            });
            setUserScrolled(false);
          }}
          aria-label="跳到最新"
          className="absolute bottom-24 left-1/2 z-20 inline-flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-popover/90 px-3 py-1.5 text-xs text-muted-foreground shadow-md backdrop-blur transition-colors hover:text-foreground animate-fade-in"
        >
          <ChevronDown className="h-3.5 w-3.5" />
          跳到最新
        </button>
      )}

      {/* Input area */}
      <div className="shrink-0 px-3 sm:px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
        {personaUsername && (
          <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              @{personaUsername} 视角
            </span>
            <span className="text-muted-foreground/70">按博主公开方法论作答</span>
          </div>
        )}
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
