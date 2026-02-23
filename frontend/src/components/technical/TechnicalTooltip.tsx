'use client';

import { useState, useRef } from 'react';
import { TECHNICAL_INDICATOR_EXPLANATIONS } from './constants';

interface TechnicalTooltipProps {
  term: string;
  children: React.ReactNode;
}

export function TechnicalTooltip({ term, children }: TechnicalTooltipProps) {
  const [show, setShow] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLSpanElement>(null);

  const explanation = TECHNICAL_INDICATOR_EXPLANATIONS[term];
  if (!explanation) {
    return <>{children}</>;
  }

  const handleMouseEnter = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPosition({
        top: rect.top - 8,
        left: rect.left + rect.width / 2,
      });
    }
    setShow(true);
  };

  return (
    <span
      ref={triggerRef}
      className="inline-flex items-center cursor-help"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setShow(false)}
    >
      <span className="border-b border-dotted border-emerald-500/40 text-foreground">
        {children}
      </span>
      <svg className="w-3 h-3 ml-0.5 text-emerald-500/50 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      {show && (
        <span
          className="fixed w-64 px-3 py-2.5 text-xs bg-card border border-border rounded-lg shadow-xl -translate-x-1/2 -translate-y-full pointer-events-none"
          style={{ top: position.top, left: position.left, zIndex: 9999 }}
        >
          <span className="block font-medium text-foreground mb-1">
            {explanation.zh}
            <span className="text-muted-foreground/60 ml-1 font-normal">{explanation.en}</span>
          </span>
          <span className="block text-foreground/70 leading-relaxed mb-1.5">
            {explanation.tip}
          </span>
          <span className="block text-amber-400/80 bg-amber-500/10 rounded px-1.5 py-1 leading-relaxed">
            {explanation.analogy}
          </span>
          <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-border" />
        </span>
      )}
    </span>
  );
}
