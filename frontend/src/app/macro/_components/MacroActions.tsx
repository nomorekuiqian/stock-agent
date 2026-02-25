'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

export function MacroActions() {
  const router = useRouter();
  const isDev = process.env.NODE_ENV === 'development';

  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  async function handleGenerate() {
    setGenerating(true);
    setGenerateError(null);
    try {
      await api.weeklyReport.generate(true);
      router.refresh();
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Failed to generate weekly report');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="flex items-center gap-3 shrink-0">
      <span className="text-xs text-muted-foreground">
        周报随 MarketBrew 日报自动发送
      </span>

      {isDev && (
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium text-sm transition-all hover:bg-emerald-500 hover:shadow-lg hover:shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none flex items-center gap-2"
        >
          {generating ? (
            <>
              <Spinner />
              <span>生成中...</span>
            </>
          ) : (
            <span>生成周报</span>
          )}
        </button>
      )}

      {generateError && (
        <p className="text-sm text-red-500">{generateError}</p>
      )}
    </div>
  );
}
