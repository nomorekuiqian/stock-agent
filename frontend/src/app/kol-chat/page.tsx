'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowUp, Bot, Loader2, MessageSquare, Square, UserRound } from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import {
  api,
  type MethodologyCategory,
  type MethodologyChatMessage,
  type MethodologyCitation,
} from '@/lib/api';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  category?: MethodologyCategory;
  citations?: MethodologyCitation[];
  confidence?: 'high' | 'medium' | 'low';
  limitations?: string[];
  suggestedFollowups?: string[];
};

const CATEGORY_LABELS: Record<MethodologyCategory, string> = {
  stock_analysis: '个股',
  sector_analysis: '板块',
  macro_analysis: '宏观',
  trading_strategy: '交易',
  risk_management: '风控',
  methodology: '方法论',
};

const CATEGORY_OPTIONS: { value: MethodologyCategory | null; label: string }[] = [
  { value: null, label: '自动' },
  { value: 'stock_analysis', label: '个股' },
  { value: 'macro_analysis', label: '宏观' },
  { value: 'sector_analysis', label: '板块' },
  { value: 'trading_strategy', label: '交易' },
  { value: 'methodology', label: '方法论' },
];

const STARTERS = [
  '按他的框架，现在怎么看 NVDA 财报后的风险？',
  '如果美联储延后降息，他会先看哪些流动性指标？',
  'AI 基建这条主线，什么情况下算被证伪？',
  '现在想抄底科技股，他的方法论会怎么拆？',
];

const WELCOME_MESSAGE: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content:
    '你可以问一个标的、一个宏观事件，或者直接问“按 qinbafrank 的框架会怎么拆”。我会基于已蒸馏的方法论回答，并标出使用到的推文证据。',
  category: 'methodology',
  confidence: 'medium',
};

function confidenceLabel(value?: 'high' | 'medium' | 'low') {
  if (value === 'high') return '高';
  if (value === 'medium') return '中';
  if (value === 'low') return '低';
  return '未标注';
}

