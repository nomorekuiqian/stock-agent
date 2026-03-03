'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import ChatMessage from './ChatMessage';
import OptionChips from './OptionChips';
import TypingIndicator from './TypingIndicator';
import ChatInput from './ChatInput';
import type { ChatMsg } from '../_lib/pickerReducer';

export type { ChatMsg };

interface ChatPanelProps {
  messages: ChatMsg[];
  onSend: (message: string) => void;
  loading: boolean;
  inputPlaceholder?: string;
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
export default function ChatPanel({ messages, onSend, loading, inputPlaceholder }: ChatPanelProps) {
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
    <div className="flex flex-col h-full">
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

        {/* Typing indicator */}
        {loading && <TypingIndicator />}

        {/* Scroll anchor */}
        <div ref={bottomRef} />
      </div>

      {/* Scroll to bottom button */}
      {userScrolled && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-10">
          <button
            onClick={scrollToBottom}
            className="px-3 py-1.5 rounded-full bg-zinc-800 border border-border/30 text-xs text-zinc-400 hover:text-zinc-200 transition-colors shadow-lg"
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
