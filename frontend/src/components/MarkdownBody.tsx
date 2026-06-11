'use client';

import { Fragment, isValidElement, memo, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Children = { children?: ReactNode };

const ARROW_CHAIN_SEPARATOR = /\s*(?:-{1,2}>|=>|→|⇒|➜|⟶)\s*/;

function getPlainText(children: ReactNode): string | null {
  if (typeof children === 'string' || typeof children === 'number') {
    return String(children);
  }
  if (Array.isArray(children)) {
    const parts = children.map(getPlainText);
    if (parts.some((part) => part === null)) return null;
    return parts.join('');
  }
  if (children === null || children === undefined || typeof children === 'boolean') {
    return '';
  }
  if (isValidElement(children)) {
    return null;
  }
  return null;
}

export function splitArrowChainText(text: string): string[] | null {
  const normalized = text.replace(/\u00a0/g, ' ').trim();
  if (!ARROW_CHAIN_SEPARATOR.test(normalized)) return null;

  const parts = normalized
    .split(ARROW_CHAIN_SEPARATOR)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 2) return null;
  return parts;
}

function ArrowChain({ parts }: { parts: string[] }) {
  return (
    <span className="inline-flex max-w-full flex-wrap items-center gap-x-1.5 gap-y-0.5 align-baseline">
      {parts.map((part, index) => (
        <Fragment key={`${part}-${index}`}>
          <span>{part}</span>
          {index < parts.length - 1 && (
            <span aria-hidden className="font-data text-primary/75">
              →
            </span>
          )}
        </Fragment>
      ))}
    </span>
  );
}

function AgentParagraph({ children }: Children) {
  const text = getPlainText(children);
  const parts = text ? splitArrowChainText(text) : null;
  return <p>{parts ? <ArrowChain parts={parts} /> : children}</p>;
}

function AgentListItem({ children }: Children) {
  const text = getPlainText(children);
  const parts = text ? splitArrowChainText(text) : null;
  return <li>{parts ? <ArrowChain parts={parts} /> : children}</li>;
}

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

const AGENT_COMPONENTS = {
  ...DEFAULT_COMPONENTS,
  p: AgentParagraph,
  li: AgentListItem,
  blockquote: ({ children }: Children) => (
    <blockquote className="relative my-3 border-l border-primary/30 bg-primary/[0.03] py-2 pl-7 pr-3 rounded-r-md text-foreground/85 [&>p]:my-0">
      <span aria-hidden className="absolute left-3 top-2 font-data text-xs font-semibold text-primary/75">
        &gt;
      </span>
      {children}
    </blockquote>
  ),
};

interface MarkdownBodyProps {
  children: string;
  /** Optional per-call overrides — merged on top of defaults. */
  components?: Record<string, unknown>;
  /** Agent output often uses ASCII arrows (`->`) and leading `>` as visual flow markers. */
  variant?: 'default' | 'agent';
}

/**
 * Shared markdown renderer with GFM (tables / strikethrough / task lists) and
 * project-wide visual defaults for tables, blockquotes, inline code etc.
 * Use this instead of <ReactMarkdown> directly so callers can't accidentally
 * skip remarkGfm or diverge on table styling.
 */
function MarkdownBody({ children, components, variant = 'default' }: MarkdownBodyProps) {
  const baseComponents = variant === 'agent' ? AGENT_COMPONENTS : DEFAULT_COMPONENTS;
  const merged = components
    ? { ...baseComponents, ...components }
    : baseComponents;
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
