'use client';

import { useState, useEffect, useRef } from 'react';
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
 * Visual: small button "🎙️ 博主视角" in the chat panel header. When a persona
 * is loaded, shows a chip with the username and an ✕ to revert.
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
        <div className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
          <span>🎙️ @{personaUsername} 视角</span>
          <button
            type="button"
            onClick={handleClearPersona}
            aria-label="退出博主视角"
            className="ml-1 text-emerald-600 hover:text-emerald-800 transition"
          >
            ✕
          </button>
        </div>
      ) : (
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 transition"
        >
          🎙️ 博主视角
        </button>
      )}

      {!active && open && (
        <div
          ref={popoverRef}
          className={`absolute left-0 w-72 z-50 rounded-lg border border-gray-200 bg-white shadow-lg ${
            placement === 'top' ? 'bottom-full mb-2' : 'top-full mt-1'
          }`}
        >
          <div className="px-3 py-2 text-xs text-gray-500 border-b border-gray-100">
            选一个博主，按他的方法论投研
          </div>
          {!loaded && (
            <div className="px-3 py-3 text-xs text-gray-400">加载中...</div>
          )}
          {loaded && personas.length === 0 && (
            <div className="px-3 py-3 text-xs text-gray-400">
              暂无可用博主视角（功能可能未开启）
            </div>
          )}
          {loaded && personas.map((p) => (
            <button
              key={p.username}
              type="button"
              onClick={() => handlePickPersona(p)}
              className="block w-full text-left px-3 py-2 hover:bg-gray-50 transition border-b border-gray-50 last:border-b-0"
            >
              <div className="text-sm font-medium text-gray-900">@{p.username}</div>
              <div className="mt-0.5 text-xs text-gray-500 line-clamp-2">
                {p.description || '博主方法论视角'}
              </div>
              {p.lenses_available?.length > 0 && (
                <div className="mt-1 text-[10px] text-gray-400">
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
