'use client';

import { useReducer, useCallback, useEffect, useState, useRef, Suspense } from 'react';
import ReactDOM from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import PaywallGuard from '@/components/PaywallGuard';
import { api } from '@/lib/api';
import { getAuthErrorPresentation } from '@/lib/auth-error-presentation';
import { marketTodayStr } from '@/lib/timezone';
import type { ConversationSummary, ResearchRequest, ResearchResult } from '@/lib/api';
import {
  researchReducer,
  initialState,
  loadState,
  saveState,
  STORAGE_KEY,
} from './_lib/researchReducer';
import type { LoadConversationData } from './_lib/researchReducer';
import type { StockContextPayload } from './_components/StockResearchView';
import type { DailyReportContextPayload } from './_components/DailyReportView';
import type { MorningReportContextPayload } from './_components/MorningReportView';
import type { MacroContextPayload } from './_components/MacroOverview';
import type { BrewContextPayload } from './_components/BrewDigestView';
import WelcomeScreen from './_components/WelcomeScreen';
import ChatPanel from './_components/ChatPanel';
import ContentPanel from './_components/ContentPanel';
import ConversationSidebar from './_components/ConversationSidebar';
import MobileTabSwitch from './_components/MobileTabSwitch';
import DataStatus from './_components/DataStatus';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatConversationTitle(agentTitle: string): string {
  const now = new Date();
  const dateStr = `${now.getMonth() + 1}月${now.getDate()}日`;
  return agentTitle ? `${dateStr} · ${agentTitle}` : dateStr;
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
  const { isLoading: authLoading, isAuthenticated, signOut } = useAuth();
  const [state, dispatch] = useReducer(researchReducer, initialState, loadState);
  const [mobileTab, setMobileTab] = useState<'chat' | 'results'>('chat');
  const [historyOpen, setHistoryOpen] = useState(false);
  const prevPhaseRef = useRef(state.phase);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [conversationsLoaded, setConversationsLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const stockContextRef = useRef<StockContextPayload | null>(null);
  const reportContextRef = useRef<DailyReportContextPayload | null>(null);
  const morningContextRef = useRef<MorningReportContextPayload | null>(null);
  const macroContextRef = useRef<MacroContextPayload | null>(null);
  const brewContextRef = useRef<BrewContextPayload | null>(null);
  const pendingSeed = useRef<string | null>(null);
  const pendingSeedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSendRef = useRef<((message: string) => Promise<void>) | null>(null);
  const searchParams = useSearchParams();
  const contextInitialized = useRef(false);

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

  // Persist state to sessionStorage on change
  useEffect(() => {
    saveState(state);
  }, [state]);

  // Load conversation list when on welcome screen, or when history sidebar opens in chat phase
  useEffect(() => {
    if (!isAuthenticated) return;
    if (state.phase !== 'welcome' && !historyOpen) return;
    let cancelled = false;
    api.research.conversations.list()
      .then(res => {
        if (!cancelled) {
          setConversations(res.conversations || []);
          setConversationsLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) setConversationsLoaded(true);
      });
    return () => { cancelled = true; };
  }, [state.phase, isAuthenticated, historyOpen, state.conversationId]);

  // Auth redirect
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login?redirect=/research');
    }
  }, [authLoading, isAuthenticated, router]);

  // Reset scroll position when transitioning from welcome to chat
  useEffect(() => {
    if (prevPhaseRef.current === 'welcome' && state.phase === 'chat') {
      window.scrollTo(0, 0);
    }
    prevPhaseRef.current = state.phase;
  }, [state.phase]);

  // Safety: auto-recover from stuck isLoading after 95 seconds
  useEffect(() => {
    if (!state.isLoading) return;
    const timer = setTimeout(() => {
      dispatch({ type: 'SET_ERROR', error: 'AI 助手响应超时了，请再试一次' });
    }, 95_000);
    return () => clearTimeout(timer);
  }, [state.isLoading]);

  // Build conversation history for API
  const buildHistory = useCallback(() => {
    return state.messages.map(m => ({
      role: m.role,
      content: m.content,
    }));
  }, [state.messages]);

  // Build conversation data for saving
  const buildConversationData = useCallback((
    messages: typeof state.messages,
    result: { accumulated_filters: typeof state.accumulatedFilters; candidates: typeof state.candidates; candidate_count: number; universe_size: number; recommendations: typeof state.recommendations },
    funnelSteps: typeof state.funnelSteps,
    activeContent: typeof state.activeContent,
    contentStack: typeof state.contentStack,
  ) => ({
    messages,
    accumulated_filters: result.accumulated_filters,
    candidates: result.candidates,
    candidate_count: result.candidate_count,
    universe_size: result.universe_size,
    recommendations: result.recommendations,
    funnel_steps: funnelSteps,
    active_content: activeContent,
    content_stack: contentStack,
  }), []);

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
        }
      } else {
        await api.research.conversations.update(convId, {
          title,
          data,
          message_count: messageCount,
        });
      }
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('idle');
    }
  }, []);

  // Navigate right panel to a stock's research view
  const handleStockClick = useCallback((symbol: string) => {
    stockContextRef.current = null;
    dispatch({
      type: 'PUSH_CONTENT',
      content: {
        type: 'stock',
        label: `${symbol} 个股研究`,
        summary: symbol,
        params: { symbol },
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

  // Receive macro data from MacroOverview for Agent context
  const handleMacroContextReady = useCallback((payload: MacroContextPayload) => {
    macroContextRef.current = payload;
    flushPendingSeed();
  }, [flushPendingSeed]);

  // Receive brew digest data from BrewDigestView for Agent context
  const handleBrewContextReady = useCallback((payload: BrewContextPayload) => {
    brewContextRef.current = payload;
    flushPendingSeed();
  }, [flushPendingSeed]);

  // Send message handler
  const handleSend = useCallback(async (message: string) => {
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
          ai_analysis: ctx.ai_analysis ?? undefined,
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
      } else if (state.activeContent.type === 'macro' && macroContextRef.current) {
        const ctx = macroContextRef.current;
        activeContext = {
          type: ctx.type,
          week_label: ctx.week_label ?? undefined,
          verdict: ctx.verdict ?? undefined,
          signal_lights: ctx.signal_lights ?? undefined,
          landscape: ctx.landscape ?? undefined,
          narrative: ctx.narrative ?? undefined,
          takeaway: ctx.takeaway ?? undefined,
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

      await api.research.chatStream(
        {
          message,
          history: [...buildHistory(), { role: 'user', content: message }],
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
            dispatch({ type: 'SET_ERROR', error: event.message || 'AI 助手暂时无法响应' });
          }
        },
      );

      if (!streamResult) {
        dispatch({ type: 'SET_ERROR', error: 'AI 助手暂时无法响应' });
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
        handleStockClick(result.navigate.params.symbol);
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
        macroContextRef.current = null;
        dispatch({
          type: 'PUSH_CONTENT',
          content: {
            type: 'macro',
            label: '宏观风险仪表盘',
            summary: '',
            params: {},
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
      } else if (result.navigate?.type === 'screener') {
        // Navigate back to screener — clear stack, reset context refs
        stockContextRef.current = null;
        reportContextRef.current = null;
        morningContextRef.current = null;
        macroContextRef.current = null;
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
      const convData = buildConversationData(allMessages, result, saveFunnelSteps, state.activeContent, state.contentStack);
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
  }, [buildHistory, state.isLoading, state.accumulatedFilters, state.activeContent, state.contentStack, state.conversationId, state.conversationTitle, state.messages, state.funnelSteps, router, buildConversationData, saveConversation, handleStockClick, signOut]);

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
  const handleLoadConversation = useCallback(async (conversationId: string) => {
    // Cancel any pending auto-send from a prior context entry
    if (pendingSeedTimerRef.current) clearTimeout(pendingSeedTimerRef.current);
    pendingSeed.current = null;
    try {
      const conv = await api.research.conversations.get(conversationId);
      if (!conv) return;
      const data = (conv.data || {}) as Record<string, unknown>;
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
        },
      });
    } catch {
      // Failed to load, stay on welcome screen
    }
  }, []);

  // Delete a conversation
  const handleDeleteConversation = useCallback(async (conversationId: string) => {
    try {
      await api.research.conversations.delete(conversationId);
      setConversations(prev => prev.filter(c => c.id !== conversationId));
      // If the deleted conversation is currently active, reset to a clean state
      if (conversationId === state.conversationId) {
        dispatch({ type: 'RESET' });
      }
    } catch {
      // Ignore delete failures
    }
  }, [state.conversationId]);

  // Mobile tab change
  const handleTabChange = useCallback((tab: 'chat' | 'results') => {
    setMobileTab(tab);
    if (tab === 'results') {
      dispatch({ type: 'VIEW_RESULTS' });
    }
  }, []);

  // Auth loading
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  // Welcome phase
  if (state.phase === 'welcome') {
    return (
      <WelcomeScreen
        onSelect={handleSend}
        onEnterDailyReport={handleEnterDailyReport}
        onEnterMacro={handleEnterMacro}
        universeSize={state.universeSize || undefined}
        conversations={conversations}
        conversationsLoading={state.phase === 'welcome' && !conversationsLoaded}
        onLoadConversation={handleLoadConversation}
        onDeleteConversation={handleDeleteConversation}
      />
    );
  }

  // Chat phase - split layout
  return (
    <div className="fixed inset-x-0 top-16 bottom-0 flex flex-col bg-background z-10">
      {/* Header bar */}
      <div className="shrink-0 border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-3">
            {/* History sidebar toggle — desktop only (sidebar is hidden on mobile) */}
            <button
              onClick={() => setHistoryOpen(prev => !prev)}
              aria-label={historyOpen ? '收起历史对话' : '展开历史对话'}
              title={historyOpen ? '收起历史' : '历史对话'}
              className={`hidden lg:inline-flex items-center p-1.5 rounded-md transition-colors cursor-pointer ${
                historyOpen
                  ? 'text-primary bg-primary/10'
                  : 'text-muted-foreground/50 hover:text-foreground hover:bg-muted/30'
              }`}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M9 3v18" />
              </svg>
            </button>
            <div className="hidden lg:block h-3 w-px bg-border/50" />
            <button
              type="button"
              onClick={() => dispatch({ type: 'RESET' })}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
              重新开始
            </button>
            <div className="h-3 w-px bg-border/50" />
            <DataStatus inline />
            {saveStatus === 'saved' && (
              <span className="text-micro text-primary/80 animate-in fade-in duration-300">
                已保存
              </span>
            )}
          </div>
        </div>
      </div>

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
          {/* Collapsible history sidebar (desktop only) */}
          <div
            className={`
              hidden lg:flex shrink-0 border-r border-border/20 overflow-hidden
              transition-[width] duration-200 ease-out
              ${historyOpen ? 'w-52' : 'w-0'}
            `}
          >
            <ConversationSidebar
              conversations={conversations}
              loading={historyOpen && !conversationsLoaded}
              currentId={state.conversationId}
              onLoad={handleLoadConversation}
              onDelete={handleDeleteConversation}
              onNewChat={() => dispatch({ type: 'RESET' })}
              requestInFlight={state.isLoading}
            />
          </div>
          {/* Chat panel */}
          <div className="flex-1 flex flex-col relative min-w-0">
            <ChatPanel
              messages={state.messages}
              onSend={handleSend}
              loading={state.isLoading}
              onCancelLoading={state.isLoading ? handleCancelLoading : undefined}
              toolActivities={state.toolActivities}
            />
          </div>
        </div>

        {/* Right: Content panel */}
        <div
          className={`
            w-full lg:w-1/2
            ${mobileTab === 'results' ? 'flex' : 'hidden lg:flex'}
            flex-col
          `}
        >
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
            onMacroContextReady={handleMacroContextReady}
            onBrewContextReady={handleBrewContextReady}
          />
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
    <PaywallGuard requiredFeature="ai_research_engine">
      <Suspense>
        <ScreenerContent />
      </Suspense>
    </PaywallGuard>
  );
}
