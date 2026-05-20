'use client';

import { useState, useCallback, useEffect } from 'react';
import { useSubmitFeedback } from '@/hooks/queries/use-feedback';
import type { FeedbackInput } from '@/lib/api';

interface FeedbackBarProps {
  targetType: FeedbackInput['target_type'];
  targetId: string;
  snapshot?: { text?: string; [key: string]: unknown };
}

const REASONS = [
  { value: '不准', label: '不准' },
  { value: '已知', label: '已知' },
  { value: '不相关', label: '不相关' },
];

const LOCK_MS = 60_000;

export function FeedbackBar({ targetType, targetId, snapshot }: FeedbackBarProps) {
  const submitFeedback = useSubmitFeedback();
  const [submitted, setSubmitted] = useState<'up' | 'down' | null>(null);
  const [showReasons, setShowReasons] = useState(false);
  const [submittedAt, setSubmittedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now);

  const locked = submittedAt !== null && now - submittedAt < LOCK_MS;

  // Tick to unlock after LOCK_MS
  useEffect(() => {
    if (submittedAt === null) return;
    const remaining = LOCK_MS - (Date.now() - submittedAt);
    if (remaining <= 0) return;
    const timer = setTimeout(() => setNow(Date.now()), remaining + 50);
    return () => clearTimeout(timer);
  }, [submittedAt]);

  const doSubmit = useCallback((sentiment: 1 | -1, reason?: string) => {
    setSubmitted(sentiment === 1 ? 'up' : 'down');
    setSubmittedAt(Date.now());
    setShowReasons(false);
    submitFeedback.mutate({
      target_type: targetType,
      target_id: targetId,
      sentiment,
      reason,
      snapshot: snapshot ? { text: snapshot.text?.slice(0, 500) } : undefined,
    });
  }, [targetType, targetId, snapshot, submitFeedback]);

  // Auto-close reasons after 3 seconds with default reason
  useEffect(() => {
    if (!showReasons) return;
    const timer = setTimeout(() => {
      if (!submitted) {
        doSubmit(-1, '不相关');
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [showReasons, submitted, doSubmit]);

  const handleUp = useCallback(() => {
    if (locked) return;
    doSubmit(1);
  }, [locked, doSubmit]);

  const handleDownClick = useCallback(() => {
    if (locked) return;
    setShowReasons(true);
  }, [locked]);

  const handleDownSubmit = useCallback((reason: string) => {
    doSubmit(-1, reason);
  }, [doSubmit]);

  return (
    <div className="flex items-center gap-1 mt-2">
      <button
        type="button"
        onClick={handleUp}
        disabled={locked}
        aria-label="有帮助"
        className={`p-1 rounded transition-all ${
          submitted === 'up'
            ? 'text-primary opacity-100'
            : 'text-muted-foreground opacity-40 hover:opacity-100'
        } ${locked ? 'cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <svg className="w-3.5 h-3.5" fill={submitted === 'up' ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z M4 22h-2a2 2 0 01-2-2v-7a2 2 0 012-2h2" />
        </svg>
      </button>

      <button
        type="button"
        onClick={handleDownClick}
        disabled={locked}
        aria-label="需改善"
        className={`p-1 rounded transition-all ${
          submitted === 'down'
            ? 'text-red-400 opacity-100'
            : 'text-muted-foreground opacity-40 hover:opacity-100'
        } ${locked ? 'cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <svg className="w-3.5 h-3.5" fill={submitted === 'down' ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3H10z M20 2h2a2 2 0 012 2v7a2 2 0 01-2 2h-2" />
        </svg>
      </button>

      {showReasons && (
        <div className="flex items-center gap-1.5 ml-2 animate-fade-in-up">
          {REASONS.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => handleDownSubmit(r.value)}
              className="text-[10px] px-2 py-0.5 rounded-full border border-border/50 bg-card/80 text-muted-foreground hover:border-primary/30 hover:text-foreground transition-all"
            >
              {r.label}
            </button>
          ))}
        </div>
      )}

      {submitted && locked && (
        <span className="text-[10px] text-muted-foreground/50 ml-1">已记录</span>
      )}
    </div>
  );
}
