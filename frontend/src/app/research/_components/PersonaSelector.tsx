'use client';

import { useState, useEffect, useRef } from 'react';
import { Check, ChevronDown, Glasses } from 'lucide-react';
import { api } from '@/lib/api';
import type { KolPersonaSummary } from '@/lib/api';

export type AgentKind = 'research' | 'kol_research';

interface PersonaSelectorProps {
  agentKind: AgentKind;
  personaUsername: string | null;
  onChange: (next: { agentKind: AgentKind; personaUsername: string | null }) => void;
  /** Caller controls confirmation flow when there's unsaved chat in progress. */
  requireConfirmBeforeSwitch?: boolean;
  /** Which direction the popover expands. 'top' for bottom-anchored composers, 'bottom' (default) otherwise. */
  placement?: 'top' | 'bottom';
  /** Align the popover against the trigger. */
  align?: 'left' | 'right';
  /** Compact mode fits composer toolbars above the input. */
  variant?: 'toolbar' | 'default';
}

const FALLBACK_PERSONAS: KolPersonaSummary[] = [
  {
    username: 'qinbafrank',
    display_name: 'Frank',
    description: 'AI 算力、宏观与加密金融视角，关注市场如何重新定价资产。',
    lenses_available: ['stock', 'market', 'industry'],
    last_indexed_at: null,
  },
  {
    username: 'aleabitoreddit',
    display_name: 'Serenity',
    description: 'AI 半导体供应链、光子/CPO 与 small-cap 瓶颈视角。',
    lenses_available: ['stock', 'sector'],
    last_indexed_at: null,
  },
];

function PersonaAvatar({
  username,
  label,
  className = '',
}: {
  username: string;
  label: string;
  className?: string;
}) {
  const initials = label.replace(/^@/, '').slice(0, 2).toUpperCase();

  return (
    <div className={`relative h-6 w-6 shrink-0 overflow-hidden rounded-full border border-border/60 bg-card shadow-sm shadow-black/[0.04] transition-transform duration-200 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/kol-avatars/${username.toLowerCase()}.png`}
        alt=""
        aria-hidden
        className="h-full w-full object-cover"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = 'none';
          const fallback = (e.currentTarget as HTMLImageElement).nextElementSibling as HTMLElement | null;
          if (fallback) {
            fallback.classList.remove('hidden');
            fallback.classList.add('flex');
          }
        }}
      />
      <span aria-hidden className="hidden h-full w-full items-center justify-center text-xs font-semibold text-primary">
        {initials}
      </span>
    </div>
  );
}

