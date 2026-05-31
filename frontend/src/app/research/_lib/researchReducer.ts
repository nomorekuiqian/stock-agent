/**
 * Research state management — reducer, persistence, and helpers.
 *
 * Extracted from page.tsx so the pure logic can be unit-tested
 * without rendering React components.
 */

import type { ResearchResult } from '@/lib/api';
import type { ContentContext } from './contentTypes';
import { SCREENER_CONTENT } from './contentTypes';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatMsg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  options?: string[];
  selectedOption?: string | null;
  isError?: boolean;
  /** Streaming placeholder still receiving deltas. Disables animation, shows live caret. */
  streaming?: boolean;
  /** Chain-of-thought chunks accumulated during streaming (KOL agent). */
  thinking?: string;
}

export interface FilterStep {
  count: number;
  label?: string;
}

export interface ResearchState {
  phase: 'welcome' | 'chat';
  messages: ChatMsg[];
  accumulatedFilters: { field: string; op: string; value: unknown }[];
  candidates: Record<string, unknown>[];
  candidateCount: number;
  universeSize: number;
  recommendations: { symbol: string; reason: string }[];
  funnelSteps: FilterStep[];
  isLoading: boolean;
  toolActivities: { tool: string; description: string; status: 'start' | 'end' }[];
  error: string | null;
  hasNewResults: boolean;
  conversationId: string | null;
  conversationTitle: string;
  // Research Desk: content panel state
  activeContent: ContentContext;
  contentStack: ContentContext[];
  // Context entry key — used to detect page refresh vs fresh navigation
  contextEntryKey: string | null;
  // KOL agent: citation chunks for the latest turn. Stored in reducer state
  // (vs. local useState) so they survive sessionStorage rehydration and
  // LOAD_CONVERSATION. Type kept as a loose record to avoid pulling api.ts
  // types into the reducer.
  kolChunks: Record<string, unknown>[];
  // KOL agent: which persona the active conversation belongs to. Lives in
  // reducer state (not local useState) so it persists across page reloads
  // via sessionStorage. Without this, a reload while on a KOL conversation
  // resets persona to null and the next message would route through the
  // research save path, wiping the conversation's kol_chunks on backend.
  personaUsername: string | null;
}

export type ResearchAction =
  | { type: 'SEND_MESSAGE'; message: string }
  | { type: 'RECEIVE_RESPONSE'; result: ResearchResult }
  | { type: 'SET_ERROR'; error: string }
  | { type: 'SET_LOADING'; loading: boolean }
  | { type: 'VIEW_RESULTS' }
  | { type: 'RESET' }
  | { type: 'SET_CONVERSATION_ID'; id: string }
  | { type: 'LOAD_CONVERSATION'; data: LoadConversationData }
  // Research Desk: content panel navigation
  | { type: 'PUSH_CONTENT'; content: ContentContext }
  | { type: 'POP_CONTENT' }
  | { type: 'SWITCH_CONTENT'; content: ContentContext }
  // Context entry from external pages (skips welcome, starts in chat+loading)
  | { type: 'CONTEXT_ENTRY'; content: ContentContext; key: string }
  // SSE streaming: tool call activity
  | { type: 'TOOL_ACTIVITY'; tool: string; description: string; status: 'start' | 'end' }
  // SSE streaming: token-level delta to the in-progress assistant message
  // (created by SEND_MESSAGE setting isLoading=true; we append/upsert the
  // assistant placeholder on first delta).
  | { type: 'STREAM_DELTA'; kind: 'message' | 'thinking'; text: string }
  // KOL agent: replace the latest-turn citation chunks (right-panel data).
  | { type: 'SET_KOL_CHUNKS'; chunks: Record<string, unknown>[] }
  // KOL agent: set or clear the active persona. null clears KOL mode.
  | { type: 'SET_PERSONA'; personaUsername: string | null };

