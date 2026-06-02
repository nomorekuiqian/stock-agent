'use client';

import { useReducer, useCallback, useEffect, useState, useRef, Suspense, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';
import { useInfiniteQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { api } from '@/lib/api';
import { getAuthErrorPresentation } from '@/lib/auth-error-presentation';
import { marketTodayStr } from '@/lib/timezone';
import { queryKeys } from '@/hooks/queries/query-keys';
import type { ConversationSummary, ResearchRequest, ResearchResult } from '@/lib/api';
import {
  researchReducer,
  initialState,
  loadState,
  saveState,
  STORAGE_KEY,
} from './_lib/researchReducer';
import type { ChatMsg, LoadConversationData } from './_lib/researchReducer';
import type { StockPanelContextPayload as StockContextPayload } from './_components/panel/StockPanelView';
import type { DailyReportContextPayload } from './_components/DailyReportView';
import type { MorningReportContextPayload } from './_components/MorningReportView';
import type { MacroPanelContextPayload } from './_components/panel/MacroPanelView';
import type { BrewContextPayload } from './_components/BrewDigestView';
import WelcomeScreen from './_components/WelcomeScreen';
import ChatPanel from './_components/ChatPanel';
import ContentPanel from './_components/ContentPanel';
import ConversationSidebar from './_components/ConversationSidebar';
import MobileTabSwitch from './_components/MobileTabSwitch';
import { type AgentKind } from './_components/PersonaSelector';
import KolChunksPanel from './_components/KolChunksPanel';
import type { KolPersonaChunk, KolResearchStreamEvent } from '@/lib/api';
import { useFeatureFlags } from '@/hooks/use-feature-flags';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RESEARCH_HISTORY_LIMIT = 24;
const KOL_HISTORY_LIMIT = 20;
const HISTORY_MESSAGE_CHAR_LIMIT = 2000;
const RESEARCH_MESSAGE_CHAR_LIMIT = 500;
const KOL_MESSAGE_CHAR_LIMIT = 4000;
const AGENT_STUCK_TIMEOUT_MS = 140_000;
const CONVERSATIONS_PAGE_SIZE = 20;
const CONVERSATIONS_STALE_TIME_MS = 10 * 60 * 1000;
const CONVERSATIONS_GC_TIME_MS = 60 * 60 * 1000;
const CONVERSATIONS_STORAGE_MAX_AGE_MS = 60 * 60 * 1000;
const MAX_QUOTA = { allowed: true, used: 0, limit: 0, remaining: 0, unlimited: true };

type ApiHistoryMessage = { role: 'user' | 'assistant'; content: string };
type ConversationListPage = { conversations: ConversationSummary[]; has_more?: boolean };
type ConversationListInfiniteData = InfiniteData<ConversationListPage, number>;
type StoredConversationList = {
  updatedAt: number;
  data: ConversationListInfiniteData;
};

function getConversationStorageKey(userId: string): string {
  return `research_conversations_cache_v1:${userId}`;
}

function readStoredConversations(userId: string): StoredConversationList | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = localStorage.getItem(getConversationStorageKey(userId));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<StoredConversationList>;
    if (
      !parsed ||
      typeof parsed.updatedAt !== 'number' ||
      Date.now() - parsed.updatedAt > CONVERSATIONS_STORAGE_MAX_AGE_MS ||
      !parsed.data ||
      !Array.isArray(parsed.data.pages) ||
      !Array.isArray(parsed.data.pageParams)
    ) {
      return undefined;
    }
    return parsed as StoredConversationList;
  } catch {
    return undefined;
  }
}

function writeStoredConversations(userId: string, data: ConversationListInfiniteData): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      getConversationStorageKey(userId),
      JSON.stringify({ updatedAt: Date.now(), data }),
    );
  } catch {
    // Browser storage can be unavailable or full; React Query cache still works.
  }
}

function dedupeConversations(pages: ConversationListPage[]): ConversationSummary[] {
  const seen = new Set<string>();
  const result: ConversationSummary[] = [];
  for (const page of pages) {
    for (const conversation of page.conversations || []) {
      if (seen.has(conversation.id)) continue;
      seen.add(conversation.id);
      result.push(conversation);
    }
  }
  return result;
}

function formatConversationTitle(agentTitle: string): string {
  const now = new Date();
  const dateStr = `${now.getMonth() + 1}月${now.getDate()}日`;
  return agentTitle ? `${dateStr} · ${agentTitle}` : dateStr;
}

function truncateHistoryContent(content: string): string {
  const normalized = content.trim();
  if (normalized.length <= HISTORY_MESSAGE_CHAR_LIMIT) return normalized;
  return `${normalized.slice(0, HISTORY_MESSAGE_CHAR_LIMIT)}\n[历史消息已截断]`;
}

function buildCompactHistory(
  messages: ChatMsg[],
  limit: number,
): ApiHistoryMessage[] {
  return messages
    .filter((m) => (
      (m.role === 'user' || m.role === 'assistant') &&
      !m.isError &&
      !m.streaming &&
      m.content.trim().length > 0
    ))
    .slice(-limit)
    .map((m) => ({
      role: m.role,
      content: truncateHistoryContent(m.content),
    }));
}

function getAgentErrorMessage(event: {
  message?: string;
  error?: string;
  code?: string;
  detail?: string;
  status?: number;
  quota_exceeded?: unknown;
}): string {
  if (event.quota_exceeded) {
    return '今日免费提问次数已用完。点击输入框下方的「升级 Max」即可解锁无限使用。';
  }
  if (event.code === 'context_too_long') {
    return '对话上下文太长了。系统会保留最近重点，请重新发送一次。';
  }
  if (event.code === 'agent_timeout') {
    return 'AI 助手思考时间太长了，请简化问题后再试一次。';
  }
  if (event.code === 'model_schema_error') {
    return 'AI 助手输出格式异常，请重新发送一次。';
  }
  if (event.code === 'agent_setup_error') {
    return 'AI 助手启动失败，请检查后端日志后再试一次。';
  }
  if (event.code === 'auth_error') {
    return '登录已过期，请刷新页面或重新登录。';
  }
  if (event.code === 'http_error') {
    const suffix = event.error || event.detail ? `：${event.error || event.detail}` : '';
    return event.status
      ? `后端返回 ${event.status} 错误${suffix}`
      : `后端返回错误${suffix}`;
  }
  if (event.code === 'client_timeout') {
    return '前端等待超时，后端可能仍在思考。请缩短问题或重新发送。';
  }
  if (event.code === 'network_error') {
    return '连接后端失败，请确认本地后端还在运行。';
  }
  if (event.code === 'stream_no_final') {
    return '连接中断，未收到最终回答。常见原因是后端热重载、SSE 被中断或本地服务重启。请重新发送一次。';
  }
  return event.message || event.error || 'AI 助手暂时无法响应';
}

