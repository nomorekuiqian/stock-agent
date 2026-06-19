'use client';

import { useReducer, useCallback, useEffect, useState, useRef, Suspense, useMemo } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useInfiniteQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { PanelLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { api } from '@/lib/api';
import { getAuthErrorPresentation } from '@/lib/auth-error-presentation';
import { marketTodayStr } from '@/lib/timezone';
import { trackScreenerFilterUsed } from '@/lib/screener-analytics';
import type { ConversationSaveRequest, ConversationSummary, KolPersonaScope, ResearchRequest, ResearchResult } from '@/lib/api';
import {
  researchReducer,
  buildKolPersistedMessages,
  loadState,
  saveState,
  STORAGE_KEY,
} from './_lib/researchReducer';
import { buildKolFollowUpOptions } from './_lib/kolFollowUps';
import { SCREENER_CONTENT, type ContentContext } from './_lib/contentTypes';
import type { ChatMsg, LoadConversationData, RequiredProduct } from './_lib/researchReducer';
import type { StockPanelContextPayload as StockContextPayload } from './_components/panel/StockPanelView';
import type { DailyReportContextPayload } from './_components/DailyReportView';
import type { MorningReportContextPayload } from './_components/MorningReportView';
import type { TwitterDigestContextPayload } from './_components/TwitterDigestView';
import type { MacroPanelContextPayload } from './_components/panel/MacroPanelView';
import type { BrewContextPayload } from './_components/BrewDigestView';
import WelcomeScreen from './_components/WelcomeScreen';
import ChatPanel from './_components/ChatPanel';
import ContentPanel from './_components/ContentPanel';
import CanvasPanel from './_components/CanvasPanel';
import ConversationSidebar from './_components/ConversationSidebar';
import ConversationSearchDialog from './_components/ConversationSearchDialog';
import MobileTabSwitch from './_components/MobileTabSwitch';
import { type AgentKind } from './_components/PersonaSelector';
import KolChunksPanel from './_components/KolChunksPanel';
import type { KolPersonaChunk, KolResearchStreamEvent } from '@/lib/api';
import { useFeatureFlags } from '@/hooks/use-feature-flags';
import { getPersonaDisplayLabel } from './_lib/personaDisplay';

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
const CONVERSATION_SEARCH_PAGE_SIZE = 8;
const CONVERSATIONS_STALE_TIME_MS = 10 * 60 * 1000;
const CONVERSATIONS_GC_TIME_MS = 60 * 60 * 1000;
const CONVERSATIONS_STORAGE_MAX_AGE_MS = 60 * 60 * 1000;
const SEND_RUNTIME_HISTORY = process.env.NEXT_PUBLIC_AGENT_RUNTIME_SEND_HISTORY !== 'false';
const DESKTOP_HISTORY_QUERY = '(min-width: 1024px)';

type ApiHistoryMessage = { role: 'user' | 'assistant'; content: string };
type ConversationListPage = { conversations: ConversationSummary[]; has_more?: boolean };
type ConversationListInfiniteData = InfiniteData<ConversationListPage, number>;
type WorkspaceConversationApi = {
  list: (opts?: { limit?: number; offset?: number; search?: string }) => Promise<ConversationListPage>;
  get: (id: string) => Promise<Record<string, unknown>>;
  create: (req: ConversationSaveRequest & Record<string, unknown>) => Promise<{ id: string }>;
  update: (id: string, req: ConversationSaveRequest & Record<string, unknown>) => Promise<{ success: boolean }>;
  pin: (
    id: string,
    isPinned: boolean,
    agentId?: 'research_agent' | 'kol_research_agent',
  ) => Promise<{
    success: boolean;
    id: string;
    agent_id?: string;
    is_pinned: boolean;
    pinned_at: string | null;
    updated_at?: string;
  }>;
  delete: (id: string) => Promise<{ success: boolean }>;
};
type WorkspaceKolChatStream = typeof api.kolResearch.chatStream;
export interface ResearchWorkspaceProps {
  variant?: 'research' | 'community_panda';
  storageKey?: string;
  conversationScope?: string;
  defaultPersonaUsername?: string | null;
  lockedPersonaUsername?: string | null;
  personaScope?: KolPersonaScope;
  allowDefaultAssistant?: boolean;
  showPersonaUpsell?: boolean;
  useFullViewport?: boolean;
}
type StoredConversationList = {
  updatedAt: number;
  data: ConversationListInfiniteData;
};

function isDesktopViewport(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(DESKTOP_HISTORY_QUERY).matches;
}

function getConversationStorageKey(userId: string, scope = 'research'): string {
  return `research_conversations_cache_v1:${scope}:${userId}`;
}

function readStoredConversations(userId: string, scope = 'research'): StoredConversationList | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = localStorage.getItem(getConversationStorageKey(userId, scope));
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

function writeStoredConversations(userId: string, data: ConversationListInfiniteData, scope = 'research'): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      getConversationStorageKey(userId, scope),
      JSON.stringify({ updatedAt: Date.now(), data }),
    );
  } catch {
    // Browser storage can be unavailable or full; React Query cache still works.
  }
}

function removeStoredConversations(userId: string, scope = 'research'): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(getConversationStorageKey(userId, scope));
  } catch {
    // Browser storage can be unavailable; React Query refetch still handles recovery.
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
  return result.sort(compareConversationSummaries);
}

function compareConversationSummaries(
  a: ConversationSummary,
  b: ConversationSummary,
): number {
  const pinnedDelta = Number(Boolean(b.is_pinned)) - Number(Boolean(a.is_pinned));
  if (pinnedDelta !== 0) return pinnedDelta;
  if (a.is_pinned || b.is_pinned) {
    const pinnedAtDelta = conversationTimeValue(b.pinned_at) - conversationTimeValue(a.pinned_at);
    if (pinnedAtDelta !== 0) return pinnedAtDelta;
  }
  return conversationTimeValue(b.updated_at) - conversationTimeValue(a.updated_at);
}

function conversationTimeValue(value: string | null | undefined): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function mergeConversationSummary(
  existing: ConversationSummary,
  summary: ConversationSummary,
): ConversationSummary {
  return {
    ...existing,
    ...summary,
    is_pinned: summary.is_pinned !== undefined ? summary.is_pinned : existing.is_pinned,
    pinned_at: summary.pinned_at !== undefined ? summary.pinned_at ?? null : existing.pinned_at ?? null,
  };
}

