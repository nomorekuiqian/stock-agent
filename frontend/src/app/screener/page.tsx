'use client';

import { useReducer, useCallback, useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import PaywallGuard from '@/components/PaywallGuard';
import { api } from '@/lib/api';
import {
  pickerReducer,
  initialState,
  loadState,
  saveState,
} from './_lib/pickerReducer';
import WelcomeScreen from './_components/WelcomeScreen';
import ChatPanel from './_components/ChatPanel';
import ResultsPanel from './_components/ResultsPanel';
import MobileTabSwitch from './_components/MobileTabSwitch';
import DataStatus from './_components/DataStatus';

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

function ScreenerContent() {
  const router = useRouter();
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const [state, dispatch] = useReducer(pickerReducer, initialState, loadState);
  const [mobileTab, setMobileTab] = useState<'chat' | 'results'>('chat');
  const prevPhaseRef = useRef(state.phase);

  // Persist state to sessionStorage on change
  useEffect(() => {
    saveState(state);
  }, [state]);

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

  // Build conversation history for API
  const buildHistory = useCallback(() => {
    return state.messages.map(m => ({
      role: m.role,
      content: m.content,
    }));
  }, [state.messages]);

  // Send message handler
  const handleSend = useCallback(async (message: string) => {
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'AI 助手暂时无法响应';
      if (msg.includes('登录已过期') || msg.includes('重新登录')) {
        router.push('/login?redirect=/screener');
        return;
      }
      dispatch({ type: 'SET_ERROR', error: msg });
    }
  }, [buildHistory, state.accumulatedFilters, router]);

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
          />
        </div>

        {/* Right: Results panel */}
        <div
          className={`
            w-full lg:w-1/2
            ${mobileTab === 'results' ? 'flex' : 'hidden lg:flex'}
            flex-col
          `}
        >
          <ResultsPanel
            steps={state.funnelSteps}
            appliedFilters={state.accumulatedFilters}
            candidates={state.candidates}
            candidateCount={state.candidateCount}
            universeSize={state.universeSize}
            pickReasons={state.pickReasons}
            loading={state.isLoading}
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