function getContextKey(contextType: string, params: URLSearchParams): string {
  if (contextType === 'daily_report') return `daily_report:${params.get('date') || ''}`;
  if (contextType === 'morning_report') return `morning_report:${params.get('date') || ''}`;
  if (contextType === 'stock') return `stock:${params.get('symbol') || ''}`;
  if (contextType === 'brew') return `brew:${params.get('digestId') || ''}`;
  return contextType; // e.g. 'macro'
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

function ScreenerContent() {
  const router = useRouter();
  const { isLoading: authLoading, signOut, user } = useAuth();
  const { isPro, isMax, isLoading: subLoading } = useSubscription();
  const queryClient = useQueryClient();
  const userId = user?.id ?? null;
  const userTier: 'max' | 'pro' | null = isMax ? 'max' : isPro ? 'pro' : null;
  const [state, dispatch] = useReducer(researchReducer, initialState, loadState);
  const [mobileTab, setMobileTab] = useState<'chat' | 'results'>('chat');
  const [historyOpen, setHistoryOpen] = useState(true);
  const prevPhaseRef = useRef(state.phase);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [quota, setQuota] = useState<{ allowed: boolean; used: number; limit: number; remaining: number; unlimited: boolean } | null>(null);
  // KOL persona / agent kind are *derived* from reducer state so that they
  // survive sessionStorage rehydration. Without this, a page reload would
  // drop personaUsername back to null, and the next message on a KOL
  // conversation would be routed through the research save path — quietly
  // overwriting the conversation's kol_chunks / persona_username on backend.
  const personaUsername = state.personaUsername;
  const agentKind: AgentKind = personaUsername ? 'kol_research' : 'research';
  const setPersonaUsername = useCallback((u: string | null) => {
    dispatch({ type: 'SET_PERSONA', personaUsername: u });
  }, []);
  // setAgentKind is preserved as a no-op shim for call sites that used to set
  // it directly; the actual source of truth is personaUsername.
  const setAgentKind = useCallback((_kind: AgentKind) => {
    // Intentional no-op. agentKind is derived from personaUsername; callers
    // should setPersonaUsername(null) to switch off KOL mode.
  }, []);
  // KOL citation chunks now live in reducer state (state.kolChunks) so they
  // survive sessionStorage rehydration and LOAD_CONVERSATION. The cast is
  // a thin bridge from the loose reducer type to the typed api shape.
  const latestKolChunks = state.kolChunks as unknown as KolPersonaChunk[];
  const { has: hasFlag } = useFeatureFlags();
  const kolPersonaEnabled = hasFlag('kol_research_agent');
  const stockContextRef = useRef<StockContextPayload | null>(null);
  const reportContextRef = useRef<DailyReportContextPayload | null>(null);
  const morningContextRef = useRef<MorningReportContextPayload | null>(null);
  const macroPanelContextRef = useRef<MacroPanelContextPayload | null>(null);
  const brewContextRef = useRef<BrewContextPayload | null>(null);
  const convCache = useRef<Map<string, Record<string, unknown>>>(new Map());
  const pendingSeed = useRef<string | null>(null);
  const pendingSeedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSendRef = useRef<((message: string) => Promise<void>) | null>(null);
  const searchParams = useSearchParams();
  const contextInitialized = useRef(false);
  const skipPanelSaveRef = useRef(true);
  const latestStateRef = useRef(state);
  const conversationUserId = userId ?? 'anonymous';
  const conversationListQueryKey = useMemo(
    () => queryKeys.research.conversations(conversationUserId, CONVERSATIONS_PAGE_SIZE),
    [conversationUserId],
  );
  const shouldLoadConversations = !authLoading && !!userId && (state.phase === 'welcome' || historyOpen);
  const storedConversationList = useMemo(
    () => (userId ? readStoredConversations(userId) : undefined),
    [userId],
  );
  const conversationsQuery = useInfiniteQuery<
    ConversationListPage,
    Error,
    ConversationListInfiniteData,
    typeof conversationListQueryKey,
    number
  >({
    queryKey: conversationListQueryKey,
    queryFn: ({ pageParam }) => api.research.conversations.list({
      limit: CONVERSATIONS_PAGE_SIZE,
      offset: pageParam,
    }),
    enabled: shouldLoadConversations,
    initialPageParam: 0,
    initialData: storedConversationList?.data,
    initialDataUpdatedAt: storedConversationList?.updatedAt,
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage.has_more) return undefined;
      return allPages.reduce((offset, page) => offset + (page.conversations?.length ?? 0), 0);
    },
    staleTime: CONVERSATIONS_STALE_TIME_MS,
    gcTime: CONVERSATIONS_GC_TIME_MS,
    refetchOnWindowFocus: false,
  });
  const conversations = useMemo(
    () => dedupeConversations(conversationsQuery.data?.pages ?? []),
    [conversationsQuery.data],
  );
  const conversationsLoaded =
    !!conversationsQuery.data || !shouldLoadConversations || !conversationsQuery.isLoading;
  const hasMoreConversations = !!conversationsQuery.hasNextPage;
  const loadingMoreConversations = conversationsQuery.isFetchingNextPage;
  const effectiveQuota = isMax ? MAX_QUOTA : quota;

  useEffect(() => {
    latestStateRef.current = state;
  }, [state]);

  // URL parameter-driven context entry (e.g. /screener?context=daily_report&date=2026-03-19)
  // Uses CONTEXT_ENTRY action to skip welcome and start in chat+loading phase.
  // Sets a pendingSeed message that will be auto-sent when the content panel data is ready.
  // On page refresh, if the session already has this context active, we skip CONTEXT_ENTRY
  // to preserve the existing conversationId instead of starting a new conversation.
  useEffect(() => {
    if (contextInitialized.current) return;
    const contextType = searchParams.get('context');
    if (!contextType) return;
    contextInitialized.current = true;

    const contextKey = getContextKey(contextType, searchParams);

    // On page reload, preserve the existing conversation instead of starting a new one.
    // On fresh navigation (e.g. clicking a link from another page), always start fresh.
    const navType = (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type;
    if (navType === 'reload') {
      try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (raw) {
          const saved = JSON.parse(raw) as { phase?: string; contextEntryKey?: string };
          if (saved.phase === 'chat' && saved.contextEntryKey === contextKey) {
            return;
          }
        }
      } catch { /* ignore */ }
    }

    if (contextType === 'daily_report') {
      const date = searchParams.get('date') || '';
      dispatch({
        type: 'CONTEXT_ENTRY',
        key: contextKey,
        content: {
          type: 'daily_report',
          label: date ? `${date} 市场日报` : '市场日报',
          summary: '',
          params: date ? { date } : {},
          available_actions: ['追问日报内容', '查看提到的个股', '查看宏观背景'],
        },
      });
      pendingSeed.current = date
        ? `帮我解读 ${date} 的市场日报`
        : '帮我解读今天的市场日报';
    } else if (contextType === 'morning_report') {
      const date = searchParams.get('date') || '';
      dispatch({
        type: 'CONTEXT_ENTRY',
        key: contextKey,
        content: {
          type: 'morning_report',
          label: date ? `${date} 盘前早报` : '盘前早报',
          summary: '',
          params: date ? { date } : {},
          available_actions: ['解读早报要点', '分析期货动向', '看今日市场焦点'],
        },
      });
      pendingSeed.current = date
        ? `帮我解读 ${date} 的盘前早报`
        : '帮我看看今早的盘前早报';
    } else if (contextType === 'macro') {
      dispatch({
        type: 'CONTEXT_ENTRY',
        key: contextKey,
        content: {
          type: 'macro',
          label: '宏观风险仪表盘',
          summary: '',
          params: {},
          available_actions: ['深入某个维度', '查看对持仓影响', '返回选股'],
        },
      });
      pendingSeed.current = '帮我看看当前宏观环境';
    } else if (contextType === 'stock') {
      const symbol = searchParams.get('symbol');
      if (symbol) {
        dispatch({
          type: 'CONTEXT_ENTRY',
          key: contextKey,
          content: {
            type: 'stock',
            label: `${symbol} 个股研究`,
            summary: symbol,
            params: { symbol },
            available_actions: ['查看基本面', '技术分析', '返回选股'],
          },
        });
        pendingSeed.current = `帮我分析一下 ${symbol}`;
      }
    } else if (contextType === 'brew') {
      const digestId = searchParams.get('digestId') || '';
      dispatch({
        type: 'CONTEXT_ENTRY',
        key: contextKey,
        content: {
          type: 'brew',
          label: '专属日报',
          summary: '',
          params: digestId ? { digestId } : {},
          available_actions: ['追问持仓表现', '查看个股详情', '查看宏观背景'],
        },
      });
      pendingSeed.current = '帮我看看今天我的持仓情况';
    }
  }, [searchParams, dispatch]);

  // KOL persona URL entry — /research?agent=kol&persona=qinbafrank&q=...
  // Legacy symbol-only links are converted into a default ticker question.
  // Used by `/kol/[username]` overview, sector detail pages, etc to deep-link
  // into a KOL chat with a starter question. Re-processes on every URL change
  // (so clicking a second starter from a different page picks up the new q),
  // and dispatches RESET when q is present so each starter opens a fresh chat
  // — prior in-flight conversation, if any, is auto-saved via handleSend and
  // accessible from the history sidebar.
  const lastProcessedKolSeed = useRef('');
  useEffect(() => {
    const agentParam = searchParams.get('agent');
    const personaParam = searchParams.get('persona');
    if (agentParam !== 'kol' || !personaParam) return;

    // Always re-assert agent kind + persona on every KOL URL visit. If the
    // user toggled away via PersonaSelector and then came back through a
    // same-URL link, gating these by signature would leave agentKind stuck
    // on 'research'. React's setState bails out on unchanged values, so this
    // is free when nothing changed.
    setAgentKind('kol_research');
    setPersonaUsername(personaParam);

    // Seed gate fires once per (persona, q) tuple — prevents the same
    // starter URL from RESET-ing the conversation again if the user
    // navigates away and back without changing q. Empty q is never seeded.
    let seedQ = searchParams.get('q') ?? '';
    const symbolParam = searchParams.get('symbol')?.trim();
    if (!seedQ && symbolParam) {
      const personaName =
        personaParam.toLowerCase() === 'qinbafrank' ? 'Frank' : `@${personaParam}`;
      seedQ = `按 ${personaName} 的框架分析 ${symbolParam.toUpperCase()}：他怎么看这个标的、核心逻辑是什么、有哪些原文依据？`;
    }
    if (!seedQ) return;
    const signature = `${personaParam}|${seedQ}`;
    if (lastProcessedKolSeed.current === signature) return;
    lastProcessedKolSeed.current = signature;

    // Seeded entries always start a fresh conversation — drop current state
    // (saved server-side already) so the seed becomes turn 1.
    dispatch({ type: 'RESET' });
    pendingSeed.current = seedQ;
    if (pendingSeedTimerRef.current) clearTimeout(pendingSeedTimerRef.current);
    // Slightly longer delay than CONTEXT_ENTRY path because we don't gate on
    // content panel ready — just wait for the RESET / agentKind / persona
    // state updates to flush through React before triggering handleSend.
    pendingSeedTimerRef.current = setTimeout(() => {
      pendingSeedTimerRef.current = null;
      const msg = pendingSeed.current;
      if (!msg) return;
      pendingSeed.current = null;
      handleSendRef.current?.(msg);
    }, 250);
  }, [searchParams]);

  // Persist state to sessionStorage on change
  useEffect(() => {
    saveState(state);
  }, [state]);

  // Persist the paginated sidebar list so returning to /research does not
  // re-fetch the same lightweight history page on every mount.
  useEffect(() => {
    if (!userId || !conversationsQuery.data) return;
    writeStoredConversations(userId, conversationsQuery.data);
  }, [userId, conversationsQuery.data]);

  // Load the next page of conversations on "加载更多".
  // Appends to existing list and dedupes on id — protects against the rare
  // case where a refresh races with load-more and the same row appears twice.
  const handleLoadMoreConversations = useCallback(async () => {
    if (loadingMoreConversations || !hasMoreConversations) return;
    await conversationsQuery.fetchNextPage().catch(() => {
      // Silently ignore — user can retry by clicking again
    });
  }, [conversationsQuery, hasMoreConversations, loadingMoreConversations]);

  // Fetch quota on mount and when messages change. Wait for auth/subscription
  // hydration so a paid Max user is not briefly rendered with anonymous/IP quota.
  useEffect(() => {
    if (authLoading || subLoading) return;
    if (isMax) return;

    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) setQuota(null);
    });
    api.research.quota({ requiredAuth: !!userId }).then(q => {
      if (!cancelled && q.success) setQuota(q);
    }).catch(() => {
      if (!cancelled) {
        setQuota(null);
      }
    });
    return () => { cancelled = true; };
  }, [state.messages.length, authLoading, subLoading, isMax, userId]);

  // Reset scroll position when transitioning from welcome to chat
  useEffect(() => {
    if (prevPhaseRef.current === 'welcome' && state.phase === 'chat') {
      window.scrollTo(0, 0);
    }
    prevPhaseRef.current = state.phase;
  }, [state.phase]);

  // Safety: auto-recover only if the fetch-level timeout did not fire.
  useEffect(() => {
    if (!state.isLoading) return;
    const timer = setTimeout(() => {
      dispatch({ type: 'SET_ERROR', error: 'AI 助手响应超时了，请再试一次' });
    }, AGENT_STUCK_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [state.isLoading]);

  // Build conversation history for API
  const buildHistory = useCallback(() => {
    return buildCompactHistory(state.messages, RESEARCH_HISTORY_LIMIT);
  }, [state.messages]);

  // Build conversation data for saving
  //
  // Defensive: if the current state still carries KOL extras (kol_chunks /
  // persona_username), preserve them alongside the research fields. Without
  // this, any code path that accidentally routes a KOL conversation through
  // this builder (e.g. a future regression of the historical saveCurrent bug
  // or panel-state save race) would silently wipe the citation panel data on
  // the next load.
  const buildConversationData = useCallback((
    messages: typeof state.messages,
    result: { accumulated_filters: typeof state.accumulatedFilters; candidates: typeof state.candidates; candidate_count: number; universe_size: number; recommendations: typeof state.recommendations },
    funnelSteps: typeof state.funnelSteps,
    activeContent: typeof state.activeContent,
    contentStack: typeof state.contentStack,
    kolExtras?: { kolChunks?: Record<string, unknown>[]; personaUsername?: string | null },
  ) => {
    const base: Record<string, unknown> = {
      messages,
      accumulated_filters: result.accumulated_filters,
      candidates: result.candidates,
      candidate_count: result.candidate_count,
      universe_size: result.universe_size,
      recommendations: result.recommendations,
      funnel_steps: funnelSteps,
      active_content: activeContent,
      content_stack: contentStack,
    };
    if (kolExtras?.personaUsername) {
      base.persona_username = kolExtras.personaUsername;
      base.agent_kind = 'kol_research';
    }
    if (kolExtras?.kolChunks && kolExtras.kolChunks.length > 0) {
      base.kol_chunks = kolExtras.kolChunks;
    }
    return base;
  }, []);

  const upsertConversationSummary = useCallback((summary: ConversationSummary) => {
    queryClient.setQueryData<ConversationListInfiniteData>(conversationListQueryKey, (old) => {
      if (!old) {
        return {
          pages: [{ conversations: [summary], has_more: false }],
          pageParams: [0],
        };
      }

      const firstPage = old.pages[0] ?? { conversations: [], has_more: false };
      const restPages = old.pages.slice(1);
      const nextFirstPage: ConversationListPage = {
        ...firstPage,
        conversations: [
          summary,
          ...(firstPage?.conversations ?? []).filter((conv) => conv.id !== summary.id),
        ],
      };
      const nextRestPages = restPages.map((page) => ({
        ...page,
        conversations: (page.conversations ?? []).filter((conv) => conv.id !== summary.id),
      }));

      return {
        ...old,
        pages: [nextFirstPage, ...nextRestPages],
      };
    });
  }, [conversationListQueryKey, queryClient]);

  const removeConversationSummary = useCallback((conversationId: string) => {
    queryClient.setQueryData<ConversationListInfiniteData>(conversationListQueryKey, (old) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map((page) => ({
          ...page,
          conversations: (page.conversations ?? []).filter((conv) => conv.id !== conversationId),
        })),
      };
    });
  }, [conversationListQueryKey, queryClient]);

  // Auto-save conversation after each turn
  const saveConversation = useCallback(async (
    convId: string | null,
    title: string,
    data: Record<string, unknown>,
    messageCount: number,
  ) => {
    setSaveStatus('saving');
    try {
      if (!convId) {
        const created = await api.research.conversations.create({
          title,
          data,
          message_count: messageCount,
        });
        if (created?.id) {
          dispatch({ type: 'SET_CONVERSATION_ID', id: created.id });
          convCache.current.set(created.id, { title, data });
          upsertConversationSummary({
            id: created.id,
            title,
            message_count: messageCount,
            updated_at: new Date().toISOString(),
          });
        }
      } else {
        await api.research.conversations.update(convId, {
          title,
          data,
          message_count: messageCount,
        });
        convCache.current.set(convId, { title, data });
        upsertConversationSummary({
          id: convId,
          title,
          message_count: messageCount,
          updated_at: new Date().toISOString(),
        });
      }
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('idle');
    }
  }, [upsertConversationSummary]);

  // Persist panel state to backend when user navigates the right panel
  // (catches navigation that happens between or after chat messages)
  useEffect(() => {
    if (skipPanelSaveRef.current) {
      skipPanelSaveRef.current = false;
      return;
    }
    // KOL conversations are persisted by handleKolSend through the
    // /api/kol_research/conversations endpoint with kol_chunks + persona_username
    // in the data payload. Running this research-style save against a KOL
    // conversation would overwrite data with a payload that has neither field,
    // and the right-side citation panel would come back empty next time the
    // conversation is loaded.
    if (agentKind === 'kol_research') return;
    const s = latestStateRef.current;
    if (!s.conversationId || s.messages.length === 0) return;

    const convData = buildConversationData(
      s.messages,
      {
        accumulated_filters: s.accumulatedFilters,
        candidates: s.candidates,
        candidate_count: s.candidateCount,
        universe_size: s.universeSize,
        recommendations: s.recommendations,
      },
      s.funnelSteps,
      s.activeContent,
      s.contentStack,
    );
    saveConversation(
      s.conversationId,
      s.conversationTitle,
      convData as Record<string, unknown>,
      s.messages.length,
    );
  }, [state.activeContent, state.contentStack, state.conversationId, agentKind, buildConversationData, saveConversation]);

  // Navigate right panel to a stock's research view
  const handleStockClick = useCallback((symbol: string, tab?: string) => {
    stockContextRef.current = null;
    dispatch({
      type: 'PUSH_CONTENT',
      content: {
        type: 'stock',
        label: `${symbol} 个股研究`,
        summary: symbol,
        params: { symbol, ...(tab ? { tab } : {}) },
        available_actions: ['查看基本面', '技术分析', '返回选股'],
      },
    });
    setMobileTab('results');
  }, []);

  // Auto-send pending seed message when context data is ready
  const flushPendingSeed = useCallback(() => {
    if (!pendingSeed.current) return;
    const seed = pendingSeed.current;
    pendingSeed.current = null;
    // Small delay to ensure React state from CONTEXT_ENTRY has settled before sending
    if (pendingSeedTimerRef.current) clearTimeout(pendingSeedTimerRef.current);
    pendingSeedTimerRef.current = setTimeout(() => {
      pendingSeedTimerRef.current = null;
      handleSendRef.current?.(seed);
    }, 100);
  }, []);

  // Receive stock data from StockResearchView for Agent context
  const handleStockContextReady = useCallback((payload: StockContextPayload) => {
    stockContextRef.current = payload;
    flushPendingSeed();
  }, [flushPendingSeed]);

  // Receive daily report data from DailyReportView for Agent context
  const handleReportContextReady = useCallback((payload: DailyReportContextPayload) => {
    reportContextRef.current = payload;
    flushPendingSeed();
  }, [flushPendingSeed]);

  // Receive morning report data from MorningReportView for Agent context
  const handleMorningContextReady = useCallback((payload: MorningReportContextPayload) => {
    morningContextRef.current = payload;
    flushPendingSeed();
  }, [flushPendingSeed]);

  // Receive macro panel data from MacroPanelView for Agent context
  const handleMacroPanelContextReady = useCallback((payload: MacroPanelContextPayload) => {
    macroPanelContextRef.current = payload;
    flushPendingSeed();
  }, [flushPendingSeed]);

  // Receive brew digest data from BrewDigestView for Agent context
  const handleBrewContextReady = useCallback((payload: BrewContextPayload) => {
    brewContextRef.current = payload;
    flushPendingSeed();
  }, [flushPendingSeed]);

  // Send message handler
  // KOL-mode send. Independent codepath: we don't touch screener candidates / filters.
  const handleKolSend = useCallback(async (message: string) => {
    if (message.trim().length > KOL_MESSAGE_CHAR_LIMIT) {
      dispatch({ type: 'SET_ERROR', error: `问题太长了，请压缩到 ${KOL_MESSAGE_CHAR_LIMIT} 字以内再发送` });
      return;
    }
    dispatch({ type: 'SEND_MESSAGE', message });
    dispatch({ type: 'SET_KOL_CHUNKS', chunks: [] });
    try {
      const history = buildCompactHistory(state.messages, KOL_HISTORY_LIMIT);

      let finalMessage = '';
      let finalChunks: KolPersonaChunk[] = [];
      let finalNavigate: { type: string; params: Record<string, string>; reason?: string } | null = null;
      let errored = false;

      await api.kolResearch.chatStream(
        {
          message,
          history,
          persona_username: personaUsername || 'qinbafrank',
          // KOL agent currently ignores active_context (kept minimal in Phase 4).
        },
        (event: KolResearchStreamEvent) => {
          if (event.type === 'skill_activated') {
            ReactDOM.flushSync(() => {
              dispatch({
                type: 'TOOL_ACTIVITY',
                tool: 'load_skill',
                description: event.description,
                status: 'start',
              });
            });
          } else if (event.type === 'tool_call_start') {
            ReactDOM.flushSync(() => {
              dispatch({
                type: 'TOOL_ACTIVITY',
                tool: event.tool,
                description: event.description,
                status: 'start',
              });
            });
          } else if (event.type === 'tool_call_end') {
            // no-op — keep description visible until next event
          } else if (event.type === 'message_delta') {
            // Token-by-token streaming: append to the in-progress assistant msg.
            ReactDOM.flushSync(() => {
              dispatch({ type: 'STREAM_DELTA', kind: 'message', text: event.text });
            });
          } else if (event.type === 'thinking') {
            // Chain-of-thought chunk: accumulate on the same in-progress msg.
            ReactDOM.flushSync(() => {
              dispatch({ type: 'STREAM_DELTA', kind: 'thinking', text: event.text });
            });
          } else if (event.type === 'final') {
            finalMessage = event.data.message;
            finalChunks = event.data.kol_chunks || [];
            finalNavigate = (event.data.navigate as typeof finalNavigate) || null;
          } else if (event.type === 'error') {
            errored = true;
            // Log the full backend error payload so the console shows code +
            // raw message even after we map it to a user-facing string. Grep
            // "[KOL Research] backend error" to find these in DevTools.
            console.warn('[KOL Research] backend error event:', event);
            dispatch({ type: 'SET_ERROR', error: getAgentErrorMessage(event) });
          }
        },
      );

      if (errored) return;
      if (!finalMessage) {
        // Stream closed without emitting `final` or `error`. Common causes:
        // backend reload mid-request (StatReload), proxy dropped SSE, auth
        // middleware rejected after stream open. Grep "[KOL Research] no
        // final event" in DevTools to find these.
        console.warn('[KOL Research] no final event — stream closed cleanly without answer', {
          chunksReceived: finalChunks.length,
          navigateBuffered: !!finalNavigate,
        });
        dispatch({
          type: 'SET_ERROR',
          error: getAgentErrorMessage({ code: 'stream_no_final' }),
        });
        return;
      }

      // Reuse RECEIVE_RESPONSE by mapping KOL output onto a minimal ResearchResult shape.
      const result: ResearchResult = {
        success: true,
        message: finalMessage,
        options: [],
        candidates: [],
        candidate_count: 0,
        universe_size: 0,
        recommendations: [],
        accumulated_filters: [],
        reset_results: false,
        title: '',
        navigate: finalNavigate,
        data_freshness: null,
        is_stale: false,
      };
      // Build a unified KOL conversation title BEFORE dispatching RECEIVE_RESPONSE.
      // Format: `@{persona} · {first user question, truncated to 24 chars}`.
      // This gives all KOL conversations a consistent recognizable name and
      // identifies the persona at a glance.
      const persona = personaUsername || 'qinbafrank';
      // Read latest state through ref to avoid stale-closure deps issue with
      // useCallback. On first turn conversationId is null and we generate a
      // title; subsequent turns preserve the existing title.
      const latestState = latestStateRef.current;
      const isFirstTurn = !latestState.conversationId;
      let titleForRespose: string;
      if (isFirstTurn) {
        const preview = message.trim().length > 24
          ? `${message.trim().slice(0, 24)}...`
          : message.trim();
        titleForRespose = `@${persona} · ${preview}`;
      } else {
        // Preserve existing title (reducer keeps state.conversationTitle when
        // result.title is empty — see RECEIVE_RESPONSE case).
        titleForRespose = '';
      }

      // Route title through RECEIVE_RESPONSE so it lands in state.conversationTitle.
      const resultWithTitle: ResearchResult = { ...result, title: titleForRespose };
      dispatch({ type: 'RECEIVE_RESPONSE', result: resultWithTitle });
      dispatch({
        type: 'SET_KOL_CHUNKS',
        chunks: finalChunks as unknown as Record<string, unknown>[],
      });

      // Persist to KOL conversations table.
      try {
        const finalTitle = isFirstTurn
          ? titleForRespose
          : latestState.conversationTitle || `@${persona} 对话`;
        // IMPORTANT: latestStateRef.current.messages already contains the
        // user message (added by SEND_MESSAGE earlier in this function) and
        // the finalized assistant message (added by STREAM_DELTA + upgraded
        // in-place by RECEIVE_RESPONSE). The closure-captured state.messages
        // is what existed *before* this turn began. Use that as the base,
        // then append the current user + assistant manually — otherwise we
        // double-record the turn (which is exactly the bug that caused every
        // saved KOL conversation to grow at 2× the visible rate).
        const allMessages = [
          ...state.messages,
          { id: `u-${Date.now()}`, role: 'user' as const, content: message },
          { id: `a-${Date.now()}`, role: 'assistant' as const, content: finalMessage },
        ];
        const convData: Record<string, unknown> = {
          messages: allMessages,
          kol_chunks: finalChunks,
          persona_username: persona,
        };
        if (isFirstTurn) {
          const created = await api.kolResearch.conversations.create({
            title: finalTitle,
            data: convData,
            message_count: allMessages.length,
            persona_username: persona,
          });
          if (created?.id) {
            dispatch({ type: 'SET_CONVERSATION_ID', id: created.id });
            convCache.current.set(created.id, { title: finalTitle, data: convData });
            upsertConversationSummary({
              id: created.id,
              title: finalTitle,
              message_count: allMessages.length,
              updated_at: new Date().toISOString(),
            });
          }
        } else if (latestState.conversationId) {
          await api.kolResearch.conversations.update(latestState.conversationId, {
            title: finalTitle,
            data: convData,
            message_count: allMessages.length,
            persona_username: persona,
          });
          convCache.current.set(latestState.conversationId, { title: finalTitle, data: convData });
          upsertConversationSummary({
            id: latestState.conversationId,
            title: finalTitle,
            message_count: allMessages.length,
            updated_at: new Date().toISOString(),
          });
        }
      } catch (saveErr) {
        // Save failure shouldn't break the chat experience; just log.
        console.warn('[KOL Research] conversation save failed:', saveErr);
      }
    } catch (err) {
      console.warn('[KOL Research] handleKolSend error:', err);
      dispatch({
        type: 'SET_ERROR',
        error: err instanceof Error
          ? `KOL 请求失败：${err.message}`
          : 'AI 助手暂时无法响应',
      });
    }
  }, [state.messages, personaUsername, upsertConversationSummary]);

  const handleSend = useCallback(async (message: string) => {
    // Route to KOL agent codepath when a persona is loaded.
    if (agentKind === 'kol_research') {
      return handleKolSend(message);
    }
    if (message.trim().length > RESEARCH_MESSAGE_CHAR_LIMIT) {
      dispatch({ type: 'SET_ERROR', error: `问题太长了，请压缩到 ${RESEARCH_MESSAGE_CHAR_LIMIT} 字以内再发送` });
      return;
    }
    if (process.env.NODE_ENV === 'development') {
      console.debug('[Screener] handleSend called, isLoading was:', state.isLoading);
    }
    dispatch({ type: 'SEND_MESSAGE', message });

    try {
      // Build active_context from the current content panel view
      let activeContext: ResearchRequest['active_context'];
      if (state.activeContent.type === 'stock' && stockContextRef.current) {
        const ctx = stockContextRef.current;
        activeContext = {
          type: ctx.type,
          symbol: ctx.symbol,
          quote: ctx.quote ?? undefined,
          fundamentals: ctx.fundamentals ?? undefined,
          // Earnings
          earnings_history: ctx.earnings_history ?? undefined,
          financial_growth: ctx.financial_growth ?? undefined,
          income_statements: ctx.income_statements ?? undefined,
          // Technical
          technical_derived: ctx.technical_derived ?? undefined,
          support_resistance: ctx.support_resistance ?? undefined,
          // Market
          recent_news: ctx.recent_news ?? undefined,
        };
      } else if (state.activeContent.type === 'daily_report' && reportContextRef.current) {
        const ctx = reportContextRef.current;
        activeContext = {
          type: ctx.type,
          date: ctx.date,
          title: ctx.title ?? undefined,
          summary: ctx.summary ?? undefined,
          intro: ctx.intro ?? undefined,
          news: ctx.news ?? undefined,
          report_summary: ctx.report_summary ?? undefined,
          calendar: ctx.calendar ?? undefined,
        };
      } else if (state.activeContent.type === 'morning_report' && morningContextRef.current) {
        const ctx = morningContextRef.current;
        activeContext = {
          type: ctx.type,
          date: ctx.date,
          title: ctx.title ?? undefined,
          market_pulse: ctx.market_pulse ?? undefined,
          futures: ctx.futures ?? undefined,
          global_markets: ctx.global_markets ?? undefined,
          overnight_news: ctx.overnight_news ?? undefined,
          today_focus: ctx.today_focus ?? undefined,
          morning_summary: ctx.summary ?? undefined,
        };
      } else if ((state.activeContent.type === 'macro' || state.activeContent.type.startsWith('macro_')) && macroPanelContextRef.current) {
        const ctx = macroPanelContextRef.current;
        activeContext = {
          type: 'macro',
          active_tab: ctx.active_tab,
          week_label: ctx.week_label,
          verdict: ctx.verdict,
          signal_lights: ctx.signal_lights,
          landscape: ctx.landscape,
          narrative: ctx.narrative,
          takeaway: ctx.takeaway,
          liquidity: ctx.liquidity,
          economy: ctx.economy,
          inflation: ctx.inflation,
          sentiment: ctx.sentiment,
        };
      } else if (state.activeContent.type === 'brew' && brewContextRef.current) {
        const ctx = brewContextRef.current;
        activeContext = {
          type: 'brew',
          digest_date: ctx.digest_date ?? undefined,
          symbols_used: ctx.symbols ?? undefined,
          greeting: ctx.greeting ?? undefined,
          one_line_summary: ctx.one_line_summary ?? undefined,
          stocks: ctx.stocks ?? undefined,
          events: ctx.events ?? undefined,
          news: ctx.news ?? undefined,
          summary_content: ctx.summary_content ?? undefined,
        };
      }

      let streamResult: ResearchResult | null = null;
      let streamErrorHandled = false;

      await api.research.chatStream(
        {
          message,
          history: buildHistory(),
          accumulated_filters: state.accumulatedFilters.length > 0
            ? state.accumulatedFilters
            : undefined,
          active_context: activeContext || undefined,
        },
        (event) => {
          if (event.type === 'tool_call_start' && event.tool && event.description) {
            ReactDOM.flushSync(() => {
              dispatch({ type: 'TOOL_ACTIVITY', tool: event.tool!, description: event.description!, status: 'start' });
            });
          } else if (event.type === 'tool_call_end') {
            // Don't dispatch end — let the description stay visible.
            // It gets replaced by the next tool_call_start or cleared by RECEIVE_RESPONSE.
          } else if (event.type === 'done' && event.result) {
            streamResult = event.result as ResearchResult;
          } else if (event.type === 'error') {
            streamErrorHandled = true;
            dispatch({ type: 'SET_ERROR', error: getAgentErrorMessage(event) });
          }
        },
        { requiredAuth: !!userId },
      );

      if (!streamResult) {
        if (!streamErrorHandled) {
          dispatch({ type: 'SET_ERROR', error: 'AI 助手暂时无法响应' });
        }
        return;
      }

      const result = streamResult as ResearchResult;

      if (!result.success) {
        dispatch({ type: 'SET_ERROR', error: result.message || 'AI 助手暂时无法响应' });
        return;
      }

      dispatch({ type: 'RECEIVE_RESPONSE', result });

      // Handle agent-driven navigation (e.g. "show me NVDA" or "show daily report")
      if (result.navigate?.type === 'stock' && result.navigate.params?.symbol) {
        handleStockClick(result.navigate.params.symbol, result.navigate.params?.tab);
      } else if (result.navigate?.type === 'daily_report') {
        reportContextRef.current = null;
        dispatch({
          type: 'PUSH_CONTENT',
          content: {
            type: 'daily_report',
            label: '市场日报',
            summary: '',
            params: { date: result.navigate.params?.date ?? '' },
            available_actions: ['追问日报内容', '查看提到的个股', '查看宏观背景'],
          },
        });
        setMobileTab('results');
      } else if (result.navigate?.type === 'morning_report') {
        morningContextRef.current = null;
        dispatch({
          type: 'PUSH_CONTENT',
          content: {
            type: 'morning_report',
            label: '盘前早报',
            summary: '',
            params: { date: result.navigate.params?.date ?? '' },
            available_actions: ['解读早报要点', '分析期货动向', '看今日市场焦点'],
          },
        });
        setMobileTab('results');
      } else if (result.navigate?.type === 'macro') {
        macroPanelContextRef.current = null;
        dispatch({
          type: 'PUSH_CONTENT',
          content: {
            type: 'macro',
            label: '宏观风险仪表盘',
            summary: '',
            params: { ...(result.navigate.params?.tab ? { tab: result.navigate.params.tab } : {}) },
            available_actions: ['深入某个维度', '查看对持仓影响', '返回选股'],
          },
        });
        setMobileTab('results');
      } else if (result.navigate?.type === 'brew') {
        brewContextRef.current = null;
        dispatch({
          type: 'PUSH_CONTENT',
          content: {
            type: 'brew',
            label: '专属日报',
            summary: '',
            params: {},
            available_actions: ['追问持仓表现', '查看个股详情', '查看宏观背景'],
          },
        });
        setMobileTab('results');
      } else if (
        result.navigate?.type === 'macro_liquidity' ||
        result.navigate?.type === 'macro_economy' ||
        result.navigate?.type === 'macro_inflation' ||
        result.navigate?.type === 'macro_sentiment'
      ) {
        // Consolidate macro sub-types into macro + tab
        const tabMap: Record<string, string> = {
          macro_liquidity: 'liquidity',
          macro_economy: 'economy',
          macro_inflation: 'inflation',
          macro_sentiment: 'sentiment',
        };
        macroPanelContextRef.current = null;
        dispatch({
          type: 'PUSH_CONTENT',
          content: {
            type: 'macro',
            label: '宏观风险仪表盘',
            summary: '',
            params: { tab: tabMap[result.navigate.type] },
            available_actions: ['深入某个维度', '查看对持仓影响', '返回选股'],
          },
        });
        setMobileTab('results');
      } else if (result.navigate?.type === 'screener') {
        // Navigate back to screener — clear stack, reset context refs
        stockContextRef.current = null;
        reportContextRef.current = null;
        morningContextRef.current = null;
        macroPanelContextRef.current = null;
        brewContextRef.current = null;
        dispatch({
          type: 'SWITCH_CONTENT',
          content: {
            type: 'screener',
            label: '选股结果',
            summary: '',
            params: {},
            available_actions: ['继续筛选', '查看个股详情', '重新开始'],
          },
        });
        setMobileTab('results');
      }

      // Auto-save conversation (fire-and-forget)
      // Note: state.messages is from the useCallback closure (before SEND_MESSAGE dispatch),
      // so we must manually include the user message in the save payload.
      const userMsg = { id: `msg-${Math.random().toString(36).slice(2, 9)}-${Date.now()}`, role: 'user' as const, content: message };
      const assistantMsg = {
        id: `msg-${Math.random().toString(36).slice(2, 9)}-${Date.now()}`,
        role: 'assistant' as const,
        content: result.message,
        options: result.options.length > 0 ? result.options : undefined,
      };
      const allMessages = [...state.messages, userMsg, assistantMsg];
      // Reconstruct funnel steps matching the reducer logic (state.funnelSteps is stale)
      let saveFunnelSteps = [...state.funnelSteps];
      if (result.candidate_count > 0) {
        if (saveFunnelSteps.length === 0 && result.universe_size > 0) {
          saveFunnelSteps = [
            { count: result.universe_size, label: '全市场' },
            { count: result.candidate_count },
          ];
        } else if (
          saveFunnelSteps.length > 0 &&
          result.candidate_count !== saveFunnelSteps[saveFunnelSteps.length - 1]?.count
        ) {
          saveFunnelSteps = [...saveFunnelSteps, { count: result.candidate_count }];
        }
      }
      const convData = buildConversationData(
        allMessages,
        result,
        saveFunnelSteps,
        state.activeContent,
        state.contentStack,
        { kolChunks: state.kolChunks, personaUsername },
      );
      // Title is only set on first turn (create); subsequent updates keep existing title
      const isFirstTurn = !state.conversationId;
      const title = isFirstTurn
        ? formatConversationTitle(result.title)
        : state.conversationTitle;
      saveConversation(
        state.conversationId,
        title,
        convData as Record<string, unknown>,
        allMessages.length,
      );
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[Screener] handleSend error:', err);
      }
      const authError = getAuthErrorPresentation(err, 'AI 助手暂时无法响应');
      if (authError.shouldRedirectToLogin) {
        await signOut().catch(() => {});
        router.push('/login?redirect=/research');
        return;
      }
      dispatch({ type: 'SET_ERROR', error: authError.message });
    }
  }, [agentKind, personaUsername, handleKolSend, buildHistory, state.isLoading, state.accumulatedFilters, state.activeContent, state.contentStack, state.conversationId, state.conversationTitle, state.messages, state.funnelSteps, state.kolChunks, router, buildConversationData, saveConversation, handleStockClick, signOut, userId]);

  // Keep ref in sync so flushPendingSeed can call the latest handleSend
  useEffect(() => {
    handleSendRef.current = handleSend;
  }, [handleSend]);

  // Cancel pending seed timer on unmount
  useEffect(() => {
    return () => {
      if (pendingSeedTimerRef.current) {
        clearTimeout(pendingSeedTimerRef.current);
      }
    };
  }, []);

  // Enter daily report context directly from welcome screen
  const handleEnterDailyReport = useCallback(() => {
    const date = marketTodayStr();
    dispatch({
      type: 'CONTEXT_ENTRY',
      key: `daily_report:${date}`,
      content: {
        type: 'daily_report',
        label: `${date} 市场日报`,
        summary: '',
        params: { date },
        available_actions: ['追问日报内容', '查看提到的个股', '查看宏观背景'],
      },
    });
    pendingSeed.current = `帮我解读今天的市场日报`;
  }, []);

  // Enter macro context directly from welcome screen
  const handleEnterMacro = useCallback(() => {
    dispatch({
      type: 'CONTEXT_ENTRY',
      key: 'macro',
      content: {
        type: 'macro',
        label: '宏观风险仪表盘',
        summary: '',
        params: {},
        available_actions: ['深入某个维度', '查看对持仓影响', '返回选股'],
      },
    });
    pendingSeed.current = '帮我看看当前宏观环境';
  }, []);

  // Cancel stuck loading — lets user recover without refreshing
  const handleCancelLoading = useCallback(() => {
    if (!state.isLoading) return;
    dispatch({ type: 'SET_ERROR', error: '已取消。你可以重新发送或换个问题试试' });
  }, [state.isLoading]);

  // Load a saved conversation
  const loadConversationData = useCallback((conversationId: string, conv: Record<string, unknown>) => {
    skipPanelSaveRef.current = true;
    const data = (conv.data || {}) as Record<string, unknown>;
    // KOL conversations save chunks under data.kol_chunks; restore them so
    // the right panel (citation cards) doesn't show up empty after a reload
    // or after loading from the sidebar.
    const savedKolChunks = (data.kol_chunks as Record<string, unknown>[] | undefined) ?? [];
    // Restore persona via the LOAD_CONVERSATION dispatch (single source of
    // truth, persisted via sessionStorage). agentKind is derived from this.
    const savedPersona = (data.persona_username as string | undefined) ?? null;
    dispatch({
      type: 'LOAD_CONVERSATION',
      data: {
        conversationId,
        title: (conv.title as string) || '',
        messages: (data.messages || []) as LoadConversationData['messages'],
        accumulatedFilters: (data.accumulated_filters || []) as LoadConversationData['accumulatedFilters'],
        candidates: (data.candidates || []) as LoadConversationData['candidates'],
        candidateCount: (data.candidate_count as number) || 0,
        universeSize: (data.universe_size as number) || 0,
        recommendations: ((data.recommendations || data.pick_reasons) || []) as LoadConversationData['recommendations'],
        funnelSteps: (data.funnel_steps || []) as LoadConversationData['funnelSteps'],
        activeContent: data.active_content as LoadConversationData['activeContent'],
        contentStack: data.content_stack as LoadConversationData['contentStack'],
        kolChunks: savedKolChunks,
        personaUsername: savedPersona,
      },
    });
    if (process.env.NODE_ENV === 'development') {
      console.debug('[research] loadConversationData', {
        conversationId,
        savedPersona,
        kolChunksCount: savedKolChunks.length,
        hasDataField: !!conv.data,
        dataKeys: conv.data ? Object.keys(conv.data) : [],
      });
    }
  }, []);

  const handleLoadConversation = useCallback(async (conversationId: string) => {
    if (pendingSeedTimerRef.current) clearTimeout(pendingSeedTimerRef.current);
    pendingSeed.current = null;

    // NOTE: 不在这里 save current conversation. 之前的逻辑有两个 bug:
    // 1) 它一律走 api.research.conversations.update + 不带 kol_chunks/persona_username
    //    的 payload, 会把 KOL 对话 backend 数据覆盖掉, 导致再次加载时右边 panel
    //    丢推特原文、agentKind 切不回 kol_research (即用户报的"右边 panel 全坏")
    // 2) 每次切换都触发 update, backend updated_at 被刷新, 下次 list 时
    //    刚切走的旧对话会错误地排到第一位
    // 实际无需多保存: 上一轮 chat send 末尾已 save 全量, 之后 panel 改动也由
    // 下面的 useEffect (state.activeContent/contentStack 变化) 自动保存.

    // Cache hit — instant switch, no network request
    const cached = convCache.current.get(conversationId);
    if (cached) {
      loadConversationData(conversationId, cached);
      return;
    }

    // Cache miss — show placeholder, then fetch
    const summary = conversations.find(c => c.id === conversationId);
    if (summary) {
      skipPanelSaveRef.current = true;
      dispatch({
        type: 'LOAD_CONVERSATION',
        data: {
          conversationId,
          title: summary.title || '',
          messages: [{ id: 'loading-placeholder', role: 'assistant' as const, content: '' }],
          accumulatedFilters: [],
          candidates: [],
          candidateCount: 0,
          universeSize: 0,
          recommendations: [],
          funnelSteps: [],
        },
      });
    }

    try {
      const conv = await api.research.conversations.get(conversationId);
      if (!conv) return;
      convCache.current.set(conversationId, conv);
      loadConversationData(conversationId, conv);
    } catch {
      if (summary) dispatch({ type: 'RESET' });
    }
  }, [conversations, loadConversationData]);

  // Delete a conversation
  const handleDeleteConversation = useCallback(async (conversationId: string) => {
    try {
      await api.research.conversations.delete(conversationId);
      convCache.current.delete(conversationId);
      removeConversationSummary(conversationId);
      // If the deleted conversation is currently active, reset to a clean state
      if (conversationId === state.conversationId) {
        dispatch({ type: 'RESET' });
      }
    } catch {
      // Ignore delete failures
    }
  }, [removeConversationSummary, state.conversationId]);

  // Mobile tab change
  const handleTabChange = useCallback((tab: 'chat' | 'results') => {
    setMobileTab(tab);
    if (tab === 'results') {
      dispatch({ type: 'VIEW_RESULTS' });
    }
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && state.isLoading) {
        e.preventDefault();
        handleCancelLoading();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [state.isLoading, handleCancelLoading]);

  // Auth loading
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
      </div>
    );
  }

  // Welcome phase — same sidebar as chat phase
  if (state.phase === 'welcome') {
    return (
      <div className="fixed inset-x-0 top-16 bottom-0 bg-background z-10 flex">
        {/* Shared sidebar */}
        <div
          className={`
            hidden lg:flex shrink-0 border-r border-border/50 overflow-hidden flex-col
            transition-[width] duration-200 ease-out
            ${historyOpen ? 'sidebar-open' : 'w-0'}
          `}
          style={historyOpen ? { width: 'clamp(14rem, 15vw, 18rem)' } : undefined}
        >
          <ConversationSidebar
            conversations={conversations}
            loading={!conversationsLoaded}
            currentId={state.conversationId}
            onLoad={handleLoadConversation}
            onDelete={handleDeleteConversation}
            onNewChat={() => dispatch({ type: 'RESET' })}
            requestInFlight={false}
            onToggle={() => setHistoryOpen(false)}
            userName={user?.name}
            userEmail={user?.email}
            userTier={userTier}
            hasMore={hasMoreConversations}
            loadingMore={loadingMoreConversations}
            onLoadMore={handleLoadMoreConversations}
          />
        </div>

        {/* Welcome content — when sidebar is collapsed, show an obvious open button */}
        <div className="flex-1 flex flex-col">
          {!historyOpen && (
            <div className="shrink-0 px-3 py-2 hidden lg:flex items-center">
              <button
                onClick={() => setHistoryOpen(true)}
                title="展开历史对话"
                aria-label="展开历史对话"
                className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-md text-foreground/80 hover:text-foreground bg-muted/40 hover:bg-muted/70 border border-border/60 transition-colors cursor-pointer"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M9 3v18" />
                </svg>
                <span className="text-xs">历史</span>
              </button>
            </div>
          )}
          <div className="flex-1 overflow-hidden">
            <WelcomeScreen
              onSelect={handleSend}
              universeSize={state.universeSize || undefined}
              userName={user?.name}
              quota={effectiveQuota}
              personaSelectorEnabled={kolPersonaEnabled}
              agentKind={agentKind}
              personaUsername={personaUsername}
              onPersonaChange={({ agentKind: nextKind, personaUsername: nextUser }) => {
                setAgentKind(nextKind);
                setPersonaUsername(nextUser);
                dispatch({ type: 'SET_KOL_CHUNKS', chunks: [] });
                // Already at welcome screen, no reducer reset needed.
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  // Chat phase - split layout
  return (
    <div className="fixed inset-x-0 top-16 bottom-0 flex flex-col bg-background z-10">
      {/* Mobile tab switch */}
      <div className="lg:hidden shrink-0">
        <MobileTabSwitch
          activeTab={mobileTab}
          onTabChange={handleTabChange}
          hasNewResults={state.hasNewResults}
        />
      </div>

      {/* Main content: split panels */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: History sidebar + Chat panel */}
        <div
          className={`
            w-full lg:w-1/2 lg:border-r lg:border-border/20
            ${mobileTab === 'chat' ? 'flex' : 'hidden lg:flex'}
            overflow-hidden
          `}
        >
          {/* Collapsible history sidebar — overlay on mobile, inline on desktop */}
          <div
            className={`
              shrink-0 border-r border-border/50 overflow-hidden
              transition-[width] duration-200 ease-out
              ${historyOpen ? 'absolute lg:relative z-20 h-full bg-background shadow-xl lg:shadow-none' : 'w-0'}
              ${!historyOpen ? 'hidden' : 'flex flex-col'}
            `}
            style={historyOpen ? { width: 'clamp(16rem, 70vw, 18rem)' } : undefined}
          >
            <ConversationSidebar
              conversations={conversations}
              loading={historyOpen && !conversationsLoaded}
              currentId={state.conversationId}
              onLoad={handleLoadConversation}
              onDelete={handleDeleteConversation}
              onNewChat={() => dispatch({ type: 'RESET' })}
              requestInFlight={state.isLoading}
              onToggle={() => setHistoryOpen(false)}
              userName={user?.name}
              userEmail={user?.email}
            />
          </div>
          {/* Backdrop overlay — mobile only, closes sidebar on tap */}
          {historyOpen && (
            <div
              className="absolute inset-0 z-10 bg-black/20 lg:hidden"
              onClick={() => setHistoryOpen(false)}
            />
          )}
          {/* Chat panel */}
          <div className="flex-1 flex flex-col relative min-w-0">
            {/* Chat header: sidebar toggle + persona selector */}
            <div className="shrink-0 px-3 py-2 flex items-center gap-2">
              {!historyOpen && (
                <button
                  onClick={() => setHistoryOpen(true)}
                  title="历史对话"
                  aria-label="展开历史对话"
                  className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-md text-foreground/80 hover:text-foreground bg-muted/40 hover:bg-muted/70 border border-border/60 transition-colors cursor-pointer"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <path d="M9 3v18" />
                  </svg>
                  <span className="text-xs">历史</span>
                </button>
              )}
            </div>
            <ChatPanel
              messages={state.messages}
              onSend={handleSend}
              loading={state.isLoading}
              onCancelLoading={state.isLoading ? handleCancelLoading : undefined}
              toolActivities={state.toolActivities}
              quota={effectiveQuota}
              citations={agentKind === 'kol_research' ? latestKolChunks : undefined}
              personaUsername={
                kolPersonaEnabled && agentKind === 'kol_research' ? personaUsername : null
              }
              inputPlaceholder={
                agentKind === 'kol_research'
                  ? `按 @${personaUsername || 'qinbafrank'} 方法论提问...`
                  : undefined
              }
            />
          </div>
        </div>

        {/* Right: Content panel (or KOL citation cards when in KOL mode) */}
        <div
          className={`
            w-full lg:w-1/2
            ${mobileTab === 'results' ? 'flex' : 'hidden lg:flex'}
            flex-col
          `}
        >
          {agentKind === 'kol_research' ? (
            <KolChunksPanel chunks={latestKolChunks} variant="panel" />
          ) : (
            <ContentPanel
              activeContent={state.activeContent}
              canGoBack={state.contentStack.length > 0}
              onGoBack={() => dispatch({ type: 'POP_CONTENT' })}
              screenerProps={{
                steps: state.funnelSteps,
                appliedFilters: state.accumulatedFilters,
                candidates: state.candidates,
                candidateCount: state.candidateCount,
                universeSize: state.universeSize,
                recommendations: state.recommendations,
                loading: state.isLoading,
                onStockClick: handleStockClick,
              }}
              onStockContextReady={handleStockContextReady}
              onReportContextReady={handleReportContextReady}
              onMorningContextReady={handleMorningContextReady}
              onMacroPanelContextReady={handleMacroPanelContextReady}
              onBrewContextReady={handleBrewContextReady}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page Export
// ---------------------------------------------------------------------------

export default function ScreenerPage() {
  return (
    <Suspense>
      <ScreenerContent />
    </Suspense>
  );
}