function normalizeConversationSearch(value: string): string {
  return value.trim().toLowerCase();
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
  required_product?: string;
}): string {
  if (event.quota_exceeded) {
    if (event.message) {
      return event.message;
    }
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

function normalizeRequiredProduct(value?: string): RequiredProduct | null {
  if (value === 'max' || value === 'ultra' || value === 'creator_max_qinbafrank') {
    return 'max';
  }
  return null;
}

function getContextKey(contextType: string, params: URLSearchParams): string {
  if (contextType === 'daily_report') return `daily_report:${params.get('date') || ''}`;
  if (contextType === 'morning_report') return `morning_report:${params.get('date') || ''}`;
  if (contextType === 'twitter_digest') return `twitter_digest:${params.get('date') || ''}`;
  if (contextType === 'stock') return `stock:${params.get('symbol') || ''}`;
  if (contextType === 'brew') return `brew:${params.get('digestId') || ''}`;
  return contextType; // e.g. 'macro'
}

function getPanelContentSignature(
  activeContent: ContentContext,
  contentStack: ContentContext[],
): string {
  return JSON.stringify({ activeContent, contentStack });
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

export function ResearchWorkspace({
  variant = 'research',
  storageKey = STORAGE_KEY,
  conversationScope = 'research',
  defaultPersonaUsername = null,
  lockedPersonaUsername = null,
  personaScope = 'research',
  allowDefaultAssistant = true,
  showPersonaUpsell = true,
  useFullViewport = false,
}: ResearchWorkspaceProps = {}) {
  const router = useRouter();
  const { isLoading: authLoading, signOut, user } = useAuth();
  const { isPro, isMax, isLoading: subLoading } = useSubscription();
  const queryClient = useQueryClient();
  const userId = user?.id ?? null;
  const userTier: 'max' | 'pro' | null = isMax ? 'max' : isPro ? 'pro' : null;
  const [state, dispatch] = useReducer(
    researchReducer,
    undefined,
    () => loadState(storageKey, defaultPersonaUsername ? { personaUsername: defaultPersonaUsername } : {}),
  );
  const isCommunityPanda = variant === 'community_panda';
  const quotaEnabled = !isCommunityPanda;
  const conversationApi = (
    isCommunityPanda ? api.communityPanda.conversations : api.research.conversations
  ) as WorkspaceConversationApi;
  const kolConversationApi = (
    isCommunityPanda ? api.communityPanda.conversations : api.kolResearch.conversations
  ) as WorkspaceConversationApi;
  const kolChatStream = (
    isCommunityPanda ? api.communityPanda.chatStream : api.kolResearch.chatStream
  ) as WorkspaceKolChatStream;
  const shellFrameClass = useFullViewport
    ? 'research-typography fixed inset-0 bg-background z-10 flex'
    : 'research-typography fixed inset-x-0 top-16 bottom-0 bg-background z-10 flex';
  const shellChatFrameClass = useFullViewport
    ? 'research-typography fixed inset-0 flex flex-col bg-background z-10'
    : 'research-typography fixed inset-x-0 top-16 bottom-0 flex flex-col bg-background z-10';
  const [mobileTab, setMobileTab] = useState<'chat' | 'results'>('chat');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [conversationSearchOpen, setConversationSearchOpen] = useState(false);
  const [conversationSearch, setConversationSearch] = useState('');
  const [debouncedConversationSearch, setDebouncedConversationSearch] = useState('');
  const prevPhaseRef = useRef(state.phase);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [quota, setQuota] = useState<{ allowed: boolean; used: number; limit: number; remaining: number; unlimited: boolean } | null>(null);
  // KOL persona / agent kind are *derived* from reducer state so that they
  // survive sessionStorage rehydration. Without this, a page reload would
  // drop personaUsername back to null, and the next message on a KOL
  // conversation would be routed through the research save path — quietly
  // overwriting the conversation's kol_chunks / persona_username on backend.
  const personaUsername = lockedPersonaUsername ?? state.personaUsername;
  const agentKind: AgentKind = personaUsername ? 'kol_research' : 'research';
  // KOL citation chunks now live in reducer state (state.kolChunks) so they
  // survive sessionStorage rehydration and LOAD_CONVERSATION. The cast is
  // a thin bridge from the loose reducer type to the typed api shape.
  const latestKolChunks = state.kolChunks as unknown as KolPersonaChunk[];
  const { has: hasFlag } = useFeatureFlags();
  // kol_research_agent feature flag is fully rolled out — KOL persona chat is
  // available to all signed-in users. The flag definition is preserved in the
  // user-flags backend for fast rollback: restore the gate by replacing the
  // line below with `hasFlag('kol_research_agent')`.
  void hasFlag;
  const kolPersonaEnabled = true;
  const stockContextRef = useRef<StockContextPayload | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia(DESKTOP_HISTORY_QUERY);
    const syncHistoryForViewport = () => {
      setHistoryOpen(mediaQuery.matches);
    };
    syncHistoryForViewport();
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', syncHistoryForViewport);
      return () => mediaQuery.removeEventListener('change', syncHistoryForViewport);
    }
    mediaQuery.addListener(syncHistoryForViewport);
    return () => mediaQuery.removeListener(syncHistoryForViewport);
  }, []);
  const reportContextRef = useRef<DailyReportContextPayload | null>(null);
  const morningContextRef = useRef<MorningReportContextPayload | null>(null);
  const twitterDigestContextRef = useRef<TwitterDigestContextPayload | null>(null);
  const macroPanelContextRef = useRef<MacroPanelContextPayload | null>(null);
  const brewContextRef = useRef<BrewContextPayload | null>(null);
  const convCache = useRef<Map<string, Record<string, unknown>>>(new Map());
  const pendingSeed = useRef<string | null>(null);
  const pendingSeedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSendRef = useRef<((message: string) => Promise<void>) | null>(null);
  const loadingConversationRef = useRef(false);
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const getLoginRedirectPath = useCallback(() => {
    const query = searchParams.toString();
    const basePath = pathname || '/research';
    return query ? `${basePath}?${query}` : basePath;
  }, [pathname, searchParams]);
  const redirectToLogin = useCallback(() => {
    router.push(`/login?redirect=${encodeURIComponent(getLoginRedirectPath())}`);
  }, [getLoginRedirectPath, router]);
  const contextInitialized = useRef(false);
  const skipPanelSaveRef = useRef(true);
  const lastPanelContentSignatureRef = useRef<string | null>(null);
  const latestStateRef = useRef(state);
  // Real "stop generating": holds the in-flight stream's AbortController so the
  // cancel button can abort the fetch. Cancellation is detected PER-TURN via the
  // closure-captured controller.signal.aborted (not a shared flag), so a rapid
  // cancel-then-resend can't let an older turn's late AbortError clobber the new turn.
  const abortRef = useRef<AbortController | null>(null);
  const conversationListNetworkSuccessUserRef = useRef<string | null>(null);
  const conversationUserId = userId ?? 'anonymous';
  const conversationListQueryKey = useMemo(
    () => ['research', 'conversations', conversationScope, conversationUserId, CONVERSATIONS_PAGE_SIZE] as const,
    [conversationScope, conversationUserId],
  );
  const conversationSearchQueryKey = useMemo(
    () => [
      'research',
      'conversations',
      conversationScope,
      conversationUserId,
      CONVERSATION_SEARCH_PAGE_SIZE,
      debouncedConversationSearch,
    ] as const,
    [conversationScope, conversationUserId, debouncedConversationSearch],
  );
  const shouldLoadConversations = !authLoading && !!userId && (state.phase === 'welcome' || historyOpen || conversationSearchOpen);
  const shouldSearchConversations = !authLoading && !!userId && conversationSearchOpen && !!debouncedConversationSearch;
  const storedConversationList = useMemo(
    () => (userId ? readStoredConversations(userId, conversationScope) : undefined),
    [conversationScope, userId],
  );
  const conversationsQuery = useInfiniteQuery<
    ConversationListPage,
    Error,
    ConversationListInfiniteData,
    typeof conversationListQueryKey,
    number
  >({
    queryKey: conversationListQueryKey,
    queryFn: async ({ pageParam }) => {
      const page = await conversationApi.list({
        limit: CONVERSATIONS_PAGE_SIZE,
        offset: pageParam,
      });
      conversationListNetworkSuccessUserRef.current = conversationUserId;
      return page;
    },
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
    retry: 2,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
  const conversations = useMemo(
    () => dedupeConversations(conversationsQuery.data?.pages ?? []),
    [conversationsQuery.data],
  );
  const searchConversationsQuery = useInfiniteQuery<
    ConversationListPage,
    Error,
    ConversationListInfiniteData,
    typeof conversationSearchQueryKey,
    number
  >({
    queryKey: conversationSearchQueryKey,
    queryFn: ({ pageParam }) => conversationApi.list({
      limit: CONVERSATION_SEARCH_PAGE_SIZE,
      offset: pageParam,
      search: debouncedConversationSearch,
    }),
    enabled: shouldSearchConversations,
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage.has_more) return undefined;
      return allPages.reduce((offset, page) => offset + (page.conversations?.length ?? 0), 0);
    },
    staleTime: CONVERSATIONS_STALE_TIME_MS,
    gcTime: CONVERSATIONS_GC_TIME_MS,
    retry: 2,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
  const searchConversations = useMemo(
    () => dedupeConversations(searchConversationsQuery.data?.pages ?? []),
    [searchConversationsQuery.data],
  );
  const conversationsLoading =
    shouldLoadConversations &&
    conversations.length === 0 &&
    (conversationsQuery.isLoading || conversationsQuery.isFetching);
  const conversationsLoaded = !shouldLoadConversations || conversations.length > 0 || !conversationsLoading;
  const conversationListError = conversationsQuery.isError && conversations.length === 0
    ? '历史对话加载失败，请重试'
    : null;
  const conversationSearchError = searchConversationsQuery.isError && searchConversations.length === 0
    ? '搜索失败，请重试'
    : null;
  const hasMoreConversations = !!conversationsQuery.hasNextPage;
  const loadingMoreConversations = conversationsQuery.isFetchingNextPage;
  const hasMoreSearchConversations = !!searchConversationsQuery.hasNextPage;
  const loadingMoreSearchConversations = searchConversationsQuery.isFetchingNextPage;
  // Drive the quota indicator from the backend response, not from `isMax`.
  // In local dev `NEXT_PUBLIC_ENABLE_PAYWALL=false` flips `isMax` to true for
  // every signed-in user (so they can exercise Max-only features), but the
  // backend `/api/research/quota` is the source of truth for the free-account
  // cap. Trusting the backend here keeps the displayed counter and the
  // disabled-input gate aligned with what the agent endpoints actually enforce.
  // The same quota is shared between research and KOL chat — see
  // backend/app/features/quota/service.py + kol_research router.
  const effectiveQuota = userId ? quota : null;

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedConversationSearch(normalizeConversationSearch(conversationSearch));
    }, 180);
    return () => clearTimeout(timer);
  }, [conversationSearch]);

  useEffect(() => {
    latestStateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (!lockedPersonaUsername) return;
    if (state.personaUsername === lockedPersonaUsername) return;
    dispatch({ type: 'SET_PERSONA', personaUsername: lockedPersonaUsername });
  }, [lockedPersonaUsername, state.personaUsername]);

  // Anonymous visitors can browse the research desk, but persisted chat state
  // belongs to the signed-in user who created it. Clear restored conversations
  // before rendering the anonymous experience so signing out does not expose
  // prior messages from sessionStorage.
  useEffect(() => {
    if (authLoading || userId) return;
    if (!state.conversationId && state.messages.length === 0) return;
    dispatch({ type: 'RESET' });
  }, [authLoading, userId, state.conversationId, state.messages.length]);

  useEffect(() => {
    if (authLoading || userId || !state.isLoading || !pendingSeed.current) return;
    dispatch({ type: 'SET_LOADING', loading: false });
  }, [authLoading, userId, state.isLoading]);

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
        const raw = sessionStorage.getItem(storageKey);
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
    } else if (contextType === 'twitter_digest') {
      const date = searchParams.get('date') || '';
      dispatch({
        type: 'CONTEXT_ENTRY',
        key: contextKey,
        content: {
          type: 'twitter_digest',
          label: date ? `${date} 推特日报` : '推特日报',
          summary: '',
          params: date ? { date } : {},
          available_actions: ['看 KOL 多空打架', '深入某只票的博主观点', '看 watchpoints'],
        },
      });
      pendingSeed.current = date
        ? `帮我解读 ${date} 的推特日报`
        : '今天 KOL 都在聊什么？';
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
  }, [searchParams, storageKey, dispatch]);

  // KOL persona URL entry — /research?agent=kol&persona=qinbafrank&q=...
  // Legacy symbol-only links are converted into a default ticker question.
  // Used by `/kol/[username]` overview, sector detail pages, etc to deep-link
  // into a KOL chat with a starter question. Re-processes on every URL change
  // (so clicking a second starter from a different page picks up the new q),
  // and dispatches RESET when q is present so each starter opens a fresh chat
  // — prior in-flight conversation, if any, is auto-saved via handleSend and
  // accessible from the history sidebar.
  const lastProcessedKolSeed = useRef('');
  const manualPersonaUrlOverride = useRef<{
    agentKind: AgentKind;
    personaUsername: string | null;
  } | null>(null);
  useEffect(() => {
    if (loadingConversationRef.current) return;

    const agentParam = searchParams.get('agent');
    const personaParam = searchParams.get('persona');

    // PersonaSelector changes state before Next has replaced the URL. During
    // that one render, the old ?agent=kol&persona=... params are still visible;
    // ignore them so they do not immediately re-assert stale KOL state.
    const manualOverride = manualPersonaUrlOverride.current;
    if (manualOverride) {
      if (manualOverride.agentKind === 'research') {
        if (agentParam === 'kol') return;
        manualPersonaUrlOverride.current = null;
      } else if (
        agentParam !== 'kol' ||
        personaParam !== manualOverride.personaUsername
      ) {
        return;
      } else {
        manualPersonaUrlOverride.current = null;
      }
    }

    if (agentParam !== 'kol' || !personaParam) return;
    if (personaParam.toLowerCase() === 'pandacircle' && !isCommunityPanda) {
      router.replace('/panda');
      return;
    }

    // Seed gate fires once per (persona, q) tuple — prevents the same
    // starter URL from RESET-ing the conversation again if the user
    // navigates away and back without changing q. Empty q is never seeded.
    let seedQ = searchParams.get('q') ?? '';
    const symbolParam = searchParams.get('symbol')?.trim();
    if (!seedQ && symbolParam) {
      const personaName = personaParam.toLowerCase() === 'qinbafrank'
        ? 'Frank'
        : getPersonaDisplayLabel(personaParam, personaParam);
      seedQ = `按 ${personaName} 的框架分析 ${symbolParam.toUpperCase()}：他怎么看这个标的、核心逻辑是什么、有哪些原文依据？`;
    }
    if (!seedQ) {
      if (state.personaUsername !== personaParam) {
        dispatch({ type: 'SWITCH_PERSONA', personaUsername: personaParam });
      }
      return;
    }
    const signature = `${personaParam}|${seedQ}`;
    if (lastProcessedKolSeed.current === signature) return;

    if (!userId) {
      if (state.personaUsername !== personaParam) {
        dispatch({ type: 'SWITCH_PERSONA', personaUsername: personaParam });
      }
      return;
    }

    const firstUserMessage = state.messages.find((m) => m.role === 'user');
    const hasRestoredSeedConversation = (
      state.phase === 'chat' &&
      state.personaUsername === personaParam &&
      firstUserMessage?.content === seedQ
    );
    if (hasRestoredSeedConversation) {
      lastProcessedKolSeed.current = signature;
      return;
    }

    lastProcessedKolSeed.current = signature;

    // Seeded entries always start a fresh conversation — drop current state
    // (saved server-side already) so the seed becomes turn 1.
    dispatch({ type: 'RESET' });
    dispatch({ type: 'SET_PERSONA', personaUsername: personaParam });
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
  }, [isCommunityPanda, router, searchParams, state.phase, state.personaUsername, state.messages, userId]);

  const handlePersonaChange = useCallback((next: {
    agentKind: AgentKind;
    personaUsername: string | null;
  }) => {
    if (lockedPersonaUsername) {
      dispatch({ type: 'SET_PERSONA', personaUsername: lockedPersonaUsername });
      return;
    }
    manualPersonaUrlOverride.current = next;
    dispatch({ type: 'SWITCH_PERSONA', personaUsername: next.personaUsername });

    const params = new URLSearchParams(searchParams.toString());
    params.delete('q');
    params.delete('symbol');
    if (next.agentKind === 'kol_research' && next.personaUsername) {
      params.set('agent', 'kol');
      params.set('persona', next.personaUsername);
    } else {
      params.delete('agent');
      params.delete('persona');
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : (pathname || '/research'), { scroll: false });
  }, [lockedPersonaUsername, pathname, router, searchParams]);

  const syncUrlToLoadedConversation = useCallback((loadedPersona: string | null) => {
    if (lockedPersonaUsername) {
      manualPersonaUrlOverride.current = {
        agentKind: 'kol_research',
        personaUsername: lockedPersonaUsername,
      };
      return;
    }
    const nextOverride: { agentKind: AgentKind; personaUsername: string | null } = loadedPersona
      ? { agentKind: 'kol_research', personaUsername: loadedPersona }
      : { agentKind: 'research', personaUsername: null };
    manualPersonaUrlOverride.current = nextOverride;

    const params = new URLSearchParams(searchParams.toString());
    params.delete('q');
    params.delete('symbol');
    if (loadedPersona) {
      params.set('agent', 'kol');
      params.set('persona', loadedPersona);
    } else {
      params.delete('agent');
      params.delete('persona');
    }

    const query = params.toString();
    const nextPath = query ? `${pathname}?${query}` : (pathname || '/research');
    const currentQuery = searchParams.toString();
    const currentPath = currentQuery ? `${pathname}?${currentQuery}` : (pathname || '/research');
    if (nextPath !== currentPath) {
      router.replace(nextPath, { scroll: false });
    }
  }, [lockedPersonaUsername, pathname, router, searchParams]);

  // Persist state to sessionStorage on change
  useEffect(() => {
    saveState(state, storageKey);
  }, [state, storageKey]);

  // Phase 1 reconciliation: on initial mount, if sessionStorage rehydrated a
  // conversation, double-check the runtime to pick up any new messages that
  // landed since this tab last persisted (e.g., a turn finished on another
  // device, or the picker save was lagging). Runs ONCE per mount so the user
  // never gets re-fetched mid-conversation.
  const runtimeReconciledRef = useRef(false);
  useEffect(() => {
    if (runtimeReconciledRef.current) return;
    if (!userId) return;
    if (loadingConversationRef.current) return;
    const cid = state.conversationId;
    if (!cid) return;
    if (state.isLoading) return; // mid-turn — don't yank the rug
    runtimeReconciledRef.current = true;
    const inferredAgentId: 'research_agent' | 'kol_research_agent' =
      personaUsername ? 'kol_research_agent' : 'research_agent';
    api.agentRuntime
      .getSession(cid, inferredAgentId)
      .then((rt) => {
        if (!rt || !rt.entries || rt.entries.length === 0) return;
        // Replace the local message list when runtime is *strictly more
        // complete* than what's already on screen. Same-or-fewer entries
        // normally means the local sessionStorage state already reflects the
        // latest known turn, and overwriting would discard any in-progress
        // typing buffer.
        //
        // Exception: if the local tail is a half-finished SSE turn — either a
        // streaming-flagged assistant bubble or an empty placeholder — the
        // user切走了页面让 SSE reader 中断，runtime 已经在后端写完了完整消息
        // 但条数恰好与本地相等。此时必须用 runtime 覆盖，否则那条 streaming
        // 消息会永远显示"转圈"状态，整个会话看起来一直 load 不出来。
        const localCount = state.messages.length;
        const localTail = state.messages[localCount - 1];
        const localTailStuck = !!localTail
          && localTail.role === 'assistant'
          && (localTail.streaming === true
            || (typeof localTail.content === 'string' && localTail.content.trim() === ''));
        if (rt.entries.length <= localCount && !localTailStuck) return;
        const merged = rt.entries.map((entry, idx) => ({
          id: (entry.client_event_id || entry.id || `runtime-${idx}`) as string,
          role: entry.role,
          content: entry.content,
          sessionId: cid,
          turnId: entry.turn_id ?? null,
          clientEventId: entry.client_event_id ?? null,
          messageEventId: entry.id ?? null,
          feedbackSentiment: entry.feedback_sentiment ?? null,
          feedbackReason: entry.feedback_reason ?? null,
          feedbackAt: entry.feedback_at ?? null,
          feedbackPayload: entry.feedback_payload ?? {},
        })) as ChatMsg[];
        const uiState = rt.ui_state as
          | { active_content?: unknown; content_stack?: unknown }
          | null;
        skipPanelSaveRef.current = true;
        dispatch({
          type: 'LOAD_CONVERSATION',
          data: {
            conversationId: cid,
            title: (rt.title as string | null) || state.conversationTitle || '',
            messages: merged,
            accumulatedFilters: state.accumulatedFilters,
            candidates: state.candidates as unknown as LoadConversationData['candidates'],
            candidateCount: state.candidateCount,
            universeSize: state.universeSize,
            recommendations: state.recommendations as unknown as LoadConversationData['recommendations'],
            funnelSteps: state.funnelSteps,
            activeContent: (uiState?.active_content as LoadConversationData['activeContent']) ?? state.activeContent,
            contentStack: (Array.isArray(uiState?.content_stack) ? uiState!.content_stack : state.contentStack) as LoadConversationData['contentStack'],
            kolChunks: state.kolChunks,
            personaUsername,
          },
        });
      })
      .catch(() => {
        // Best-effort; silently fall back to sessionStorage state.
      });
    // We intentionally depend on userId + state.conversationId only — the
    // effect must NOT re-run when messages mutate during a turn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, state.conversationId]);

  // Persist the paginated sidebar list so returning to /research does not
  // re-fetch the same lightweight history page on every mount.
  useEffect(() => {
    if (!userId || !conversationsQuery.data) return;
    if (conversationListNetworkSuccessUserRef.current !== userId) return;
    if (storedConversationList && !conversationsQuery.isFetchedAfterMount) return;
    writeStoredConversations(userId, conversationsQuery.data, conversationScope);
  }, [
    conversationScope,
    userId,
    conversationsQuery.data,
    conversationsQuery.dataUpdatedAt,
    conversationsQuery.isFetchedAfterMount,
    storedConversationList,
  ]);

  // localStorage is only a first-paint cache. Always reconcile it with the
  // authenticated backend after mount so an old empty cache cannot become sticky.
  useEffect(() => {
    if (!shouldLoadConversations || !storedConversationList || conversationsQuery.isFetchedAfterMount) return;
    if (conversationsQuery.isFetching) return;
    void conversationsQuery.refetch();
  }, [
    shouldLoadConversations,
    storedConversationList,
    conversationsQuery.isFetchedAfterMount,
    conversationsQuery.isFetching,
    conversationsQuery.refetch,
    conversationsQuery,
  ]);

  const handleRetryConversations = useCallback(() => {
    if (userId) removeStoredConversations(userId, conversationScope);
    void conversationsQuery.refetch();
  }, [conversationScope, conversationsQuery, userId]);

  const handleRetryConversationSearch = useCallback(() => {
    void searchConversationsQuery.refetch();
  }, [searchConversationsQuery]);

  // Load the next page of conversations on "加载更多".
  // Appends to existing list and dedupes on id — protects against the rare
  // case where a refresh races with load-more and the same row appears twice.
  const handleLoadMoreConversations = useCallback(async () => {
    if (loadingMoreConversations || !hasMoreConversations) return;
    await conversationsQuery.fetchNextPage().catch(() => {
      // Silently ignore — user can retry by clicking again
    });
  }, [conversationsQuery, hasMoreConversations, loadingMoreConversations]);

  const handleLoadMoreSearchConversations = useCallback(async () => {
    if (loadingMoreSearchConversations || !hasMoreSearchConversations) return;
    await searchConversationsQuery.fetchNextPage().catch(() => {
      // Silently ignore — user can retry by clicking again
    });
  }, [hasMoreSearchConversations, loadingMoreSearchConversations, searchConversationsQuery]);

  // Fetch quota for signed-in users on mount and when messages change. Wait
  // for auth/subscription hydration so a paid Max user is not briefly rendered
  // with the wrong free-account quota. Anonymous visitors can browse the page
  // but cannot send, so quota UI stays hidden until login.
  useEffect(() => {
    if (!quotaEnabled) {
      setQuota(null);
      return;
    }
    if (authLoading || subLoading) return;
    if (!userId) {
      setQuota(null);
      return;
    }

    let cancelled = false;
    api.research.quota({ requiredAuth: true }).then(q => {
      if (!cancelled && q.success) setQuota(q);
    }).catch(() => {
      if (!cancelled) {
        setQuota(null);
      }
    });
    return () => { cancelled = true; };
  }, [quotaEnabled, state.messages.length, authLoading, subLoading, userId]);

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

  const upsertConversationSummary = useCallback((
    summary: ConversationSummary,
    options: { promote?: boolean } = {},
  ) => {
    const promote = options.promote ?? true;
    queryClient.setQueryData<ConversationListInfiniteData>(conversationListQueryKey, (old) => {
      if (!promote) {
        if (!old) return old;
        let found = false;
        const pages = old.pages.map((page) => ({
          ...page,
          conversations: (page.conversations ?? []).map((conv) => {
            if (conv.id !== summary.id) return conv;
            found = true;
            return mergeConversationSummary(conv, {
              ...summary,
              updated_at: conv.updated_at || summary.updated_at,
            });
          }),
        }));
        return found ? { ...old, pages } : old;
      }

      if (!old) {
        return {
          pages: [{ conversations: [summary], has_more: false }],
          pageParams: [0],
        };
      }

      const existing = old.pages
        .flatMap((page) => page.conversations ?? [])
        .find((conv) => conv.id === summary.id);
      const nextSummary = existing ? mergeConversationSummary(existing, summary) : summary;
      const firstPage = old.pages[0] ?? { conversations: [], has_more: false };
      const restPages = old.pages.slice(1);
      const nextFirstPage: ConversationListPage = {
        ...firstPage,
        conversations: [
          nextSummary,
          ...(firstPage?.conversations ?? []).filter((conv) => conv.id !== summary.id),
        ].sort(compareConversationSummaries),
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

  const updateConversationSummaryInLoadedCaches = useCallback((summary: ConversationSummary) => {
    queryClient.setQueriesData<ConversationListInfiniteData>(
      { queryKey: ['research', 'conversations', conversationScope, conversationUserId], exact: false },
      (old) => {
        if (!old) return old;
        let found = false;
        const pages = old.pages.map((page) => ({
          ...page,
          conversations: (page.conversations ?? []).map((conversation) => {
            if (conversation.id !== summary.id) return conversation;
            found = true;
            return mergeConversationSummary(conversation, summary);
          }),
        }));
        return found ? { ...old, pages } : old;
      },
    );
  }, [conversationScope, conversationUserId, queryClient]);

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
    createId?: string,
    options: { touch?: boolean } = {},
  ) => {
    const touch = options.touch ?? true;
    setSaveStatus('saving');
    try {
      if (!convId) {
        const created = await conversationApi.create({
          id: createId,
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
        await conversationApi.update(convId, {
          title,
          data,
          message_count: messageCount,
          touch,
        });
        convCache.current.set(convId, { title, data });
        upsertConversationSummary({
          id: convId,
          title,
          message_count: messageCount,
          updated_at: new Date().toISOString(),
        }, { promote: touch });
      }
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('idle');
    }
  }, [conversationApi, upsertConversationSummary]);

  // Persist panel state to backend when user navigates the right panel
  // (catches navigation that happens between or after chat messages)
  useEffect(() => {
    const panelContentSignature = getPanelContentSignature(state.activeContent, state.contentStack);
    if (skipPanelSaveRef.current) {
      skipPanelSaveRef.current = false;
      lastPanelContentSignatureRef.current = panelContentSignature;
      return;
    }
    // KOL conversations are persisted by handleKolSend through the
    // /api/kol_research/conversations endpoint with kol_chunks + persona_username
    // in the data payload. Running this research-style save against a KOL
    // conversation would overwrite data with a payload that has neither field,
    // and the right-side citation panel would come back empty next time the
    // conversation is loaded.
    if (agentKind === 'kol_research') {
      lastPanelContentSignatureRef.current = panelContentSignature;
      return;
    }
    if (lastPanelContentSignatureRef.current === panelContentSignature) return;
    const s = latestStateRef.current;
    if (!s.conversationId || s.messages.length === 0) return;
    lastPanelContentSignatureRef.current = panelContentSignature;

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
    if (!userId) {
      dispatch({ type: 'SET_LOADING', loading: false });
      return;
    }
    const seed = pendingSeed.current;
    pendingSeed.current = null;
    // Small delay to ensure React state from CONTEXT_ENTRY has settled before sending
    if (pendingSeedTimerRef.current) clearTimeout(pendingSeedTimerRef.current);
    pendingSeedTimerRef.current = setTimeout(() => {
      pendingSeedTimerRef.current = null;
      handleSendRef.current?.(seed);
    }, 100);
  }, [userId]);

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

  // Receive twitter digest data from TwitterDigestView for Agent context
  const handleTwitterDigestContextReady = useCallback((payload: TwitterDigestContextPayload) => {
    twitterDigestContextRef.current = payload;
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

  const buildActiveContext = useCallback((): ResearchRequest['active_context'] => {
    if (state.activeContent.type === 'stock' && stockContextRef.current) {
      const ctx = stockContextRef.current;
      return {
        type: ctx.type,
        symbol: ctx.symbol,
        quote: ctx.quote ?? undefined,
        fundamentals: ctx.fundamentals ?? undefined,
        earnings_history: ctx.earnings_history ?? undefined,
        financial_growth: ctx.financial_growth ?? undefined,
        income_statements: ctx.income_statements ?? undefined,
        technical_derived: ctx.technical_derived ?? undefined,
        support_resistance: ctx.support_resistance ?? undefined,
        recent_news: ctx.recent_news ?? undefined,
      };
    }
    if (state.activeContent.type === 'stock' && state.activeContent.params.symbol) {
      return {
        type: 'stock',
        symbol: state.activeContent.params.symbol,
      };
    }
    if (state.activeContent.type === 'daily_report' && reportContextRef.current) {
      const ctx = reportContextRef.current;
      return {
        type: ctx.type,
        date: ctx.date,
        title: ctx.title ?? undefined,
        summary: ctx.summary ?? undefined,
        intro: ctx.intro ?? undefined,
        news: ctx.news ?? undefined,
        report_summary: ctx.report_summary ?? undefined,
        calendar: ctx.calendar ?? undefined,
      };
    }
    if (state.activeContent.type === 'morning_report' && morningContextRef.current) {
      const ctx = morningContextRef.current;
      return {
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
    }
    if (state.activeContent.type === 'twitter_digest' && twitterDigestContextRef.current) {
      const ctx = twitterDigestContextRef.current;
      return {
        type: ctx.type,
        date: ctx.date,
        headline: ctx.headline,
        hot_tickers: ctx.hot_tickers,
        ticker_theses: ctx.ticker_theses,
        macro_threads: ctx.macro_threads,
        watchpoints: ctx.watchpoints,
      };
    }
    if (
      (state.activeContent.type === 'macro' || state.activeContent.type.startsWith('macro_')) &&
      macroPanelContextRef.current
    ) {
      const ctx = macroPanelContextRef.current;
      return {
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
    }
    if (state.activeContent.type === 'brew' && brewContextRef.current) {
      const ctx = brewContextRef.current;
      return {
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
    return undefined;
  }, [state.activeContent]);

  // Send message handler
  // KOL-mode send. Independent codepath: we don't touch screener candidates / filters.
  const handleKolSend = useCallback(async (message: string) => {
    if (message.trim().length > KOL_MESSAGE_CHAR_LIMIT) {
      dispatch({ type: 'SET_ERROR', error: `问题太长了，请压缩到 ${KOL_MESSAGE_CHAR_LIMIT} 字以内再发送` });
      return;
    }
    const conversationIdForTurn = latestStateRef.current.conversationId ?? crypto.randomUUID();
    const turnId = crypto.randomUUID();
    dispatch({ type: 'SEND_MESSAGE', message, sessionId: conversationIdForTurn, turnId });
    try {
      const history = buildCompactHistory(state.messages, KOL_HISTORY_LIMIT);
      const existingChunks = (latestStateRef.current.kolChunks as unknown as KolPersonaChunk[]) || [];
      const activeContext = buildActiveContext();

      let finalMessage = '';
      let finalChunks: KolPersonaChunk[] = [];
      let finalOptions: string[] = [];
      let finalNavigate: { type: string; params: Record<string, string>; reason?: string } | null = null;
      let errored = false;

      const controller = new AbortController();
      abortRef.current = controller;

      await kolChatStream(
        {
          message,
          history: SEND_RUNTIME_HISTORY ? history : undefined,
          persona_username: personaUsername || 'qinbafrank',
          session_id: conversationIdForTurn,
          conversation_id: conversationIdForTurn,
          turn_id: turnId,
          content_context: activeContext as Record<string, unknown> | undefined,
        },
        (event: KolResearchStreamEvent) => {
          if (event.type === 'skill_activated') {
            dispatch({
              type: 'TOOL_ACTIVITY',
              tool: 'load_skill',
              description: event.description,
              status: 'start',
            });
          } else if (event.type === 'tool_call_start') {
            dispatch({
              type: 'TOOL_ACTIVITY',
              tool: event.tool,
              description: event.description,
              status: 'start',
            });
          } else if (event.type === 'tool_call_end') {
            // no-op — keep description visible until next event
          } else if (event.type === 'message_delta') {
            // Token-by-token streaming: append to the in-progress assistant msg.
            dispatch({ type: 'STREAM_DELTA', kind: 'message', text: event.text, sessionId: conversationIdForTurn, turnId });
          } else if (event.type === 'thinking') {
            // Chain-of-thought chunk: accumulate on the same in-progress msg.
            dispatch({ type: 'STREAM_DELTA', kind: 'thinking', text: event.text, sessionId: conversationIdForTurn, turnId });
          } else if (event.type === 'final') {
            finalMessage = event.data.message;
            finalChunks = event.data.kol_chunks || [];
            finalOptions = Array.isArray(event.data.options)
              ? event.data.options.filter((option): option is string => typeof option === 'string' && option.trim().length > 0)
              : [];
            finalNavigate = (event.data.navigate as typeof finalNavigate) || null;
          } else if (event.type === 'error') {
            if (controller.signal.aborted) return; // this turn was cancelled — handled by handleCancelLoading
            errored = true;
            // Log the full backend error payload so the console shows code +
            // raw message even after we map it to a user-facing string. Grep
            // "[KOL Research] backend error" to find these in DevTools.
            console.warn('[KOL Research] backend error event:', event);
            dispatch({
              type: 'SET_ERROR',
              error: getAgentErrorMessage(event),
              requiredProduct: normalizeRequiredProduct(event.required_product),
            });
          }
        },
        controller.signal,
      );

      if (controller.signal.aborted) return; // intentional cancel — keep partial answer
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

      const fallbackOptions = buildKolFollowUpOptions({
        userMessage: message,
        assistantMessage: finalMessage,
        chunks: finalChunks.length > 0 ? finalChunks : existingChunks,
        contentContext: activeContext as Record<string, unknown> | undefined,
      });

      // Reuse RECEIVE_RESPONSE by mapping KOL output onto a minimal ResearchResult shape.
      const result: ResearchResult = {
        success: true,
        message: finalMessage,
        options: finalOptions.length > 0 ? finalOptions : fallbackOptions,
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
      const personaTitleLabel = getPersonaDisplayLabel(persona, persona);
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
        titleForRespose = `${personaTitleLabel} · ${preview}`;
      } else {
        // Preserve existing title (reducer keeps state.conversationTitle when
        // result.title is empty — see RECEIVE_RESPONSE case).
        titleForRespose = '';
      }

      // Route title through RECEIVE_RESPONSE so it lands in state.conversationTitle.
      const resultWithTitle: ResearchResult = { ...result, title: titleForRespose };
      const chunksToPersist = finalChunks.length > 0 ? finalChunks : existingChunks;
      dispatch({ type: 'RECEIVE_RESPONSE', result: resultWithTitle, sessionId: conversationIdForTurn, turnId });
      dispatch({
        type: 'SET_KOL_CHUNKS',
        chunks: chunksToPersist as unknown as Record<string, unknown>[],
      });

      // Persist to KOL conversations table.
      try {
        const finalTitle = isFirstTurn
          ? titleForRespose
          : latestState.conversationTitle || `${personaTitleLabel} 对话`;
        // IMPORTANT: latestStateRef.current.messages already contains the
        // user message (added by SEND_MESSAGE earlier in this function) and
        // the finalized assistant message (added by STREAM_DELTA + upgraded
        // in-place by RECEIVE_RESPONSE). The closure-captured state.messages
        // is what existed *before* this turn began. Use that as the base,
        // then append the current user + assistant manually — otherwise we
        // double-record the turn (which is exactly the bug that caused every
        // saved KOL conversation to grow at 2× the visible rate).
        const allMessages = buildKolPersistedMessages({
          existingMessages: state.messages,
          isFirstTurn,
          userMessage: message,
          assistantMessage: finalMessage,
          assistantOptions: result.options,
        });
        const convData: Record<string, unknown> = {
          messages: allMessages,
          kol_chunks: chunksToPersist,
          persona_username: persona,
          content_stack: latestState.contentStack,
        };
        if (latestState.activeContent.type !== 'screener') {
          convData.active_content = latestState.activeContent;
        }
        if (isFirstTurn) {
          const created = await kolConversationApi.create({
            id: conversationIdForTurn,
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
          await kolConversationApi.update(latestState.conversationId, {
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
  }, [buildActiveContext, kolChatStream, kolConversationApi, state.messages, personaUsername, upsertConversationSummary]);

  const handleSend = useCallback(async (message: string) => {
    if (!userId) {
      redirectToLogin();
      return;
    }
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
    const conversationIdForTurn = latestStateRef.current.conversationId ?? crypto.randomUUID();
    const turnId = crypto.randomUUID();
    dispatch({ type: 'SEND_MESSAGE', message, sessionId: conversationIdForTurn, turnId });

    try {
      const activeContext = buildActiveContext();

      let streamResult: ResearchResult | null = null;
      let streamErrorHandled = false;

      await api.research.chatStream(
        {
          message,
          history: SEND_RUNTIME_HISTORY ? buildHistory() : undefined,
          accumulated_filters: state.accumulatedFilters.length > 0
            ? state.accumulatedFilters
            : undefined,
          session_id: conversationIdForTurn,
          conversation_id: conversationIdForTurn,
          turn_id: turnId,
          active_context: activeContext || undefined,
        },
        (event) => {
          if (event.type === 'tool_call_start' && event.tool && event.description) {
            dispatch({ type: 'TOOL_ACTIVITY', tool: event.tool!, description: event.description!, status: 'start' });
          } else if (event.type === 'tool_call_end') {
            // Don't dispatch end — let the description stay visible.
            // It gets replaced by the next tool_call_start or cleared by RECEIVE_RESPONSE.
          } else if (event.type === 'done' && event.result) {
            streamResult = event.result as ResearchResult;
          } else if (event.type === 'error') {
            streamErrorHandled = true;
            dispatch({
              type: 'SET_ERROR',
              error: getAgentErrorMessage(event),
              requiredProduct: normalizeRequiredProduct(event.required_product),
            });
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

      dispatch({ type: 'RECEIVE_RESPONSE', result, sessionId: conversationIdForTurn, turnId });
      trackScreenerFilterUsed({
        result,
        queryLength: message.trim().length,
        conversationId: conversationIdForTurn,
      });

      // Handle agent-driven navigation (e.g. "show me NVDA" or "show daily report")
      let saveActiveContent: ContentContext = state.activeContent;
      let saveContentStack: ContentContext[] = state.contentStack;
      const pushPanelContent = (content: ContentContext) => {
        dispatch({ type: 'PUSH_CONTENT', content });
        saveActiveContent = content;
        saveContentStack = [...state.contentStack, state.activeContent];
        setMobileTab('results');
      };
      const switchToScreener = () => {
        stockContextRef.current = null;
        reportContextRef.current = null;
        morningContextRef.current = null;
        macroPanelContextRef.current = null;
        brewContextRef.current = null;
        dispatch({ type: 'SWITCH_CONTENT', content: SCREENER_CONTENT });
        saveActiveContent = SCREENER_CONTENT;
        saveContentStack = [];
        setMobileTab('results');
      };
      const hasFreshScreenerResults =
        result.navigate?.type === 'screener' ||
        result.reset_results ||
        result.candidates.length > 0 ||
        result.recommendations.length > 0;

      if (hasFreshScreenerResults) {
        switchToScreener();
      } else if (result.navigate?.type === 'stock' && result.navigate.params?.symbol) {
        const symbol = result.navigate.params.symbol;
        stockContextRef.current = null;
        pushPanelContent({
          type: 'stock',
          label: `${symbol} 个股研究`,
          summary: symbol,
          params: { symbol, ...(result.navigate.params?.tab ? { tab: result.navigate.params.tab } : {}) },
          available_actions: ['查看基本面', '技术分析', '返回选股'],
        });
      } else if (result.navigate?.type === 'daily_report') {
        reportContextRef.current = null;
        pushPanelContent({
          type: 'daily_report',
          label: '市场日报',
          summary: '',
          params: { date: result.navigate.params?.date ?? '' },
          available_actions: ['追问日报内容', '查看提到的个股', '查看宏观背景'],
        });
      } else if (result.navigate?.type === 'morning_report') {
        morningContextRef.current = null;
        pushPanelContent({
          type: 'morning_report',
          label: '盘前早报',
          summary: '',
          params: { date: result.navigate.params?.date ?? '' },
          available_actions: ['解读早报要点', '分析期货动向', '看今日市场焦点'],
        });
      } else if (result.navigate?.type === 'twitter_digest') {
        twitterDigestContextRef.current = null;
        pushPanelContent({
          type: 'twitter_digest',
          label: '推特日报',
          summary: '',
          params: { date: result.navigate.params?.date ?? '' },
          available_actions: ['看 KOL 多空打架', '深入某只票的博主观点', '看 watchpoints'],
        });
      } else if (result.navigate?.type === 'macro') {
        macroPanelContextRef.current = null;
        pushPanelContent({
          type: 'macro',
          label: '宏观风险仪表盘',
          summary: '',
          params: { ...(result.navigate.params?.tab ? { tab: result.navigate.params.tab } : {}) },
          available_actions: ['深入某个维度', '查看对持仓影响', '返回选股'],
        });
      } else if (result.navigate?.type === 'brew') {
        brewContextRef.current = null;
        pushPanelContent({
          type: 'brew',
          label: '专属日报',
          summary: '',
          params: {},
          available_actions: ['追问持仓表现', '查看个股详情', '查看宏观背景'],
        });
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
        pushPanelContent({
          type: 'macro',
          label: '宏观风险仪表盘',
          summary: '',
          params: { tab: tabMap[result.navigate.type] },
          available_actions: ['深入某个维度', '查看对持仓影响', '返回选股'],
        });
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
        saveActiveContent,
        saveContentStack,
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
        isFirstTurn ? conversationIdForTurn : undefined,
      );
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[Screener] handleSend error:', err);
      }
      const authError = getAuthErrorPresentation(err, 'AI 助手暂时无法响应');
      if (authError.shouldRedirectToLogin) {
        await signOut().catch(() => {});
        redirectToLogin();
        return;
      }
      dispatch({ type: 'SET_ERROR', error: authError.message });
    }
  }, [agentKind, personaUsername, handleKolSend, buildHistory, buildActiveContext, state.isLoading, state.accumulatedFilters, state.activeContent, state.contentStack, state.conversationId, state.conversationTitle, state.messages, state.funnelSteps, state.kolChunks, buildConversationData, saveConversation, signOut, userId, redirectToLogin]);

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
    abortRef.current?.abort();
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
    const savedPersona = lockedPersonaUsername ?? (data.persona_username as string | undefined) ?? null;
    syncUrlToLoadedConversation(savedPersona);
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
  }, [lockedPersonaUsername, syncUrlToLoadedConversation]);

  const handleLoadConversation = useCallback(async (conversationId: string) => {
    if (pendingSeedTimerRef.current) clearTimeout(pendingSeedTimerRef.current);
    pendingSeed.current = null;
    loadingConversationRef.current = true;

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
      loadingConversationRef.current = false;
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

    // Phase 1 restore strategy:
    //   1. Picker conversation is still fetched first because it carries the
    //      research-specific extras (accumulated_filters, candidates,
    //      recommendations, funnel, kol_chunks, persona_username) that the
    //      durable runtime store does not track.
    //   2. Picker's `data.persona_username` tells us whether to ask the
    //      runtime for `kol_research_agent` or `research_agent` events.
    //   3. Runtime is consulted in parallel. If it has any entries, runtime
    //      becomes the source of truth for the visible message list and the
    //      right-panel ui_state — picker is treated as a cache that may have
    //      missed a save mid-conversation.
    //   4. If runtime has no session row, the picker payload is used as-is,
    //      matching the pre-runtime behavior.
    const failConversationLoad = () => {
      syncUrlToLoadedConversation(null);
      dispatch({
        type: 'LOAD_CONVERSATION',
        data: {
          conversationId,
          title: summary?.title || '历史对话',
          messages: [{
            id: `conversation-load-error-${Date.now()}`,
            role: 'assistant',
            content: '历史对话加载失败，请重试',
            isError: true,
          }],
          accumulatedFilters: [],
          candidates: [],
          candidateCount: 0,
          universeSize: 0,
          recommendations: [],
          funnelSteps: [],
        },
      });
    };

    try {
      let picker: Record<string, unknown> | null = null;
      try {
        picker = await conversationApi.get(conversationId);
      } catch {
        picker = null;
      }
      const pickerData = ((picker?.data || {}) as Record<string, unknown>);
      const inferredAgentId: 'research_agent' | 'kol_research_agent' =
        typeof pickerData.persona_username === 'string' && pickerData.persona_username
          ? 'kol_research_agent'
          : 'research_agent';
      let runtimeSession = null;
      try {
        runtimeSession = await api.agentRuntime.getSession(conversationId, inferredAgentId);
      } catch (runtimeError) {
        if (!picker) throw runtimeError;
      }
      if (!runtimeSession && !picker) {
        const alternateAgentId = inferredAgentId === 'research_agent'
          ? 'kol_research_agent'
          : 'research_agent';
        runtimeSession = await api.agentRuntime.getSession(conversationId, alternateAgentId);
      }

      if (!runtimeSession && !picker) {
        failConversationLoad();
        return;
      }

      const merged: Record<string, unknown> = { ...(picker || {}) };
      const mergedData: Record<string, unknown> = { ...pickerData };

      if (runtimeSession) {
        if (runtimeSession.entries && runtimeSession.entries.length > 0) {
          mergedData.messages = runtimeSession.entries.map((entry, idx) => ({
            id: entry.client_event_id || entry.id || `runtime-${idx}`,
            role: entry.role,
            content: entry.content,
            sessionId: conversationId,
            turnId: entry.turn_id ?? null,
            clientEventId: entry.client_event_id ?? null,
            messageEventId: entry.id ?? null,
            feedbackSentiment: entry.feedback_sentiment ?? null,
            feedbackReason: entry.feedback_reason ?? null,
            feedbackAt: entry.feedback_at ?? null,
            feedbackPayload: entry.feedback_payload ?? {},
          }));
        }
        const uiState = runtimeSession.ui_state as { active_content?: unknown; content_stack?: unknown } | null;
        if (uiState && (uiState.active_content !== undefined || uiState.content_stack !== undefined)) {
          mergedData.active_content = uiState.active_content;
          mergedData.content_stack = Array.isArray(uiState.content_stack) ? uiState.content_stack : [];
        }
        if (runtimeSession.title) {
          merged.title = runtimeSession.title;
        }
        const runtimePersona = runtimeSession.metadata?.persona_username;
        if (typeof runtimePersona === 'string' && runtimePersona) {
          mergedData.persona_username = runtimePersona;
          mergedData.agent_kind = 'kol_research';
        }
      }
      merged.data = mergedData;
      convCache.current.set(conversationId, merged);
      loadConversationData(conversationId, merged);
    } catch {
      failConversationLoad();
    } finally {
      loadingConversationRef.current = false;
    }
  }, [conversationApi, conversations, loadConversationData, syncUrlToLoadedConversation]);

  const handleRenameConversation = useCallback(async (conversationId: string, title: string) => {
    const nextTitle = title.trim().slice(0, 50);
    if (!nextTitle) return;

    const activeState = latestStateRef.current;
    const summary = conversations.find((conv) => conv.id === conversationId);
    let conversation: Record<string, unknown> | undefined = convCache.current.get(conversationId);

    if (conversationId === activeState.conversationId) {
      const activePersonaUsername = lockedPersonaUsername ?? activeState.personaUsername;
      const data = buildConversationData(
        activeState.messages,
        {
          accumulated_filters: activeState.accumulatedFilters,
          candidates: activeState.candidates,
          candidate_count: activeState.candidateCount,
          universe_size: activeState.universeSize,
          recommendations: activeState.recommendations,
        },
        activeState.funnelSteps,
        activeState.activeContent,
        activeState.contentStack,
        activePersonaUsername
          ? {
              kolChunks: activeState.kolChunks,
              personaUsername: activePersonaUsername,
            }
          : undefined,
      );
      conversation = {
        ...(conversation || {}),
        title: activeState.conversationTitle,
        data,
        message_count: activeState.messages.length,
      };
    }

    if (!conversation) {
      conversation = await conversationApi.get(conversationId);
    }

    const data = (
      conversation.data &&
      typeof conversation.data === 'object' &&
      !Array.isArray(conversation.data)
    )
      ? conversation.data as Record<string, unknown>
      : {};
    const messageCount = typeof conversation.message_count === 'number'
      ? conversation.message_count
      : Array.isArray(data.messages)
        ? data.messages.length
        : summary?.message_count ?? 0;
    const persona = lockedPersonaUsername || (typeof data.persona_username === 'string' && data.persona_username
      ? data.persona_username
      : null);

    setSaveStatus('saving');
    try {
      if (persona) {
        await kolConversationApi.update(conversationId, {
          title: nextTitle,
          data,
          message_count: messageCount,
          persona_username: persona,
          touch: false,
        });
      } else {
        await conversationApi.update(conversationId, {
          title: nextTitle,
          data,
          message_count: messageCount,
          touch: false,
        });
      }

      convCache.current.set(conversationId, {
        ...conversation,
        title: nextTitle,
        data,
        message_count: messageCount,
      });
      if (latestStateRef.current.conversationId === conversationId) {
        dispatch({ type: 'SET_CONVERSATION_TITLE', title: nextTitle });
      }
      upsertConversationSummary({
        id: conversationId,
        title: nextTitle,
        message_count: messageCount,
        updated_at: summary?.updated_at || new Date().toISOString(),
        is_pinned: summary?.is_pinned,
        pinned_at: summary?.pinned_at ?? null,
      }, { promote: false });
      updateConversationSummaryInLoadedCaches({
        id: conversationId,
        title: nextTitle,
        message_count: messageCount,
        updated_at: summary?.updated_at || new Date().toISOString(),
        is_pinned: summary?.is_pinned,
        pinned_at: summary?.pinned_at ?? null,
      });
      void queryClient.invalidateQueries({
        queryKey: ['research', 'conversations', conversationScope, conversationUserId],
        exact: false,
      });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (error) {
      setSaveStatus('idle');
      throw error;
    }
  }, [
    buildConversationData,
    conversationApi,
    conversationScope,
    conversationUserId,
    conversations,
    kolConversationApi,
    lockedPersonaUsername,
    queryClient,
    updateConversationSummaryInLoadedCaches,
    upsertConversationSummary,
  ]);

  const handleTogglePinConversation = useCallback(async (conversationId: string, nextPinned: boolean) => {
    const summary = conversations.find((conv) => conv.id === conversationId);
    if (!summary) return;

    const result = await conversationApi.pin(
      conversationId,
      nextPinned,
      summary.agent_id,
    );
    const pinnedAt = result.pinned_at ?? null;
    const updatedSummary: ConversationSummary = {
      ...summary,
      agent_id: result.agent_id === 'research_agent' || result.agent_id === 'kol_research_agent'
        ? result.agent_id
        : summary.agent_id,
      is_pinned: result.is_pinned,
      pinned_at: pinnedAt,
      updated_at: result.updated_at || summary.updated_at,
    };

    const cached = convCache.current.get(conversationId);
    if (cached) {
      convCache.current.set(conversationId, {
        ...cached,
        is_pinned: updatedSummary.is_pinned,
        pinned_at: updatedSummary.pinned_at,
      });
    }
    updateConversationSummaryInLoadedCaches(updatedSummary);
    void queryClient.invalidateQueries({
        queryKey: ['research', 'conversations', conversationScope, conversationUserId],
        exact: false,
      });
  }, [conversationApi, conversationScope, conversationUserId, conversations, queryClient, updateConversationSummaryInLoadedCaches]);

  // Delete a conversation
  const handleDeleteConversation = useCallback(async (conversationId: string) => {
    try {
      await conversationApi.delete(conversationId);
      convCache.current.delete(conversationId);
      removeConversationSummary(conversationId);
      // If the deleted conversation is currently active, reset to a clean state
      if (conversationId === state.conversationId) {
        dispatch({ type: 'RESET' });
        if (lockedPersonaUsername) {
          dispatch({ type: 'SET_PERSONA', personaUsername: lockedPersonaUsername });
        }
      }
    } catch {
      // Ignore delete failures
    }
  }, [conversationApi, lockedPersonaUsername, removeConversationSummary, state.conversationId]);

  const handleOpenConversationSearch = useCallback(() => {
    if (!userId) {
      redirectToLogin();
      return;
    }
    if (conversationListError || conversations.length === 0) {
      handleRetryConversations();
    }
    setConversationSearchOpen(true);
  }, [conversationListError, conversations.length, handleRetryConversations, redirectToLogin, userId]);

  const openHistorySidebar = useCallback(() => {
    if (userId && (conversationListError || conversations.length === 0)) {
      handleRetryConversations();
    }
    setHistoryOpen(true);
  }, [conversationListError, conversations.length, handleRetryConversations, userId]);

  const closeHistoryOnNarrowScreen = useCallback(() => {
    if (!isDesktopViewport()) {
      setHistoryOpen(false);
    }
  }, []);

  const handleSidebarLoadConversation = useCallback((conversationId: string) => {
    setMobileTab('chat');
    closeHistoryOnNarrowScreen();
    void handleLoadConversation(conversationId);
  }, [closeHistoryOnNarrowScreen, handleLoadConversation]);

  const handleSidebarNewChat = useCallback(() => {
    dispatch({ type: 'RESET' });
    if (lockedPersonaUsername) {
      dispatch({ type: 'SET_PERSONA', personaUsername: lockedPersonaUsername });
    }
    setMobileTab('chat');
    closeHistoryOnNarrowScreen();
  }, [closeHistoryOnNarrowScreen, lockedPersonaUsername]);

  const handleSidebarSearchOpen = useCallback(() => {
    closeHistoryOnNarrowScreen();
    handleOpenConversationSearch();
  }, [closeHistoryOnNarrowScreen, handleOpenConversationSearch]);

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
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        handleOpenConversationSearch();
        return;
      }
      if (e.key === 'Escape' && historyOpen && !isDesktopViewport()) {
        e.preventDefault();
        setHistoryOpen(false);
        return;
      }
      if (e.key === 'Escape' && state.isLoading) {
        e.preventDefault();
        handleCancelLoading();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [historyOpen, state.isLoading, handleCancelLoading, handleOpenConversationSearch]);

  const handleConversationSearchOpenChange = useCallback((open: boolean) => {
    setConversationSearchOpen(open);
    if (!open) setConversationSearch('');
  }, []);

  const normalizedConversationSearch = normalizeConversationSearch(conversationSearch);
  const searchLoading = normalizedConversationSearch.length > 0 && (
    debouncedConversationSearch !== normalizedConversationSearch ||
    (searchConversationsQuery.isLoading && searchConversations.length === 0)
  );

  const conversationSearchDialog = (
    <ConversationSearchDialog
      open={conversationSearchOpen}
      onOpenChange={handleConversationSearchOpenChange}
      query={conversationSearch}
      onQueryChange={setConversationSearch}
      recentConversations={conversations}
      recentLoading={!conversationsLoaded}
      recentError={conversationListError}
      searchResults={searchConversations}
      searchLoading={searchLoading}
      searchError={conversationSearchError}
      hasMoreRecent={hasMoreConversations}
      loadingMoreRecent={loadingMoreConversations}
      onLoadMoreRecent={handleLoadMoreConversations}
      onRetryRecent={handleRetryConversations}
      hasMoreSearch={hasMoreSearchConversations}
      loadingMoreSearch={loadingMoreSearchConversations}
      onLoadMoreSearch={handleLoadMoreSearchConversations}
      onRetrySearch={handleRetryConversationSearch}
      onLoad={handleSidebarLoadConversation}
      requestInFlight={state.isLoading}
    />
  );

  const mobileHistoryDrawer = (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="历史对话"
        aria-hidden={!historyOpen}
        className={`
          lg:hidden absolute inset-y-0 left-0 z-40 flex min-h-0 flex-col overflow-hidden border-r border-border/50 bg-background shadow-2xl
          transition-[width,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]
          ${historyOpen ? 'w-80 max-w-full opacity-100' : 'w-0 opacity-0 pointer-events-none'}
        `}
      >
        <ConversationSidebar
          conversations={conversations}
          loading={historyOpen && !conversationsLoaded}
          error={conversationListError}
          currentId={state.conversationId}
          onLoad={handleSidebarLoadConversation}
          onDelete={handleDeleteConversation}
          onRename={handleRenameConversation}
          onTogglePin={handleTogglePinConversation}
          onNewChat={handleSidebarNewChat}
          requestInFlight={state.isLoading}
          onToggle={() => setHistoryOpen(false)}
          userName={user?.name}
          userEmail={user?.email}
          userTier={userTier}
          hasMore={hasMoreConversations}
          loadingMore={loadingMoreConversations}
          onLoadMore={handleLoadMoreConversations}
          onSearchOpen={handleSidebarSearchOpen}
          onRetry={handleRetryConversations}
        />
      </div>
      <button
        type="button"
        onClick={() => setHistoryOpen(false)}
        className={`
          lg:hidden absolute inset-0 z-30 bg-black/25 transition-opacity duration-300 ease-out
          ${historyOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}
        `}
        aria-label="关闭历史对话"
        aria-hidden={!historyOpen}
        tabIndex={historyOpen ? 0 : -1}
      />
    </>
  );

  // Auth loading
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
      </div>
    );
  }

  if (!userId && (state.conversationId || state.messages.length > 0)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
      </div>
    );
  }

  // Welcome phase — same sidebar as chat phase
  if (state.phase === 'welcome') {
    return (
      <div className={shellFrameClass}>
        {mobileHistoryDrawer}
        {/* Shared sidebar */}
        <div
          className={`
            hidden shrink-0 border-r border-border/50 overflow-hidden flex-col lg:flex
            transition-[width,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]
            ${historyOpen ? 'w-72 opacity-100' : 'w-0 opacity-0 pointer-events-none'}
          `}
          aria-hidden={!historyOpen}
        >
          <ConversationSidebar
            conversations={conversations}
            loading={!conversationsLoaded}
            error={conversationListError}
            currentId={state.conversationId}
            onLoad={handleSidebarLoadConversation}
            onDelete={handleDeleteConversation}
            onRename={handleRenameConversation}
            onTogglePin={handleTogglePinConversation}
            onNewChat={handleSidebarNewChat}
            requestInFlight={false}
            onToggle={() => setHistoryOpen(false)}
            userName={user?.name}
            userEmail={user?.email}
            userTier={userTier}
            hasMore={hasMoreConversations}
            loadingMore={loadingMoreConversations}
            onLoadMore={handleLoadMoreConversations}
            onSearchOpen={handleSidebarSearchOpen}
            onRetry={handleRetryConversations}
          />
        </div>
        {conversationSearchDialog}

        {/* Welcome content — when sidebar is collapsed, show an obvious open button */}
        <div className="min-w-0 flex-1 flex flex-col">
          <div className="lg:hidden shrink-0 border-b border-border/50 bg-background/85 px-2 py-2 backdrop-blur-sm">
            <button
              type="button"
              onClick={openHistorySidebar}
              title="历史对话"
              aria-label="打开历史对话"
              className="inline-flex size-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            >
              <PanelLeft className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <div
            className={`
              shrink-0 px-3 py-2 hidden lg:flex items-center
              transition-opacity duration-200 ease-out
              ${historyOpen ? 'opacity-0 pointer-events-none h-0 py-0' : 'opacity-100'}
            `}
            aria-hidden={historyOpen}
          >
            <button
              onClick={openHistorySidebar}
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
          <div className="flex-1 overflow-hidden">
            <WelcomeScreen
              onSelect={handleSend}
              universeSize={state.universeSize || undefined}
              userName={user?.name}
              quota={effectiveQuota}
              personaSelectorEnabled={kolPersonaEnabled}
              agentKind={agentKind}
              personaUsername={personaUsername}
              onPersonaChange={handlePersonaChange}
              personaScope={personaScope}
              allowDefaultAssistant={allowDefaultAssistant}
            />
          </div>
        </div>
      </div>
    );
  }

  // Chat phase - split layout
  return (
    <div className={shellChatFrameClass}>
      {mobileHistoryDrawer}
      {conversationSearchDialog}
      {/* Mobile tab switch */}
      <div className="lg:hidden shrink-0">
        <MobileTabSwitch
          activeTab={mobileTab}
          onTabChange={handleTabChange}
          hasNewResults={state.hasNewResults}
          onHistoryOpen={openHistorySidebar}
        />
      </div>

      {/* Main content: split panels */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Left: History sidebar + Chat panel */}
        <div
          data-testid="research-chat-shell"
          className={`
            w-full lg:flex-1 lg:min-w-0 lg:border-r lg:border-border/20
            ${mobileTab === 'chat' ? 'flex' : 'hidden lg:flex'}
            min-h-0 overflow-hidden
          `}
        >
          {/* Collapsible history sidebar — overlay on mobile, inline on desktop */}
          <div
            className={`
              hidden shrink-0 border-r border-border/50 overflow-hidden min-h-0 flex-col lg:flex
              transition-[width,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]
              ${historyOpen
                ? 'w-72 opacity-100'
                : 'w-0 opacity-0 pointer-events-none'}
            `}
            aria-hidden={!historyOpen}
          >
            <ConversationSidebar
              conversations={conversations}
              loading={historyOpen && !conversationsLoaded}
              error={conversationListError}
              currentId={state.conversationId}
              onLoad={handleSidebarLoadConversation}
              onDelete={handleDeleteConversation}
              onRename={handleRenameConversation}
              onTogglePin={handleTogglePinConversation}
              onNewChat={handleSidebarNewChat}
              requestInFlight={state.isLoading}
              onToggle={() => setHistoryOpen(false)}
              userName={user?.name}
              userEmail={user?.email}
              userTier={userTier}
              hasMore={hasMoreConversations}
              loadingMore={loadingMoreConversations}
              onLoadMore={handleLoadMoreConversations}
              onSearchOpen={handleSidebarSearchOpen}
              onRetry={handleRetryConversations}
            />
          </div>
          {/* Chat panel */}
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden relative min-w-0">
            {/* Chat header: sidebar toggle + persona selector */}
            <div className="shrink-0 px-3 py-2 flex items-center gap-2">
              <button
                onClick={openHistorySidebar}
                title="历史对话"
                aria-label="展开历史对话"
                tabIndex={historyOpen ? -1 : 0}
                className={`
                  inline-flex items-center gap-1.5 px-2 py-1.5 rounded-md text-foreground/80
                  hover:text-foreground bg-muted/40 hover:bg-muted/70 border border-border/60
                  transition-[opacity,transform,background-color,color] duration-200 ease-out cursor-pointer
                  ${historyOpen ? 'opacity-0 -translate-x-1 pointer-events-none' : 'opacity-100 translate-x-0'}
                `}
                aria-hidden={historyOpen}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M9 3v18" />
                </svg>
                <span className="text-xs">历史</span>
              </button>
            </div>
            <ChatPanel
              messages={state.messages}
              onSend={handleSend}
              loading={state.isLoading}
              onCancelLoading={state.isLoading ? handleCancelLoading : undefined}
              toolActivities={state.toolActivities}
              quota={effectiveQuota}
              citations={agentKind === 'kol_research' ? latestKolChunks : undefined}
              conversationId={state.conversationId}
              personaUsername={
                kolPersonaEnabled && agentKind === 'kol_research' ? personaUsername : null
              }
              inputPlaceholder={
                agentKind === 'kol_research'
                  ? `按 ${getPersonaDisplayLabel(personaUsername || 'qinbafrank')} 方法论提问...`
                  : undefined
              }
              showPersonaUpsell={showPersonaUpsell}
            />
          </div>
        </div>

        {/* Right: Content panel (or KOL citation cards when in KOL mode) —
            ChatGPT-canvas-style: drag-resizable + collapsible on desktop. */}
        <CanvasPanel
          mobileActive={mobileTab === 'results'}
          contentKey={`${agentKind}:${getPanelContentSignature(state.activeContent, state.contentStack)}:${latestKolChunks?.length ?? 0}`}
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
              onTwitterDigestContextReady={handleTwitterDigestContextReady}
              onMacroPanelContextReady={handleMacroPanelContextReady}
              onBrewContextReady={handleBrewContextReady}
            />
          )}
        </CanvasPanel>
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
      <ResearchWorkspace />
    </Suspense>
  );
}
