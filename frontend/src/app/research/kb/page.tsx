'use client';

import { useState } from 'react';
import { api, type ResearchKBMessage, type RetrievedChunk } from '@/lib/api';

interface DisplayTurn {
  role: 'user' | 'assistant';
  content: string;
  chunks?: RetrievedChunk[];
}

export default function ResearchKbPage() {
  const [turns, setTurns] = useState<DisplayTurn[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    const message = input.trim();
    if (!message || loading) return;
    setError(null);
    setInput('');
    const nextTurns: DisplayTurn[] = [...turns, { role: 'user', content: message }];
    setTurns(nextTurns);
    setLoading(true);

    try {
      const history: ResearchKBMessage[] = turns.map((t) => ({
        role: t.role,
        content: t.content,
      }));
      const resp = await api.researchKb.chat({ message, history });
      setTurns([
        ...nextTurns,
        { role: 'assistant', content: resp.answer, chunks: resp.chunks_used },
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '请求失败';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex h-screen max-w-3xl flex-col bg-white p-6">
      <header className="mb-4">
        <h1 className="text-xl font-semibold text-gray-900">投研助手 · 知识库测试</h1>
        <p className="mt-1 text-sm text-gray-500">
          基于博主历史观点（vector_chunks，当前 16 条）的 RAG E2E 验证页
        </p>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto rounded-lg border border-gray-200 p-4">
        {turns.length === 0 && (
          <p className="text-sm text-gray-400">试试：qinbafrank 怎么看 AI 算力板块？</p>
        )}
        {turns.map((t, i) => (
          <div key={i} className={t.role === 'user' ? 'text-right' : ''}>
            <div
              className={
                'inline-block max-w-full whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ' +
                (t.role === 'user'
                  ? 'bg-emerald-50 text-emerald-900'
                  : 'bg-gray-50 text-gray-900')
              }
            >
              {t.content}
            </div>
            {t.chunks && t.chunks.length > 0 && (
              <details className="mt-2 text-xs text-gray-500">
                <summary className="cursor-pointer">
                  引用片段 ({t.chunks.length}) · top sim={t.chunks[0].similarity.toFixed(3)}
                </summary>
                <ul className="mt-1 space-y-1 pl-4">
                  {t.chunks.map((c) => (
                    <li key={c.source_id + c.similarity}>
                      [{c.similarity.toFixed(3)}] {c.title || c.source_id}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        ))}
        {loading && <p className="text-sm text-gray-400">检索 + 生成中...</p>}
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>

      <div className="mt-4 flex gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="向博主历史观点知识库提问..."
          rows={2}
          className="flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          disabled={loading}
        />
        <button
          type="button"
          onClick={send}
          disabled={loading || !input.trim()}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:bg-gray-300"
        >
          发送
        </button>
      </div>
    </div>
  );
}
