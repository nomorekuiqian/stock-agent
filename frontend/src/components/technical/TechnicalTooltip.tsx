'use client';

import * as Tooltip from '@radix-ui/react-tooltip';
import { TECHNICAL_INDICATOR_EXPLANATIONS } from './constants';

interface TechnicalTooltipProps {
  term: string;
  children: React.ReactNode;
}

export function TechnicalTooltip({ term, children }: TechnicalTooltipProps) {
  const explanation = TECHNICAL_INDICATOR_EXPLANATIONS[term];
  if (!explanation) {
    return <>{children}</>;
  }

  return (
    <Tooltip.Provider delayDuration={200}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <span className="inline-flex items-center cursor-help">
            <span className="border-b border-dotted border-primary/40 text-foreground">
              {children}
            </span>
            <svg
              className="w-3 h-3 ml-0.5 text-primary/50 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </span>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="top"
            sideOffset={8}
            className="w-64 px-3 py-2.5 text-xs bg-card border border-border rounded-lg shadow-xl z-[9999] data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0"
          >
            <span className="block font-medium text-foreground mb-1">
              {explanation.zh}
              <span className="text-muted-foreground/70 ml-1 font-normal">{explanation.en}</span>
            </span>
            <span className="block text-muted-foreground leading-relaxed mb-1.5">
              {explanation.tip}
            </span>
            <span className="block text-amber-400/80 bg-amber-500/10 rounded px-1.5 py-1 leading-relaxed">
              {explanation.analogy}
            </span>
            <Tooltip.Arrow className="fill-border" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
