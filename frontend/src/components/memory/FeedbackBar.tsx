'use client';

import { useState, useCallback, useRef } from 'react';
import { ThumbsDown, ThumbsUp } from 'lucide-react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useSubmitFeedback } from '@/hooks/queries/use-feedback';
import { cn } from '@/lib/utils';
import type { FeedbackInput } from '@/lib/api';

interface FeedbackBarProps {
  targetType: FeedbackInput['target_type'];
  targetId: string;
  snapshot?: { text?: string; [key: string]: unknown };
  variant?: 'compact' | 'agent';
  prompt?: string;
  agentId?: FeedbackInput['agent_id'];
  sessionId?: string | null;
  turnId?: string | null;
  clientEventId?: string | null;
  messageEventId?: string | null;
  initialSentiment?: 1 | -1 | null;
}

type FeedbackState = 'up' | 'down' | null;

function toFeedbackState(sentiment: 1 | -1 | null | undefined): FeedbackState {
  if (sentiment === 1) return 'up';
  if (sentiment === -1) return 'down';
  return null;
}

function toSentiment(state: FeedbackState): FeedbackInput['sentiment'] {
  if (state === 'up') return 1;
  if (state === 'down') return -1;
  return 0;
}

export function FeedbackBar({
  targetType,
  targetId,
  snapshot,
  variant = 'compact',
  prompt,
  agentId,
  sessionId,
  turnId,
  clientEventId,
  messageEventId,
  initialSentiment,
}: FeedbackBarProps) {
  const submitFeedback = useSubmitFeedback();
  const [submitted, setSubmitted] = useState<FeedbackState>(() => toFeedbackState(initialSentiment));
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const isAgent = variant === 'agent';

  const submitState = useCallback((nextState: FeedbackState) => {
    setSubmitted(nextState);
    const sentiment = toSentiment(nextState);
    const payload: FeedbackInput = {
      target_type: targetType,
      target_id: targetId,
      sentiment,
      snapshot: snapshot ? { ...snapshot, text: snapshot.text?.slice(0, 500) } : undefined,
      agent_id: agentId,
      session_id: sessionId || undefined,
      turn_id: turnId || undefined,
      client_event_id: clientEventId || undefined,
      message_event_id: messageEventId || undefined,
    };

    queueRef.current = queueRef.current
      .catch(() => undefined)
      .then(() => submitFeedback.mutateAsync(payload))
      .catch(() => undefined);
  }, [
    targetType,
    targetId,
    snapshot,
    agentId,
    sessionId,
    turnId,
    clientEventId,
    messageEventId,
    submitFeedback,
  ]);

  const handleUp = useCallback(() => {
    submitState(submitted === 'up' ? null : 'up');
  }, [submitted, submitState]);

  const handleDownClick = useCallback(() => {
    submitState(submitted === 'down' ? null : 'down');
  }, [submitted, submitState]);

  const liveStatus = submitted === 'up'
    ? '已标记为有帮助，再次点击可取消'
    : submitted === 'down'
      ? '已标记为需改善，再次点击可取消'
      : '反馈已取消';

  return (
    <div
      className={cn(
        'inline-flex min-w-0 items-center gap-1.5',
        isAgent ? 'text-sm' : 'mt-2 text-sm',
      )}
    >
      {(prompt || isAgent) && (
        <span className="mr-0.5 shrink-0 text-muted-foreground">
          {prompt || '这条有帮助吗？'}
        </span>
      )}

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handleUp}
            aria-label={submitted === 'up' ? '取消有帮助反馈' : '标记为有帮助'}
            aria-pressed={submitted === 'up'}
            className={cn(
              'inline-flex size-7 items-center justify-center rounded-full border transition-colors',
              submitted === 'up'
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-transparent text-muted-foreground hover:border-border hover:bg-muted/60 hover:text-foreground',
            )}
          >
            <ThumbsUp
              className="size-4"
              fill={submitted === 'up' ? 'currentColor' : 'none'}
              strokeWidth={1.8}
            />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-sm leading-relaxed">
          {submitted === 'up' ? '取消有帮助' : '有帮助'}
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handleDownClick}
            aria-label={submitted === 'down' ? '取消需改善反馈' : '标记为需改善'}
            aria-pressed={submitted === 'down'}
            className={cn(
              'inline-flex size-7 items-center justify-center rounded-full border transition-colors',
              submitted === 'down'
                ? 'border-red-400/40 bg-red-500/10 text-red-400'
                : 'border-transparent text-muted-foreground hover:border-border hover:bg-muted/60 hover:text-foreground',
            )}
          >
            <ThumbsDown
              className="size-4"
              fill={submitted === 'down' ? 'currentColor' : 'none'}
              strokeWidth={1.8}
            />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-sm leading-relaxed">
          {submitted === 'down' ? '取消需改善' : '需改善'}
        </TooltipContent>
      </Tooltip>

      <span className="sr-only" aria-live="polite">
        {liveStatus}
      </span>
    </div>
  );
}
