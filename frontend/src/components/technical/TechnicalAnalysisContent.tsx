'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import { TechnicalTooltip } from './TechnicalTooltip';
import { TECHNICAL_INDICATOR_EXPLANATIONS } from './constants';

interface TechnicalAnalysisContentProps {
  content: string;
  className?: string;
}

// Regex pattern matching technical terms that have explanations
const TECHNICAL_TERM_PATTERN =
  /\b(RSI|MACD|SMA\s?20|SMA\s?50|SMA\s?200|SMA|EMA|ADX|ATR|BB)\b|布林带|均线|支撑位?|阻力位?|超买|超卖|金叉|死叉|背离|多头排列|空头排列/g;

// Map matched text to the constants key
function getExplanationKey(match: string): string | null {
  const normalized = match.replace(/\s/g, '');
  // Direct match
  if (TECHNICAL_INDICATOR_EXPLANATIONS[normalized]) return normalized;
  if (TECHNICAL_INDICATOR_EXPLANATIONS[match]) return match;
  // Chinese term mappings
  const zhMap: Record<string, string> = {
    '布林带': 'BB',
    '均线': 'SMA',
    '支撑位': 'support',
    '支撑': 'support',
    '阻力位': 'resistance',
    '阻力': 'resistance',
    '超买': 'overbought',
    '超卖': 'oversold',
    '金叉': 'golden_cross',
    '死叉': 'death_cross',
    '背离': 'divergence',
    '多头排列': 'ma_bullish',
    '空头排列': 'ma_bearish',
  };
  if (zhMap[match]) return zhMap[match];
  return null;
}

// Process text to wrap technical terms with tooltips
function processTextWithTooltips(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  const seenTerms = new Set<string>();

  // Reset regex
  TECHNICAL_TERM_PATTERN.lastIndex = 0;

  let match;
  while ((match = TECHNICAL_TERM_PATTERN.exec(text)) !== null) {
    const key = getExplanationKey(match[0]);
    if (!key) continue;

    // Only add tooltip for first occurrence of each term
    if (seenTerms.has(key)) continue;
    seenTerms.add(key);

    // Add text before match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    // Add tooltip-wrapped term
    parts.push(
      <TechnicalTooltip key={`${key}-${match.index}`} term={key}>
        {match[0]}
      </TechnicalTooltip>
    );

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

// Custom text renderer that processes technical terms
function TextWithTooltips({ children }: { children: React.ReactNode }) {
  if (typeof children === 'string') {
    return <>{processTextWithTooltips(children)}</>;
  }
  if (Array.isArray(children)) {
    return (
      <>
        {children.map((child, i) =>
          typeof child === 'string' ? (
            <React.Fragment key={i}>{processTextWithTooltips(child)}</React.Fragment>
          ) : (
            <React.Fragment key={i}>{child}</React.Fragment>
          )
        )}
      </>
    );
  }
  return <>{children}</>;
}

export function TechnicalAnalysisContent({ content, className = '' }: TechnicalAnalysisContentProps) {
  return (
    <div className={`max-w-none ${className}`}>
      <ReactMarkdown
        components={{
          h1: ({ children }) => (
            <h4 className="text-base font-semibold text-foreground mt-5 mb-3 first:mt-0 pb-2 border-b border-border/30">
              <TextWithTooltips>{children}</TextWithTooltips>
            </h4>
          ),
          h2: ({ children }) => (
            <h5 className="text-sm font-semibold text-foreground mt-4 mb-2 first:mt-0">
              <TextWithTooltips>{children}</TextWithTooltips>
            </h5>
          ),
          h3: ({ children }) => (
            <h6 className="text-sm font-medium text-foreground mt-3 mb-2">
              <TextWithTooltips>{children}</TextWithTooltips>
            </h6>
          ),
          p: ({ children }) => (
            <p className="text-sm text-foreground/80 leading-relaxed mb-3 last:mb-0">
              <TextWithTooltips>{children}</TextWithTooltips>
            </p>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">
              <TextWithTooltips>{children}</TextWithTooltips>
            </strong>
          ),
          ul: ({ children }) => (
            <ul className="pl-4 space-y-2 my-3 border-l-2 border-border/40">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-5 space-y-2 my-3">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="text-sm text-foreground/80 leading-relaxed pl-2">
              <TextWithTooltips>{children}</TextWithTooltips>
            </li>
          ),
          code: ({ children }) => (
            <code className="font-data text-amber-400 bg-amber-500/15 px-1.5 py-0.5 rounded text-xs font-medium">
              {children}
            </code>
          ),
          hr: () => <hr className="my-4 border-border/30" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
