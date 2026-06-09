'use client';

import { useState, useEffect, useRef } from 'react';
import { Glasses, X } from 'lucide-react';
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
}

/**
 * PersonaSelector — picks between the neutral research agent and a KOL persona.
 *
 * Visual: small icon button "博主视角" in the chat panel header. When a persona
 * is loaded, shows a chip with the username and a clear (X) control to revert.
 */
export default function PersonaSelector({
  agentKind,
  personaUsername,
  onChange,
  requireConfirmBeforeSwitch = true,
  placement = 'bottom',
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
      setPersonas(res.personas || []);
      setLoaded(true);
    }).catch(() => {
      if (cancelled) return;
      setPersonas([]);
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

  const handleClearPersona = () => {
    if (!tryConfirm('切换回中性投研助手会开启新对话，当前未保存内容会丢失。继续？')) return;
    onChange({ agentKind: 'research', personaUsername: null });
    setOpen(false);
  };

  const active = agentKind === 'kol_research' && personaUsername;

  return (
    <div className="relative inline-flex items-center gap-2">
      {active ? (
        <div className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-primary/10 text-primary border border-primary/20">
          <Glasses className="h-3.5 w-3.5" aria-hidden />
          <span>@{personaUsername} 视角</span>
          <button
            type="button"
            onClick={handleClearPersona}
            aria-label="退出博主视角"
            className="ml-0.5 text-primary/70 hover:text-primary transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <Glasses className="h-3.5 w-3.5" aria-hidden />
          博主视角
        </button>
      )}

      {!active && open && (
        <div
          ref={popoverRef}
          className={`absolute left-0 w-72 z-50 rounded-lg border border-border bg-popover shadow-lg ${
            placement === 'top' ? 'bottom-full mb-2' : 'top-full mt-1'
          }`}
        >
          <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border/60">
            选一个博主，按他的方法论投研
          </div>
          {!loaded && (
            <div className="px-3 py-3 text-xs text-muted-foreground/70">加载中...</div>
          )}
          {loaded && personas.length === 0 && (
            <div className="px-3 py-3 text-xs text-muted-foreground/70">
              暂无可用博主视角（功能可能未开启）
            </div>
          )}
          {loaded && personas.map((p) => (
            <button
              key={p.username}
              type="button"
              onClick={() => handlePickPersona(p)}
              className="block w-full text-left px-3 py-2 hover:bg-accent transition-colors border-b border-border/40 last:border-b-0"
            >
              <div className="text-sm font-medium text-foreground">@{p.username}</div>
              <div className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                {p.description || '博主方法论视角'}
              </div>
              {p.lenses_available?.length > 0 && (
                <div className="mt-1 text-micro text-muted-foreground/70">
                  {p.lenses_available.length} 个视角
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
