'use client';

import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUp } from 'lucide-react';

interface Props {
  username: string;
  displayName: string;
  suggestions?: string[];
}

const DEFAULT_SUGGESTIONS = [
  '他怎么看 NVDA 现在的位置？',
  'AI 算力链下一步看哪里？',
  '宏观风险等级现在是哪一级？',
];

/**
 * 首页前置对话框 — 真实输入,但不在本页 SSE。
 * Enter 或点击发送 → 跳 /research?agent=kol&persona=X&q=...,
 * /research 页会自动 setAgentKind + setPersonaUsername + 触发 handleSend。
 */
export default function ChatComposer({ username, displayName, suggestions }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [value, setValue] = useState('');
  const items = suggestions && suggestions.length > 0 ? suggestions : DEFAULT_SUGGESTIONS;

  function navigate(q: string) {
    const trimmed = q.trim();
    if (!trimmed) return;
    const href = `/research?agent=kol&persona=${encodeURIComponent(username)}&q=${encodeURIComponent(trimmed)}`;
    router.push(href);
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    navigate(value);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      navigate(value);
    }
  }

  const placeholder = `用 ${displayName} 的视角问一个问题…`;

  return (
    <section aria-label="追问视角" className="space-y-3">
      <form
        onSubmit={onSubmit}
        className="group flex items-end gap-2 rounded-xl border border-border/60 bg-card/40 p-2.5 shadow-sm transition focus-within:border-primary/60 focus-within:bg-card/60"
      >
        <textarea
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder={placeholder}
          aria-label="给他提一个问题"
          className="block max-h-40 min-h-[40px] flex-1 resize-none border-0 bg-transparent px-2 py-2 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-0"
        />
        <button
          type="submit"
          disabled={!value.trim()}
          aria-label="发送"
          className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-primary text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      </form>

      <ul className="flex flex-wrap items-center gap-2">
        {items.map((q) => (
          <li key={q}>
            <button
              type="button"
              onClick={() => navigate(q)}
              className="cursor-pointer rounded-full border border-border/60 bg-background/40 px-3 py-1.5 text-xs text-foreground/85 transition hover:border-primary/50 hover:bg-primary/5 hover:text-foreground"
            >
              {q}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
