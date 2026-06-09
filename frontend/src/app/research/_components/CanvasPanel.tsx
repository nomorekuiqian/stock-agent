'use client';

import { useState, useCallback, useEffect, useRef, type ReactNode, type CSSProperties } from 'react';
import { X, PanelRight } from 'lucide-react';

const MIN_W = 380;
const DEFAULT_W = 600;
const MIN_CHAT = 420; // keep the chat column at least this wide
const WIDTH_KEY = 'research:canvasW';

interface CanvasPanelProps {
  children: ReactNode;
  /** Whether the panel is the active mobile tab (results). Desktop ignores this. */
  mobileActive: boolean;
  /** Changes whenever the panel's content changes — used to auto-reopen if collapsed. */
  contentKey?: string;
}

/**
 * CanvasPanel — ChatGPT-canvas-style right panel.
 *
 * Desktop: a fixed-width column the user can drag-resize (left edge) and
 * collapse (X). When collapsed it shrinks to a thin rail with a reopen button,
 * letting the chat take the full width. Width persists to localStorage and the
 * panel auto-reopens when fresh content arrives (contentKey changes).
 *
 * Mobile: behaves like before — full width, shown only when it's the active tab;
 * collapse is a desktop-only concept.
 */
export default function CanvasPanel({ children, mobileActive, contentKey }: CanvasPanelProps) {
  // Lazy-init from localStorage so a dragged width survives reload/remount
  // (lazy initializer, not an effect — keeps this lint-clean and SSR-safe).
  const [width, setWidth] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_W;
    const v = Number(localStorage.getItem(WIDTH_KEY));
    return v >= MIN_W ? v : DEFAULT_W;
  });
  const [collapsed, setCollapsed] = useState(false);
  // Holds the active drag's teardown so an unmount mid-drag can also run it.
  const cleanupRef = useRef<(() => void) | null>(null);

  // Auto-reopen when fresh content arrives. React's "adjust state during render
  // on prop change" pattern — no effect, so no cascading-render lint issue, and
  // it reopens before paint (no flash of the collapsed rail).
  const [prevKey, setPrevKey] = useState(contentKey);
  if (contentKey !== prevKey) {
    setPrevKey(contentKey);
    if (collapsed) setCollapsed(false);
  }

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    let latest = width; // start from current width so a no-move click is a no-op
    const onMove = (ev: MouseEvent) => {
      const maxW = Math.max(MIN_W, window.innerWidth - MIN_CHAT);
      latest = Math.min(maxW, Math.max(MIN_W, window.innerWidth - ev.clientX));
      setWidth(latest);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      cleanupRef.current = null;
      try { localStorage.setItem(WIDTH_KEY, String(latest)); } catch { /* storage unavailable */ }
    };
    // Expose teardown so an unmount mid-drag releases the window listeners and
    // body styles (otherwise the document stays stuck in col-resize / no-select).
    cleanupRef.current = onUp;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [width]);

  // Safety net: if the component unmounts mid-drag, run the active teardown.
  useEffect(() => () => { cleanupRef.current?.(); }, []);

  return (
    <>
      {/* Reopen rail — desktop only, shown when collapsed. */}
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        title="展开面板"
        aria-label="展开面板"
        className={`hidden shrink-0 w-9 items-start justify-center border-l border-border/40 bg-background pt-3 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground cursor-pointer ${
          collapsed ? 'lg:flex' : ''
        }`}
      >
        <PanelRight className="h-4 w-4" />
      </button>

      {/* Panel. On mobile: full-width tab. On desktop: resizable fixed width,
          hidden when collapsed (the rail above takes over). */}
      <div
        style={collapsed ? undefined : ({ ['--cw']: `${width}px` } as CSSProperties)}
        className={`
          relative min-h-0 flex-col overflow-hidden
          ${mobileActive ? 'flex w-full' : 'hidden'}
          ${collapsed ? 'lg:hidden' : 'lg:flex lg:w-[var(--cw)] lg:shrink-0'}
        `}
      >
        {/* Drag handle — desktop only, on the left edge. */}
        <div
          onMouseDown={startResize}
          role="separator"
          aria-orientation="vertical"
          title="拖动调整宽度"
          className="group absolute inset-y-0 left-0 z-30 hidden w-2 -translate-x-1/2 cursor-col-resize lg:block"
        >
          <div className="mx-auto h-full w-px bg-transparent transition-colors group-hover:bg-primary/50" />
        </div>

        {/* Collapse button — desktop only. */}
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          title="收起面板"
          aria-label="收起面板"
          className="absolute right-2 top-2 z-30 hidden items-center justify-center rounded-md bg-background/70 p-1.5 text-muted-foreground backdrop-blur transition-colors hover:bg-muted/70 hover:text-foreground cursor-pointer lg:inline-flex"
        >
          <X className="h-4 w-4" />
        </button>

        {children}
      </div>
    </>
  );
}