export default function KolChatPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [category, setCategory] = useState<MethodologyCategory | null>(null);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [isSending, setIsSending] = useState(false);
  const [isLoadingConversation, setIsLoadingConversation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const conversationIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (authLoading || !isAuthenticated) return;

    let cancelled = false;
    setIsLoadingConversation(true);
    api.twitterMethodology.conversations
      .latest('qinbafrank')
      .then((conversation) => {
        if (cancelled) return;
        if (!conversation) {
          setMessages([WELCOME_MESSAGE]);
          conversationIdRef.current = null;
          return;
        }

        conversationIdRef.current = conversation.id;
        if (conversation.data?.category !== undefined) {
          setCategory(conversation.data.category);
        }

        const restored = Array.isArray(conversation.data?.messages)
          ? (conversation.data.messages as ChatMessage[]).filter(
              (message) =>
                message &&
                (message.role === 'user' || message.role === 'assistant') &&
                typeof message.content === 'string',
            )
          : [];
        setMessages(restored.length ? restored : [WELCOME_MESSAGE]);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : '加载历史对话失败');
      })
      .finally(() => {
        if (!cancelled) setIsLoadingConversation(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, isAuthenticated]);

  const apiHistory = useMemo<MethodologyChatMessage[]>(() => {
    return messages
      .filter((message) => message.id !== 'welcome')
      .slice(-8)
      .map((message) => ({
        role: message.role,
        content: message.content,
      }));
  }, [messages]);

  const persistConversation = useCallback(
    async (nextMessages: ChatMessage[], nextCategory: MethodologyCategory | null = category) => {
      const savedMessages = nextMessages.filter((message) => message.id !== 'welcome');
      if (!savedMessages.length) return;

      const firstUserMessage = savedMessages.find((message) => message.role === 'user');
      const title = firstUserMessage?.content.slice(0, 60) || 'qinbafrank 方法论对话';
      const payload = {
        username: 'qinbafrank',
        title,
        message_count: savedMessages.length,
        data: {
          username: 'qinbafrank',
          category: nextCategory,
          messages: savedMessages,
        },
      };

      try {
        if (conversationIdRef.current) {
          await api.twitterMethodology.conversations.update(
            conversationIdRef.current,
            payload,
          );
          return;
        }
        const created = await api.twitterMethodology.conversations.create(payload);
        conversationIdRef.current = created.id;
      } catch (err) {
        console.warn('[KolChat] Failed to persist conversation', err);
      }
    },
    [category],
  );

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed,
    };
    const messagesWithUser = [...messages, userMessage];
    setMessages(messagesWithUser);
    setInput('');
    setError(null);
    setStatus(null);
    setIsSending(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      await persistConversation(messagesWithUser);
      const result = await api.twitterMethodology.chat({
        username: 'qinbafrank',
        message: trimmed,
        category,
        history: apiHistory,
      }, {
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: result.answer,
        category: result.category,
        citations: result.citations,
        confidence: result.confidence,
        limitations: result.limitations,
        suggestedFollowups: result.suggested_followups,
      };
      const messagesWithAssistant = [...messagesWithUser, assistantMessage];
      setMessages(messagesWithAssistant);
      await persistConversation(messagesWithAssistant, result.category);
    } catch (err) {
      if (controller.signal.aborted) {
        setStatus('已停止本次生成，可以修改问题后重新发送。');
      } else {
        setError(err instanceof Error ? err.message : '发送失败');
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
        setIsSending(false);
      }
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  function stopGeneration() {
    abortControllerRef.current?.abort();
    setStatus('正在停止本次生成...');
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(input);
  }

  if (authLoading || (isAuthenticated && isLoadingConversation)) {
    return (
      <main className="min-h-screen bg-background pt-24">
        <div className="max-w-5xl mx-auto px-4 md:px-6 flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="min-h-screen bg-background pt-24">
        <div className="max-w-xl mx-auto px-4 md:px-6 py-20 text-center">
          <h1 className="font-editorial text-3xl text-foreground">qinbafrank 方法论对话</h1>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">
            登录后使用已蒸馏的 KOL 方法论进行对话。
          </p>
          <Link
            href="/login?redirect=/kol-chat"
            className="mt-8 inline-flex h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-medium text-white transition-colors hover:bg-primary/90"
          >
            前往登录
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background pt-20">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-8 md:py-10">
        <div className="grid min-h-[calc(100vh-8rem)] gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
            <div>
              <div className="flex items-center gap-2 text-primary">
                <MessageSquare className="w-4 h-4" />
                <span className="text-xs font-semibold uppercase tracking-[0.18em]">KOL Methodology</span>
              </div>
              <h1 className="mt-3 font-editorial text-3xl text-foreground">
                qinbafrank 方法论对话
              </h1>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                基于公开推文蒸馏体回答，不代表本人观点。涉及实时行情和交易决策时，会提示需要补充最新数据确认。
              </p>
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs font-medium text-muted-foreground mb-3">方法论范围</p>
              <div className="grid grid-cols-3 gap-2">
                {CATEGORY_OPTIONS.map((option) => {
                  const active = category === option.value;
                  return (
                    <button
                      key={option.label}
                      type="button"
                      onClick={() => setCategory(option.value)}
                      className={`h-9 rounded-md border px-2 text-sm transition-colors ${
                        active
                          ? 'border-primary bg-primary text-white'
                          : 'border-border bg-background text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs font-medium text-muted-foreground mb-3">可以这样问</p>
              <div className="space-y-2">
                {STARTERS.map((starter) => (
                  <button
                    key={starter}
                    type="button"
                    onClick={() => {
                      setInput(starter);
                      requestAnimationFrame(() => inputRef.current?.focus());
                    }}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-left text-sm leading-6 text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                  >
                    {starter}
                  </button>
                ))}
              </div>
            </div>
          </aside>

          <section className="flex min-h-[640px] flex-col rounded-lg border border-border bg-card shadow-sm">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <p className="text-sm font-medium text-foreground">对话</p>
                <p className="text-xs text-muted-foreground">
                  当前范围：{category ? CATEGORY_LABELS[category] : '自动路由'}
                </p>
              </div>
              <div className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground">
                qinbafrank
              </div>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-4 py-5">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {message.role === 'assistant' && (
                    <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Bot className="w-4 h-4" />
                    </div>
                  )}
                  <div
                    className={`max-w-[min(720px,85%)] rounded-lg px-4 py-3 ${
                      message.role === 'user'
                        ? 'bg-primary text-white'
                        : 'border border-border bg-background text-foreground'
                    }`}
                  >
                    <div className="whitespace-pre-wrap text-sm leading-7">{message.content}</div>
                    {message.role === 'assistant' && (
                      <div className="mt-3 space-y-3">
                        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                          {message.category && (
                            <span className="rounded-md bg-muted px-2 py-1">
                              {CATEGORY_LABELS[message.category]}
                            </span>
                          )}
                          <span className="rounded-md bg-muted px-2 py-1">
                            置信度：{confidenceLabel(message.confidence)}
                          </span>
                        </div>

                        {!!message.citations?.length && (
                          <div className="space-y-2 border-t border-border pt-3">
                            <p className="text-xs font-medium text-muted-foreground">引用证据</p>
                            {message.citations.map((citation) => (
                              <div key={`${message.id}-${citation.tweet_id}-${citation.quote}`} className="rounded-md bg-muted/60 px-3 py-2">
                                <p className="text-xs text-muted-foreground">tweet_id: {citation.tweet_id}</p>
                                <p className="mt-1 text-sm leading-6 text-foreground">“{citation.quote}”</p>
                                <p className="mt-1 text-xs leading-5 text-muted-foreground">{citation.reason}</p>
                              </div>
                            ))}
                          </div>
                        )}

                        {!!message.limitations?.length && (
                          <div className="border-t border-border pt-3">
                            <p className="text-xs font-medium text-muted-foreground">限制</p>
                            <ul className="mt-2 space-y-1 text-xs leading-5 text-muted-foreground">
                              {message.limitations.map((item) => (
                                <li key={item}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {!!message.suggestedFollowups?.length && (
                          <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                            {message.suggestedFollowups.map((followup) => (
                              <button
                                key={followup}
                                type="button"
                                onClick={() => void sendMessage(followup)}
                                className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                              >
                                {followup}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {message.role === 'user' && (
                    <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <UserRound className="w-4 h-4" />
                    </div>
                  )}
                </div>
              ))}
              {isSending && (
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  正在按方法论拆解...
                </div>
              )}
            </div>

            {error && (
              <div className="mx-4 mb-3 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {status && (
              <div className="mx-4 mb-3 rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                {status}
              </div>
            )}

            <form onSubmit={handleSubmit} className="border-t border-border p-3">
              <div className="flex gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void sendMessage(input);
                    }
                  }}
                  rows={2}
                  placeholder="问 qinbafrank 方法论会怎么拆这个问题..."
                  className="min-h-[52px] flex-1 resize-none rounded-lg border border-border bg-background px-3 py-3 text-sm leading-6 text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
                />
                {isSending ? (
                  <button
                    type="button"
                    onClick={stopGeneration}
                    aria-label="停止生成"
                    className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive"
                  >
                    <Square className="w-4 h-4 fill-current" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!input.trim()}
                    aria-label="发送"
                    className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-lg bg-primary text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ArrowUp className="w-5 h-5" />
                  </button>
                )}
              </div>
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}
