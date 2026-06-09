'use client';

import { memo, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Children = { children?: ReactNode };

const DEFAULT_COMPONENTS = {
  a: ({ children, href }: Children & { href?: string }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary no-underline hover:underline break-words"
    >
      {children}
    </a>
  ),
  table: ({ children }: Children) => (
    <div className="my-3 overflow-x-auto rounded-lg border border-border/60">
      <table className="w-full text-xs border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }: Children) => (
    <thead className="bg-muted/40">{children}</thead>
  ),
  th: ({ children }: Children) => (
    <th className="px-3 py-2 text-left font-medium text-foreground border-b border-border whitespace-nowrap">
      {children}
    </th>
  ),
  td: ({ children }: Children) => (
    <td className="px-3 py-2 align-top text-foreground/90 border-b border-border/40">
      {children}
    </td>
  ),
  blockquote: ({ children }: Children) => (
    <blockquote className="my-3 border-l border-primary/30 bg-primary/[0.03] py-2 pl-3 pr-3 rounded-r-md text-foreground/85 [&>p]:my-0">
      {children}
    </blockquote>
  ),
  code: ({ className, children }: Children & { className?: string }) => {
    const isBlock = !!className && className.startsWith('language-');
    if (isBlock) {
      return <code className={className}>{children}</code>;
    }
    return (
      <code className="font-data text-xs text-foreground/90 bg-muted/60 rounded px-1 py-0.5">
        {children}
      </code>
    );
  },
  pre: ({ children }: Children) => (
    <pre className="my-3 overflow-x-auto bg-muted rounded-lg p-3 text-xs text-foreground">
      {children}
    </pre>
  ),
  hr: () => <hr className="my-3 border-border/40" />,
};

interface MarkdownBodyProps {
  children: string;
  /** Optional per-call overrides — merged on top of defaults. */
  components?: Record<string, unknown>;
}

/**
 * Shared markdown renderer with GFM (tables / strikethrough / task lists) and
 * project-wide visual defaults for tables, blockquotes, inline code etc.
 * Use this instead of <ReactMarkdown> directly so callers can't accidentally
 * skip remarkGfm or diverge on table styling.
 */
function MarkdownBody({ children, components }: MarkdownBodyProps) {
  const merged = components
    ? { ...DEFAULT_COMPONENTS, ...components }
    : DEFAULT_COMPONENTS;
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={merged as any}>
      {children}
    </ReactMarkdown>
  );
}

/* Memoized so a parent re-render with identical markdown does not re-parse.
   During streaming the active message's content changes (so it re-renders),
   but settled messages skip react-markdown's full re-tokenize. */
export default memo(MarkdownBody);