export interface LoadConversationData {
  conversationId: string;
  title: string;
  messages: ChatMsg[];
  accumulatedFilters: { field: string; op: string; value: unknown }[];
  candidates: Record<string, unknown>[];
  candidateCount: number;
  universeSize: number;
  recommendations: { symbol: string; reason: string }[];
  funnelSteps: FilterStep[];
  // Research Desk: optional content state from saved conversations
  activeContent?: ContentContext;
  contentStack?: ContentContext[];
  // KOL agent: optional citation chunks from saved conversation
  kolChunks?: Record<string, unknown>[];
  // KOL agent: persona username (drives agentKind derivation in callers)
  personaUsername?: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const STORAGE_KEY = 'screener_research_state';

export const initialState: ResearchState = {
  phase: 'welcome',
  messages: [],
  accumulatedFilters: [],
  candidates: [],
  candidateCount: 0,
  universeSize: 0,
  recommendations: [],
  funnelSteps: [],
  isLoading: false,
  toolActivities: [],
  error: null,
  hasNewResults: false,
  conversationId: null,
  conversationTitle: '',
  personaUsername: null,
  activeContent: SCREENER_CONTENT,
  contentStack: [],
  kolChunks: [],
  contextEntryKey: null,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function nextMsgId(): string {
  return `msg-${Math.random().toString(36).slice(2, 9)}-${Date.now()}`;
}

/** Keys to exclude from sessionStorage. */
const TRANSIENT_KEYS = new Set<string>();

export function saveState(state: ResearchState): void {
  try {
    const filtered: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(state)) {
      if (!TRANSIENT_KEYS.has(k)) filtered[k] = v;
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch {
    // sessionStorage full or unavailable - silently ignore
  }
}

export function loadState(): ResearchState {
  if (typeof window === 'undefined') return initialState;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState;
    const saved = JSON.parse(raw) as Partial<ResearchState>;
    // Migrate old {label,value} options to plain strings
    if (saved.messages) {
      saved.messages = saved.messages.map((m) => ({
        ...m,
        options: m.options?.map((o: unknown) =>
          typeof o === 'string' ? o : (o as { label?: string }).label ?? '',
        ),
      }));
    }
    return {
      ...initialState,
      ...saved,
      isLoading: false,
      error: null,
      // Ensure content fields have valid defaults (old sessions won't have them)
      activeContent: saved.activeContent ?? SCREENER_CONTENT,
      contentStack: saved.contentStack ?? [],
    };
  } catch {
    return initialState;
  }
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export function researchReducer(state: ResearchState, action: ResearchAction): ResearchState {
  switch (action.type) {
    case 'SEND_MESSAGE': {
      const userMsg: ChatMsg = {
        id: nextMsgId(),
        role: 'user',
        content: action.message,
      };

      // Mark the previous assistant message's option as selected (if user clicked a chip)
      const updatedMessages = state.messages.map((msg, i) => {
        if (
          msg.role === 'assistant' &&
          msg.options?.some(o => o === action.message) &&
          !msg.selectedOption &&
          i === state.messages.length - 1
        ) {
          return { ...msg, selectedOption: action.message };
        }
        return msg;
      });

      return {
        ...state,
        phase: 'chat',
        messages: [...updatedMessages, userMsg],
        isLoading: true,
        error: null,
      };
    }

    case 'RECEIVE_RESPONSE': {
      const { result } = action;

      // If the last message is a streaming placeholder built up by STREAM_DELTA,
      // finalize it in-place (don't append a duplicate). Otherwise append fresh.
      const lastIdx = state.messages.length - 1;
      const last = state.messages[lastIdx];
      const upgradeStreaming = last && last.role === 'assistant' && last.streaming;

      const assistantMsg: ChatMsg = upgradeStreaming
        ? {
            ...last,
            content: result.message || last.content,
            options: result.options.length > 0 ? result.options : last.options,
            streaming: false,
          }
        : {
            id: nextMsgId(),
            role: 'assistant',
            content: result.message,
            options: result.options.length > 0 ? result.options : undefined,
          };
      const baseMessages = upgradeStreaming
        ? [...state.messages.slice(0, lastIdx), assistantMsg]
        : [...state.messages, assistantMsg];

      // Build funnel steps
      let newFunnelSteps = [...state.funnelSteps];
      if (result.candidate_count > 0) {
        if (newFunnelSteps.length === 0 && result.universe_size > 0) {
          newFunnelSteps = [
            { count: result.universe_size, label: '全市场' },
            { count: result.candidate_count },
          ];
        } else if (
          newFunnelSteps.length > 0 &&
          result.candidate_count !== newFunnelSteps[newFunnelSteps.length - 1]?.count
        ) {
          newFunnelSteps = [...newFunnelSteps, { count: result.candidate_count }];
        }
      }

      // Handle reset signal: agent cleared all filters (e.g. "change direction")
      if (result.reset_results) {
        return {
          ...state,
          messages: baseMessages,
          accumulatedFilters: [],
          candidates: [],
          candidateCount: 0,
          recommendations: [],
          funnelSteps: [],
          isLoading: false,
          toolActivities: [],
          hasNewResults: false,
        };
      }

      // Determine recommendations for this turn:
      // - New recommendations from backend -> use them (replace)
      // - New candidates but no recommendations -> clear old recommendations (back to list)
      // - Neither -> keep current state (pure chat turn)
      const hasNewCandidates = result.candidates.length > 0;
      const hasNewReasons = result.recommendations.length > 0;
      let nextRecommendations = state.recommendations;
      if (hasNewReasons) {
        nextRecommendations = result.recommendations;
      } else if (hasNewCandidates) {
        nextRecommendations = [];
      }

      return {
        ...state,
        messages: baseMessages,
        accumulatedFilters: result.accumulated_filters || state.accumulatedFilters,
        candidates: hasNewCandidates ? result.candidates : state.candidates,
        candidateCount: result.candidate_count > 0 ? result.candidate_count : state.candidateCount,
        universeSize: result.universe_size > 0 ? result.universe_size : state.universeSize,
        recommendations: nextRecommendations,
        funnelSteps: newFunnelSteps,
        isLoading: false,
        toolActivities: [],
        hasNewResults: hasNewCandidates,
        conversationTitle: result.title || state.conversationTitle,
      };
    }

    case 'STREAM_DELTA': {
      // Append text to the streaming assistant message. If the last message
      // isn't a streaming placeholder, create one. Used by the KOL agent
      // (token-by-token SSE) and any future stream-aware agent.
      const messages = [...state.messages];
      const last = messages[messages.length - 1];
      if (!last || last.role !== 'assistant' || !last.streaming) {
        messages.push({
          id: nextMsgId(),
          role: 'assistant',
          content: action.kind === 'message' ? action.text : '',
          thinking: action.kind === 'thinking' ? action.text : undefined,
          streaming: true,
        });
      } else if (action.kind === 'thinking') {
        messages[messages.length - 1] = {
          ...last,
          thinking: (last.thinking || '') + action.text,
        };
      } else {
        messages[messages.length - 1] = {
          ...last,
          content: last.content + action.text,
        };
      }
      return { ...state, messages };
    }

    case 'SET_ERROR': {
      const errorMsg: ChatMsg = {
        id: nextMsgId(),
        role: 'assistant',
        content: action.error,
        isError: true,
      };
      return {
        ...state,
        messages: [...state.messages, errorMsg],
        isLoading: false,
        error: null,
      };
    }

    case 'SET_LOADING':
      return { ...state, isLoading: action.loading, toolActivities: action.loading ? [] : state.toolActivities };

    case 'TOOL_ACTIVITY': {
      // Skip internal ADK tools that shouldn't be shown to users
      if (['set_model_response', 'google_search_agent'].includes(action.tool)) return state;

      if (action.status === 'start') {
        const alreadyTracked = state.toolActivities.some(a => a.tool === action.tool);
        if (alreadyTracked) return state;
        return {
          ...state,
          toolActivities: [...state.toolActivities, { tool: action.tool, description: action.description, status: 'start' }],
        };
      }
      // Mark as ended but keep in list (so description stays visible even if
      // start+end arrive in the same render batch). RECEIVE_RESPONSE clears all.
      return {
        ...state,
        toolActivities: state.toolActivities.map(a =>
          a.tool === action.tool ? { ...a, status: 'end' as const } : a
        ),
      };
    }

    case 'VIEW_RESULTS':
      return { ...state, hasNewResults: false };

    case 'SET_CONVERSATION_ID':
      return { ...state, conversationId: action.id };

    case 'LOAD_CONVERSATION':
      return {
        ...initialState,
        phase: 'chat',
        conversationId: action.data.conversationId,
        conversationTitle: action.data.title,
        messages: action.data.messages.map(m => ({
          ...m,
          id: m.id || nextMsgId(),
        })),
        accumulatedFilters: action.data.accumulatedFilters,
        candidates: action.data.candidates,
        candidateCount: action.data.candidateCount,
        universeSize: action.data.universeSize,
        recommendations: action.data.recommendations,
        funnelSteps: action.data.funnelSteps,
        // Restore content state if saved, otherwise default to screener
        activeContent: action.data.activeContent ?? SCREENER_CONTENT,
        contentStack: action.data.contentStack ?? [],
        // KOL agent: restore citation chunks from saved conversation
        kolChunks: action.data.kolChunks ?? [],
        // KOL agent: restore persona so a reload-then-send doesn't accidentally
        // route a KOL conversation through the research save path.
        personaUsername: action.data.personaUsername ?? null,
      };

    case 'SET_KOL_CHUNKS':
      return { ...state, kolChunks: action.chunks };

    case 'SET_PERSONA':
      return { ...state, personaUsername: action.personaUsername };

    // Research Desk: content panel navigation
    case 'PUSH_CONTENT':
      return {
        ...state,
        contentStack: [...state.contentStack, state.activeContent],
        activeContent: action.content,
      };

    case 'POP_CONTENT': {
      if (state.contentStack.length === 0) return state;
      const stack = [...state.contentStack];
      const previous = stack.pop()!;
      return {
        ...state,
        contentStack: stack,
        activeContent: previous,
      };
    }

    case 'SWITCH_CONTENT':
      return {
        ...state,
        activeContent: action.content,
      };

    case 'CONTEXT_ENTRY':
      try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
      return {
        ...initialState,
        phase: 'chat',
        isLoading: true,
        activeContent: action.content,
        contentStack: [],
        contextEntryKey: action.key,
      };

    case 'RESET':
      try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
      return { ...initialState };

    default:
      return state;
  }
}
