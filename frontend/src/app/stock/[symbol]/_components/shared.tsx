'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';

export function AnalysisSection({ label, content, accentColor = 'teal', defaultOpen = true }: {
  label: string;
  content: string;
  accentColor?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (!content) return null;

  return (
    <div className="border-b border-border/15 last:border-b-0">
      <button onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between py-3 text-left cursor-pointer group focus-visible:ring-2 focus-visible:ring-teal-500/40 focus-visible:outline-none`}>
        <h4 className={`text-xs uppercase tracking-[0.12em] text-${accentColor}-500/80 font-medium group-hover:text-${accentColor}-400 transition-colors`}>{label}</h4>
        <svg className={`w-3.5 h-3.5 text-muted-foreground/70 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="pb-4 text-sm text-muted-foreground leading-7 prose prose-sm prose-invert max-w-none
          prose-strong:text-foreground prose-strong:font-semibold prose-p:text-muted-foreground prose-li:text-muted-foreground">
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}
