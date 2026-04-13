'use client';

import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  type ChatModelAdapter,
  type ChatModelRunResult,
} from '@assistant-ui/react';
import { Thread } from '@/components/assistant-ui/thread';
import { getAccessTokenAsync } from '@/contexts/AuthContext';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

/**
 * Spike: assistant-ui integration with our FastAPI SSE backend.
 *
 * Tests:
 * 1. Can we stream responses from /api/research/chat/stream?
 * 2. Does the Thread component render messages correctly?
 * 3. Does markdown rendering work?
 * 4. Can we show tool call status?
 */

function ResearchV2Content() {
  const adapter: ChatModelAdapter = {
    async *run({ messages, abortSignal }): AsyncGenerator<ChatModelRunResult> {
      const token = await getAccessTokenAsync();
      if (!token) {
        yield { content: [{ type: 'text' as const, text: '请先登录后使用 AI 助手' }] };
        return;
      }

      // Build history from assistant-ui message format
      const history = messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content
            .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
            .map(c => c.text)
            .join(''),
        }));

      const lastUserMessage = history.filter(h => h.role === 'user').pop();
      if (!lastUserMessage) return;

      const response = await fetch(`${API_BASE_URL}/research/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: lastUserMessage.content,
          history,
        }),
        signal: abortSignal,
      });

      if (!response.ok) {
        yield { content: [{ type: 'text' as const, text: 'AI 助手暂时无法响应，请稍后再试' }] };
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;

          try {
            const event = JSON.parse(jsonStr);

            if (event.type === 'tool_call_start') {
              yield {
                content: [{ type: 'text' as const, text: '' }],
                status: { type: 'running' as const },
              };
            } else if (event.type === 'done' && event.result) {
              yield {
                content: [{ type: 'text' as const, text: event.result.message || '' }],
                status: { type: 'complete' as const, reason: 'stop' as const },
              };
            } else if (event.type === 'error') {
              yield {
                content: [{ type: 'text' as const, text: event.message || 'AI 助手出了点问题' }],
                status: { type: 'complete' as const, reason: 'unknown' as const },
              };
            }
          } catch {
            // skip malformed JSON
          }
        }
      }
    },
  };

  const runtime = useLocalRuntime(adapter);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="fixed inset-x-0 top-16 bottom-0 bg-background">
        <Thread />
      </div>
    </AssistantRuntimeProvider>
  );
}

export default function ResearchV2Page() {
  return <ResearchV2Content />;
}
