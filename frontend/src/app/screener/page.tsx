'use client';

import { useReducer, useCallback, useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import PaywallGuard from '@/components/PaywallGuard';
import { api } from '@/lib/api';
import type { ConversationSummary } from '@/lib/api';
import {
  pickerReducer,
  initialState,
  loadState,
  saveState,
} from './_lib/pickerReducer';
import type { LoadConversationData } from './_lib/pickerReducer';
import WelcomeScreen from './_components/WelcomeScreen';
import ChatPanel from './_components/ChatPanel';
import ContentPanel from './_components/ContentPanel';
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

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

function ScreenerContent() {
  const router = useRouter();
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const [state, dispatch] = useReducer(pickerReducer, initialState, loadState);
  const [mobileTab, setMobileTab] = useState<'chat' | 'results'>('chat');
  const prevPhaseRef = useRef(state.phase);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [conversationsLoaded, setConversationsLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  // Persist state to sessionStorage on change
  useEffect(() => {
    saveState(state);
  }, [state]);

  // Load conversation list when on welcome screen
  useEffect(() => {
    if (state.phase !== 'welcome' || !isAuthenticated) return;
    let cancelled = false;
    api.screener.conversations.list()
      .then(res => {
        if (!cancelled) {
          setConversations(res.conversations || []);
          setConversationsLoaded(true);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [state.phase, isAuthenticated]);

  // Auth redirect
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login?redirect=/screener');
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
    result: { accumulated_filters: typeof state.accumulatedFilters; candidates: typeof state.candidates; candidate_count: number; universe_size: number; pick_reasons: typeof state.pickReasons },
    funnelSteps: typeof state.funnelSteps,
  ) => ({
    messages,
    accumulated_filters: result.accumulated_filters,
    candidates: result.candidates,
    candidate_count: result.candidate_count,
    universe_size: result.universe_size,
    pick_reasons: result.pick_reasons,
    funnel_steps: funnelSteps,
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
        const created = await api.screener.conversations.create({
          title,
          data,
          message_count: messageCount,
        });
        if (created?.id) {
          dispatch({ type: 'SET_CONVERSATION_ID', id: created.id });
        }
      } else {
        await api.screener.conversations.update(convId, {
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

  // Send message handler
  const handleSend = useCallback(async (message: string) => {
    if (process.env.NODE_ENV === 'development') {
      console.debug('[Screener] handleSend called, isLoading was:', state.isLoading);
    }
    dispatch({ type: 'SEND_MESSAGE', message });

    try {
      const result = await api.screener.pick({
        message,
        history: [...buildHistory(), { role: 'user', content: message }],
        accumulated_filters: state.accumulatedFilters.length > 0
          ? state.accumulatedFilters
          : undefined,
      });

      if (!result.success) {
        dispatch({ type: 'SET_ERROR', error: result.message || 'AI 助手暂时无法响应' });
        return;
      }

      dispatch({ type: 'RECEIVE_RESPONSE', result });

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
      const convData = buildConversationData(allMessages, result, saveFunnelSteps);
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
      const msg = err instanceof Error ? err.message : 'AI 助手暂时无法响应';
      if (msg.includes('登录已过期') || msg.includes('重新登录')) {
        dispatch({ type: 'SET_ERROR', error: '登录已过期，请刷新页面重新登录' });
        router.push('/login?redirect=/screener');
        return;
      }
      dispatch({ type: 'SET_ERROR', error: msg });
    }
  }, [buildHistory, state.isLoading, state.accumulatedFilters, state.conversationId, state.conversationTitle, state.messages, state.funnelSteps, router, buildConversationData, saveConversation]);

  // Cancel stuck loading — lets user recover without refreshing
  const handleCancelLoading = useCallback(() => {
    if (!state.isLoading) return;
    dispatch({ type: 'SET_ERROR', error: '已取消。你可以重新发送或换个问题试试' });
  }, [state.isLoading]);

  // Load a saved conversation
  const handleLoadConversation = useCallback(async (conversationId: string) => {
    try {
      const conv = await api.screener.conversations.get(conversationId);
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
          pickReasons: (data.pick_reasons || []) as LoadConversationData['pickReasons'],
          funnelSteps: (data.funnel_steps || []) as LoadConversationData['funnelSteps'],
        },
      });
    } catch {
      // Failed to load, stay on welcome screen
    }
  }, []);

  // Delete a conversation
  const handleDeleteConversation = useCallback(async (conversationId: string) => {
    try {
      await api.screener.conversations.delete(conversationId);
      setConversations(prev => prev.filter(c => c.id !== conversationId));
    } catch {
      // Ignore delete failures
    }
  }, []);

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
        <div className="w-10 h-10 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  // Welcome phase
  if (state.phase === 'welcome') {
    return (
      <WelcomeScreen
        onSelect={handleSend}
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
            <button
              onClick={() => dispatch({ type: 'RESET' })}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
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
              <span className="text-[10px] text-emerald-500/80 animate-in fade-in duration-300">
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
        {/* Left: Chat panel */}
        <div
          className={`
            w-full lg:w-1/2 lg:border-r lg:border-border/20
            ${mobileTab === 'chat' ? 'flex' : 'hidden lg:flex'}
            flex-col relative
          `}
        >
          <ChatPanel
            messages={state.messages}
            onSend={handleSend}
            loading={state.isLoading}
            onCancelLoading={state.isLoading ? handleCancelLoading : undefined}
          />
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
              pickReasons: state.pickReasons,
              loading: state.isLoading,
            }}
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
    <PaywallGuard>
      <ScreenerContent />
    </PaywallGuard>
  );
}
