import { describe, it, expect, beforeEach } from 'vitest';
import type { PickResult } from '@/lib/api';
import {
  pickerReducer,
  initialState,
  loadState,
  saveState,
  nextMsgId,
  STORAGE_KEY,
  type PickerState,
} from '../pickerReducer';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal PickResult for testing. */
function makeResult(overrides: Partial<PickResult> = {}): PickResult {
  return {
    success: true,
    message: 'test reply',
    options: [],
    candidates: [],
    candidate_count: 0,
    universe_size: 0,
    pick_reasons: [],
    accumulated_filters: [],
    reset_results: false,
    title: '',
    data_freshness: null,
    is_stale: false,
    ...overrides,
  };
}

/** Build a state that's already in the "chat" phase with one user message. */
function chatState(overrides: Partial<PickerState> = {}): PickerState {
  return {
    ...initialState,
    phase: 'chat',
    messages: [{ id: 'u1', role: 'user', content: 'hello' }],
    isLoading: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// nextMsgId
// ---------------------------------------------------------------------------

describe('nextMsgId', () => {
  it('returns a string starting with msg-', () => {
    expect(nextMsgId()).toMatch(/^msg-/);
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 50 }, () => nextMsgId()));
    expect(ids.size).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// SEND_MESSAGE
// ---------------------------------------------------------------------------

describe('SEND_MESSAGE', () => {
  it('transitions phase from welcome to chat', () => {
    const state = pickerReducer(initialState, {
      type: 'SEND_MESSAGE',
      message: 'hi',
    });
    expect(state.phase).toBe('chat');
  });

  it('appends a user message', () => {
    const state = pickerReducer(initialState, {
      type: 'SEND_MESSAGE',
      message: 'find me stocks',
    });
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].role).toBe('user');
    expect(state.messages[0].content).toBe('find me stocks');
  });

  it('sets isLoading true and clears error', () => {
    const prev = { ...initialState, error: 'old error' };
    const state = pickerReducer(prev, {
      type: 'SEND_MESSAGE',
      message: 'x',
    });
    expect(state.isLoading).toBe(true);
    expect(state.error).toBeNull();
  });

  it('marks last assistant option as selected when user clicks a chip', () => {
    const prev: PickerState = {
      ...initialState,
      phase: 'chat',
      messages: [
        {
          id: 'a1',
          role: 'assistant',
          content: 'Choose one',
          options: ['Growth', 'Value'],
        },
      ],
    };
    const state = pickerReducer(prev, {
      type: 'SEND_MESSAGE',
      message: 'Growth',
    });
    // First message (assistant) should have selectedOption set
    expect(state.messages[0].selectedOption).toBe('Growth');
    // Second message is the user message
    expect(state.messages[1].role).toBe('user');
  });

  it('does not mark already-selected option', () => {
    const prev: PickerState = {
      ...initialState,
      phase: 'chat',
      messages: [
        {
          id: 'a1',
          role: 'assistant',
          content: 'Choose',
          options: ['A'],
          selectedOption: 'A',
        },
      ],
    };
    const state = pickerReducer(prev, {
      type: 'SEND_MESSAGE',
      message: 'A',
    });
    // Should remain 'A', not re-set
    expect(state.messages[0].selectedOption).toBe('A');
  });
});

// ---------------------------------------------------------------------------
// RECEIVE_RESPONSE
// ---------------------------------------------------------------------------

describe('RECEIVE_RESPONSE', () => {
  it('appends an assistant message and clears loading', () => {
    const prev = chatState();
    const result = makeResult({ message: 'Here are some options' });
    const state = pickerReducer(prev, { type: 'RECEIVE_RESPONSE', result });

    expect(state.isLoading).toBe(false);
    expect(state.messages).toHaveLength(2);
    expect(state.messages[1].role).toBe('assistant');
    expect(state.messages[1].content).toBe('Here are some options');
  });

  it('stores options on assistant message when present', () => {
    const prev = chatState();
    const result = makeResult({
      options: ['A'],
    });
    const state = pickerReducer(prev, { type: 'RECEIVE_RESPONSE', result });
    expect(state.messages[1].options).toEqual(['A']);
  });

  it('does not store options when empty array', () => {
    const prev = chatState();
    const result = makeResult({ options: [] });
    const state = pickerReducer(prev, { type: 'RECEIVE_RESPONSE', result });
    expect(state.messages[1].options).toBeUndefined();
  });

  // --- Candidates ---

  it('replaces candidates when new ones arrive', () => {
    const prev = chatState({ candidates: [{ symbol: 'OLD' }] });
    const result = makeResult({
      candidates: [{ symbol: 'AAPL' }, { symbol: 'MSFT' }],
      candidate_count: 2,
      universe_size: 3600,
    });
    const state = pickerReducer(prev, { type: 'RECEIVE_RESPONSE', result });
    expect(state.candidates).toHaveLength(2);
    expect(state.candidates[0]).toEqual({ symbol: 'AAPL' });
    expect(state.hasNewResults).toBe(true);
  });

  it('keeps old candidates when result has none', () => {
    const prev = chatState({ candidates: [{ symbol: 'OLD' }] });
    const result = makeResult({ candidates: [] });
    const state = pickerReducer(prev, { type: 'RECEIVE_RESPONSE', result });
    expect(state.candidates).toEqual([{ symbol: 'OLD' }]);
    expect(state.hasNewResults).toBe(false);
  });

  // --- Accumulated filters ---

  it('updates accumulated filters from result', () => {
    const prev = chatState();
    const result = makeResult({
      accumulated_filters: [{ field: 'roe', op: 'gt', value: 15 }],
    });
    const state = pickerReducer(prev, { type: 'RECEIVE_RESPONSE', result });
    expect(state.accumulatedFilters).toEqual([{ field: 'roe', op: 'gt', value: 15 }]);
  });

  it('replaces old filters when result has empty accumulated_filters', () => {
    const prev = chatState({
      accumulatedFilters: [{ field: 'pe_ttm', op: 'lt', value: 20 }],
    });
    const result = makeResult({ accumulated_filters: [] });
    const state = pickerReducer(prev, { type: 'RECEIVE_RESPONSE', result });
    // Empty array is truthy in JS, so [] replaces old filters via ||
    expect(state.accumulatedFilters).toEqual([]);
  });

  // --- Funnel steps ---

  it('creates initial funnel steps on first candidates', () => {
    const prev = chatState();
    const result = makeResult({
      candidates: [{ symbol: 'A' }],
      candidate_count: 100,
      universe_size: 3600,
    });
    const state = pickerReducer(prev, { type: 'RECEIVE_RESPONSE', result });
    expect(state.funnelSteps).toEqual([
      { count: 3600, label: '全市场' },
      { count: 100 },
    ]);
  });

  it('appends funnel step when candidate count changes', () => {
    const prev = chatState({
      funnelSteps: [
        { count: 3600, label: '全市场' },
        { count: 100 },
      ],
    });
    const result = makeResult({
      candidates: [{ symbol: 'A' }],
      candidate_count: 30,
      universe_size: 3600,
    });
    const state = pickerReducer(prev, { type: 'RECEIVE_RESPONSE', result });
    expect(state.funnelSteps).toHaveLength(3);
    expect(state.funnelSteps[2]).toEqual({ count: 30 });
  });

  it('does not duplicate funnel step when count unchanged', () => {
    const prev = chatState({
      funnelSteps: [
        { count: 3600, label: '全市场' },
        { count: 100 },
      ],
    });
    const result = makeResult({
      candidates: [{ symbol: 'A' }],
      candidate_count: 100,
      universe_size: 3600,
    });
    const state = pickerReducer(prev, { type: 'RECEIVE_RESPONSE', result });
    expect(state.funnelSteps).toHaveLength(2);
  });

  it('does not add funnel steps when candidate_count is 0', () => {
    const prev = chatState();
    const result = makeResult({ candidate_count: 0 });
    const state = pickerReducer(prev, { type: 'RECEIVE_RESPONSE', result });
    expect(state.funnelSteps).toEqual([]);
  });

  // --- pickReasons state machine ---

  it('replaces pickReasons when new reasons arrive', () => {
    const prev = chatState({
      pickReasons: [{ symbol: 'OLD', reason: 'old' }],
    });
    const result = makeResult({
      candidates: [{ symbol: 'AAPL' }],
      candidate_count: 1,
      pick_reasons: [{ symbol: 'AAPL', reason: 'great' }],
    });
    const state = pickerReducer(prev, { type: 'RECEIVE_RESPONSE', result });
    expect(state.pickReasons).toEqual([{ symbol: 'AAPL', reason: 'great' }]);
  });

  it('clears pickReasons when new candidates but no reasons', () => {
    const prev = chatState({
      pickReasons: [{ symbol: 'OLD', reason: 'old' }],
    });
    const result = makeResult({
      candidates: [{ symbol: 'NEW' }],
      candidate_count: 1,
      pick_reasons: [],
    });
    const state = pickerReducer(prev, { type: 'RECEIVE_RESPONSE', result });
    expect(state.pickReasons).toEqual([]);
  });

  it('keeps pickReasons on pure chat turn (no candidates, no reasons)', () => {
    const existing = [{ symbol: 'KEEP', reason: 'keep me' }];
    const prev = chatState({ pickReasons: existing });
    const result = makeResult({
      candidates: [],
      candidate_count: 0,
      pick_reasons: [],
    });
    const state = pickerReducer(prev, { type: 'RECEIVE_RESPONSE', result });
    expect(state.pickReasons).toBe(existing);
  });

  // --- Universe/candidate counts ---

  it('updates universe and candidate counts from positive values', () => {
    const prev = chatState();
    const result = makeResult({
      candidates: [{ symbol: 'A' }],
      candidate_count: 50,
      universe_size: 3600,
    });
    const state = pickerReducer(prev, { type: 'RECEIVE_RESPONSE', result });
    expect(state.candidateCount).toBe(50);
    expect(state.universeSize).toBe(3600);
  });

  it('preserves old counts when result has zero values', () => {
    const prev = chatState({ candidateCount: 100, universeSize: 3600 });
    const result = makeResult({ candidate_count: 0, universe_size: 0 });
    const state = pickerReducer(prev, { type: 'RECEIVE_RESPONSE', result });
    expect(state.candidateCount).toBe(100);
    expect(state.universeSize).toBe(3600);
  });
});

// ---------------------------------------------------------------------------
// SET_ERROR
// ---------------------------------------------------------------------------

describe('SET_ERROR', () => {
  it('appends an error assistant message', () => {
    const prev = chatState();
    const state = pickerReducer(prev, {
      type: 'SET_ERROR',
      error: 'Network error',
    });
    expect(state.messages).toHaveLength(2);
    const errMsg = state.messages[1];
    expect(errMsg.role).toBe('assistant');
    expect(errMsg.content).toBe('Network error');
    expect(errMsg.isError).toBe(true);
  });

  it('clears loading and sets error to null', () => {
    const prev = chatState({ isLoading: true });
    const state = pickerReducer(prev, {
      type: 'SET_ERROR',
      error: 'fail',
    });
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// SET_LOADING
// ---------------------------------------------------------------------------

describe('SET_LOADING', () => {
  it('sets isLoading to true', () => {
    const state = pickerReducer(initialState, {
      type: 'SET_LOADING',
      loading: true,
    });
    expect(state.isLoading).toBe(true);
  });

  it('sets isLoading to false', () => {
    const prev = { ...initialState, isLoading: true };
    const state = pickerReducer(prev, {
      type: 'SET_LOADING',
      loading: false,
    });
    expect(state.isLoading).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// RECEIVE_RESPONSE with reset_results
// ---------------------------------------------------------------------------

describe('RECEIVE_RESPONSE with reset_results', () => {
  it('clears all results when reset_results is true', () => {
    const prev = chatState({
      candidates: [{ symbol: 'OLD' }],
      candidateCount: 50,
      universeSize: 3600,
      pickReasons: [{ symbol: 'OLD', reason: 'keep' }],
      funnelSteps: [{ count: 3600, label: '\u5168\u5e02\u573a' }, { count: 50 }],
      accumulatedFilters: [{ field: 'roe', op: 'gt', value: 15 }],
    });
    const result = makeResult({
      message: 'OK, let us start over',
      reset_results: true,
    });
    const state = pickerReducer(prev, { type: 'RECEIVE_RESPONSE', result });

    expect(state.candidates).toEqual([]);
    expect(state.candidateCount).toBe(0);
    expect(state.pickReasons).toEqual([]);
    expect(state.funnelSteps).toEqual([]);
    expect(state.accumulatedFilters).toEqual([]);
    expect(state.hasNewResults).toBe(false);
    expect(state.isLoading).toBe(false);
  });

  it('still appends assistant message on reset', () => {
    const prev = chatState({
      candidates: [{ symbol: 'OLD' }],
    });
    const result = makeResult({
      message: 'Starting fresh',
      reset_results: true,
    });
    const state = pickerReducer(prev, { type: 'RECEIVE_RESPONSE', result });
    // Original user message + new assistant message
    expect(state.messages).toHaveLength(2);
    expect(state.messages[1].role).toBe('assistant');
    expect(state.messages[1].content).toBe('Starting fresh');
  });

  it('does not reset when reset_results is false', () => {
    const prev = chatState({
      candidates: [{ symbol: 'KEEP' }],
      candidateCount: 10,
    });
    const result = makeResult({
      message: 'narrowing down',
      reset_results: false,
      candidates: [{ symbol: 'NEW' }],
      candidate_count: 5,
      universe_size: 3600,
    });
    const state = pickerReducer(prev, { type: 'RECEIVE_RESPONSE', result });
    // Should update normally, not clear
    expect(state.candidates).toEqual([{ symbol: 'NEW' }]);
    expect(state.candidateCount).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// VIEW_RESULTS
// ---------------------------------------------------------------------------

describe('VIEW_RESULTS', () => {
  it('clears hasNewResults flag', () => {
    const prev = { ...initialState, hasNewResults: true };
    const state = pickerReducer(prev, { type: 'VIEW_RESULTS' });
    expect(state.hasNewResults).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// RESET
// ---------------------------------------------------------------------------

describe('RESET', () => {
  it('returns to initial state', () => {
    const prev = chatState({
      candidates: [{ symbol: 'A' }],
      candidateCount: 10,
      universeSize: 3600,
      pickReasons: [{ symbol: 'A', reason: 'x' }],
      funnelSteps: [{ count: 3600, label: '全市场' }],
      hasNewResults: true,
    });
    const state = pickerReducer(prev, { type: 'RESET' });
    expect(state).toEqual(initialState);
  });

  it('clears sessionStorage', () => {
    sessionStorage.setItem(STORAGE_KEY, 'some data');
    pickerReducer(initialState, { type: 'RESET' });
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// saveState / loadState (sessionStorage persistence)
// ---------------------------------------------------------------------------

describe('saveState', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('persists state to sessionStorage', () => {
    saveState(initialState);
    const raw = sessionStorage.getItem(STORAGE_KEY);
    expect(raw).toBeTruthy();
  });

  it('includes candidates in persisted data', () => {
    const state: PickerState = {
      ...initialState,
      candidates: [{ symbol: 'AAPL', price: 180 }],
    };
    saveState(state);
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const parsed = JSON.parse(raw!);
    expect(parsed.candidates).toEqual([{ symbol: 'AAPL', price: 180 }]);
  });

  it('persists messages and filters', () => {
    const state: PickerState = {
      ...initialState,
      phase: 'chat',
      messages: [{ id: 'm1', role: 'user', content: 'hi' }],
      accumulatedFilters: [{ field: 'roe', op: 'gt', value: 15 }],
    };
    saveState(state);
    const parsed = JSON.parse(sessionStorage.getItem(STORAGE_KEY)!);
    expect(parsed.phase).toBe('chat');
    expect(parsed.messages).toHaveLength(1);
    expect(parsed.accumulatedFilters).toHaveLength(1);
  });
});

describe('loadState', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('returns initialState when nothing stored', () => {
    expect(loadState()).toEqual(initialState);
  });

  it('restores saved state with candidates preserved', () => {
    const saved = {
      phase: 'chat',
      messages: [{ id: 'm1', role: 'user', content: 'hi' }],
      accumulatedFilters: [{ field: 'roe', op: 'gt', value: 15 }],
      candidates: [{ symbol: 'AAPL', price: 180 }],
      candidateCount: 50,
      universeSize: 3600,
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    const state = loadState();
    expect(state.phase).toBe('chat');
    expect(state.messages).toHaveLength(1);
    expect(state.candidates).toEqual([{ symbol: 'AAPL', price: 180 }]);
    expect(state.candidateCount).toBe(50);
  });

  it('resets isLoading and error on restore', () => {
    const saved = { ...initialState, isLoading: true, error: 'stale error' };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    const state = loadState();
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
  });

  it('returns initialState on invalid JSON', () => {
    sessionStorage.setItem(STORAGE_KEY, 'not json{{{');
    expect(loadState()).toEqual(initialState);
  });
});

// ---------------------------------------------------------------------------
// Content panel navigation (Research Desk)
// ---------------------------------------------------------------------------

describe('PUSH_CONTENT', () => {
  it('pushes current content onto stack and sets new active', () => {
    const stockContent = {
      type: 'stock' as const,
      label: 'NVDA',
      summary: 'NVDA analysis',
      params: { symbol: 'NVDA' },
      available_actions: [],
    };
    const state = pickerReducer(initialState, {
      type: 'PUSH_CONTENT',
      content: stockContent,
    });
    expect(state.activeContent).toBe(stockContent);
    expect(state.contentStack).toHaveLength(1);
    expect(state.contentStack[0]).toBe(initialState.activeContent);
  });

  it('supports multiple pushes (stack grows)', () => {
    const content1 = {
      type: 'stock' as const,
      label: 'AAPL',
      summary: '',
      params: { symbol: 'AAPL' },
      available_actions: [],
    };
    const content2 = {
      type: 'macro' as const,
      label: 'Macro',
      summary: '',
      params: {},
      available_actions: [],
    };
    let state = pickerReducer(initialState, { type: 'PUSH_CONTENT', content: content1 });
    state = pickerReducer(state, { type: 'PUSH_CONTENT', content: content2 });
    expect(state.activeContent).toBe(content2);
    expect(state.contentStack).toHaveLength(2);
  });
});

describe('POP_CONTENT', () => {
  it('restores previous content from stack', () => {
    const stockContent = {
      type: 'stock' as const,
      label: 'NVDA',
      summary: '',
      params: { symbol: 'NVDA' },
      available_actions: [],
    };
    let state = pickerReducer(initialState, { type: 'PUSH_CONTENT', content: stockContent });
    state = pickerReducer(state, { type: 'POP_CONTENT' });
    expect(state.activeContent).toEqual(initialState.activeContent);
    expect(state.contentStack).toHaveLength(0);
  });

  it('does nothing when stack is empty', () => {
    const state = pickerReducer(initialState, { type: 'POP_CONTENT' });
    expect(state).toBe(initialState);
  });
});

describe('SWITCH_CONTENT', () => {
  it('replaces active content without changing stack', () => {
    const stockContent = {
      type: 'stock' as const,
      label: 'MSFT',
      summary: '',
      params: { symbol: 'MSFT' },
      available_actions: [],
    };
    const state = pickerReducer(initialState, {
      type: 'SWITCH_CONTENT',
      content: stockContent,
    });
    expect(state.activeContent).toBe(stockContent);
    expect(state.contentStack).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Unknown action
// ---------------------------------------------------------------------------

describe('unknown action', () => {
  it('returns state unchanged', () => {
    const state = pickerReducer(initialState, { type: 'UNKNOWN' } as never);
    expect(state).toBe(initialState);
  });
});