function DefaultAssistantAvatar({ className = '' }: { className?: string }) {
  return (
    <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/[0.08] shadow-sm shadow-emerald-950/[0.04] transition-transform duration-200 ${className}`}>
      <Glasses className="h-3.5 w-3.5 text-primary" aria-hidden />
    </div>
  );
}

/**
 * PersonaSelector — picks between the neutral research agent and a KOL persona.
 */
export default function PersonaSelector({
  agentKind,
  personaUsername,
  onChange,
  requireConfirmBeforeSwitch = true,
  placement = 'bottom',
  align = 'left',
  variant = 'default',
}: PersonaSelectorProps) {
  const [open, setOpen] = useState(false);
  const [personas, setPersonas] = useState<KolPersonaSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Load personas once the popover is opened for the first time.
  useEffect(() => {
    if (!open || loaded) return;
    let cancelled = false;
    api.kolResearch.personas().then((res) => {
      if (cancelled) return;
      setPersonas(res.personas?.length ? res.personas : FALLBACK_PERSONAS);
      setLoaded(true);
    }).catch(() => {
      if (cancelled) return;
      setPersonas(FALLBACK_PERSONAS);
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [open, loaded]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const tryConfirm = (msg: string) => {
    if (!requireConfirmBeforeSwitch) return true;
    return typeof window !== 'undefined' && window.confirm(msg);
  };

  const handlePickPersona = (p: KolPersonaSummary) => {
    if (agentKind === 'kol_research' && personaUsername === p.username) {
      setOpen(false);
      return;
    }
    if (!tryConfirm('切换到博主视角会开启新对话，当前未保存内容会丢失。继续？')) return;
    onChange({ agentKind: 'kol_research', personaUsername: p.username });
    setOpen(false);
  };

  const handlePickResearch = () => {
    if (agentKind === 'research') {
      setOpen(false);
      return;
    }
    handleClearPersona();
  };

  const handleClearPersona = () => {
    if (!tryConfirm('切换回中性投研助手会开启新对话，当前未保存内容会丢失。继续？')) return;
    onChange({ agentKind: 'research', personaUsername: null });
    setOpen(false);
  };

  const active = agentKind === 'kol_research' && !!personaUsername;
  const activePersona = personas.find((p) => p.username === personaUsername);
  const activeLabel = active
    ? `@${activePersona?.display_name || personaUsername}`
    : '默认助手';
  const popoverAlignClass = align === 'right'
    ? 'left-0 sm:left-auto sm:right-0'
    : 'left-0';
  const isToolbar = variant === 'toolbar';
  const selectedRowClass = 'bg-primary/[0.07] text-primary';
  const rowClass = 'group/persona flex w-full items-center gap-3 border-b border-border/40 px-3 py-3 text-left transition-[background-color,color] duration-200 last:border-b-0 hover:bg-primary/[0.055] focus:outline-none focus-visible:bg-primary/[0.075]';

  return (
    <div className="relative inline-flex items-center">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`group/persona inline-flex items-center gap-2 border text-left text-sm font-medium backdrop-blur-md transition-[border-color,background-color,color,box-shadow,transform] duration-200 hover:-translate-y-px active:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
          isToolbar
            ? 'h-9 rounded-full px-2.5'
            : 'h-10 rounded-xl px-3'
        } ${
          active
            ? 'border-primary/30 bg-primary/[0.09] text-primary shadow-[0_10px_26px_rgba(5,150,105,0.10)] hover:border-primary/40 hover:bg-primary/[0.12]'
            : 'border-border/65 bg-background/85 text-foreground shadow-sm shadow-black/[0.025] hover:border-primary/20 hover:bg-primary/[0.045] hover:shadow-[0_10px_26px_rgba(15,23,42,0.06)]'
        }`}
      >
        {active && personaUsername ? (
          <PersonaAvatar
            username={personaUsername}
            label={activeLabel}
            className="ring-2 ring-primary/15 group-hover/persona:scale-105"
          />
        ) : (
          <DefaultAssistantAvatar className="group-hover/persona:scale-105" />
        )}
        <span className="max-w-[9rem] truncate leading-none">{activeLabel}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      {open && (
        <div
          ref={popoverRef}
          role="menu"
          className={`absolute ${popoverAlignClass} z-50 w-[min(17rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border/70 bg-popover/95 shadow-2xl shadow-black/15 backdrop-blur-xl animate-fade-in-up ${
            placement === 'top' ? 'bottom-full mb-2 origin-bottom-left' : 'top-full mt-2 origin-top-left'
          }`}
        >
          <div className="flex items-center justify-between border-b border-border/60 px-3 py-2.5">
            <div className="text-xs font-medium text-muted-foreground">选择助手视角</div>
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-primary/70" />
          </div>
          <button
            type="button"
            onClick={handlePickResearch}
            role="menuitemradio"
            aria-checked={!active}
            className={`${rowClass} ${!active ? selectedRowClass : 'text-foreground'}`}
          >
            <DefaultAssistantAvatar className="group-hover/persona:scale-105" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">默认投研助手</span>
                {!active && <Check className="h-3.5 w-3.5 text-primary" aria-hidden />}
              </div>
            </div>
          </button>
          {!loaded && (
            <div className="px-3 py-3 text-xs text-muted-foreground/70">加载中...</div>
          )}
          {loaded && personas.map((p) => (
            <button
              key={p.username}
              type="button"
              onClick={() => handlePickPersona(p)}
              role="menuitemradio"
              aria-checked={active && personaUsername === p.username}
              className={`${rowClass} ${active && personaUsername === p.username ? selectedRowClass : 'text-foreground'}`}
            >
              <PersonaAvatar
                username={p.username}
                label={p.display_name || p.username}
                className="group-hover/persona:scale-105"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">
                    @{p.display_name || p.username}
                  </span>
                  {active && personaUsername === p.username && (
                    <Check className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
