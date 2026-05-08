'use client';

/**
 * Nonprod-only "Generate today's digest" button.
 *
 * Hidden in production. Visibility is determined client-side from
 * NEXT_PUBLIC_API_URL — anything containing 'localhost' or 'staging' is
 * considered nonprod. This avoids needing a separate env var; if it ever
 * gets restrictive we can add NEXT_PUBLIC_ENVIRONMENT explicitly.
 *
 * The backend `POST /api/twitter-digest/generate` is itself gated to
 * nonprod / admin / cron, so even if a user manages to render this in
 * prod (e.g. by spoofing NEXT_PUBLIC_API_URL), the API call would fail.
 */

import { useState } from 'react';

import { api } from '@/lib/api';

interface Props {
  onGenerated?: () => void;   // parent refetches latest after success
}

function isNonprodEnv(): boolean {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
  if (!apiUrl) return false;
  // Heuristic: localhost or staging-like hostnames
  return /localhost|127\.0\.0\.1|0\.0\.0\.0|staging|preview|\.vercel\.app|render\.com/i.test(apiUrl);
}

export function GenerateButton({ onGenerated }: Props) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneAt, setDoneAt] = useState<string | null>(null);

  if (!isNonprodEnv()) return null;

  async function handleClick() {
    if (running) return;
    setRunning(true);
    setError(null);
    setDoneAt(null);
    try {
      await api.twitterDigest.generate(24);
      setDoneAt(new Date().toLocaleTimeString('zh-CN'));
      onGenerated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="rounded-lg border border-amber-300/40 bg-amber-50/40 dark:bg-amber-900/15 px-4 py-3 mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div className="text-xs text-amber-900/85 dark:text-amber-200/85">
        <span className="font-medium uppercase tracking-wider mr-2">测试环境</span>
        <span className="text-amber-800/70 dark:text-amber-300/70">
          点击下方按钮触发一次完整 pipeline(30-90 秒)。生产环境不显示此按钮。
        </span>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {error && (
          <span className="text-xs text-rose-600 dark:text-rose-400" role="alert">
            {error}
          </span>
        )}
        {doneAt && !error && (
          <span className="text-xs text-emerald-700 dark:text-emerald-400">
            生成完成 · {doneAt}
          </span>
        )}
        <button
          type="button"
          onClick={handleClick}
          disabled={running}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {running ? (
            <>
              <span className="w-3 h-3 rounded-full border border-primary-foreground/30 border-t-primary-foreground animate-spin" aria-hidden />
              <span>生成中...</span>
            </>
          ) : (
            <span>生成今日日报</span>
          )}
        </button>
      </div>
    </div>
  );
}
