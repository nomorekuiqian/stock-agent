import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import ConversationSearchDialog from '../ConversationSearchDialog';
import type { ConversationSummary } from '@/lib/api';

const recentConversation: ConversationSummary = {
  id: 'recent-1',
  title: '6月10日 · 半导体复盘',
  message_count: 4,
  updated_at: '2026-06-10T20:00:00Z',
};

const searchConversation: ConversationSummary = {
  id: 'search-1',
  title: 'AI 算力链讨论',
  message_count: 8,
  updated_at: '2026-06-10T21:00:00Z',
  search_matches: [
    {
      type: 'message',
      role: 'user',
      label: '用户消息',
      snippet: '请帮我比较 NVDA 和 AMD 的估值差异',
    },
    {
      type: 'message',
      role: 'assistant',
      label: '助手回答',
      snippet: 'NVDA 的毛利率与 AI 数据中心需求仍然强于 AMD',
    },
  ],
};

describe('ConversationSearchDialog', () => {
  it('shows recent conversations before the user types', () => {
    render(
      <ConversationSearchDialog
        open
        onOpenChange={vi.fn()}
        query=""
        onQueryChange={vi.fn()}
        recentConversations={[recentConversation]}
        searchResults={[]}
        onLoad={vi.fn()}
      />,
    );

    expect(screen.getByText('最近对话')).toBeInTheDocument();
    expect(screen.getByText('6月10日 · 半导体复盘')).toBeInTheDocument();
    expect(screen.getByText('4 条消息')).toBeInTheDocument();
  });

  it('shows content search matches as conversation snippets', () => {
    render(
      <ConversationSearchDialog
        open
        onOpenChange={vi.fn()}
        query="NVDA AMD"
        onQueryChange={vi.fn()}
        recentConversations={[]}
        searchResults={[searchConversation]}
        onLoad={vi.fn()}
      />,
    );

    expect(screen.getByText('搜索结果')).toBeInTheDocument();
    expect(screen.getByText('你')).toBeInTheDocument();
    expect(screen.getByText('助手')).toBeInTheDocument();
    expect(screen.getAllByText('NVDA')).toHaveLength(2);
    expect(screen.getAllByText('AMD')).toHaveLength(2);
  });

  it('does not duplicate title-only matches below the row title', () => {
    render(
      <ConversationSearchDialog
        open
        onOpenChange={vi.fn()}
        query="Hi"
        onQueryChange={vi.fn()}
        recentConversations={[]}
        searchResults={[
          {
            ...recentConversation,
            title: 'Hi',
            search_matches: [{ type: 'title', label: '标题', snippet: 'Hi' }],
          },
        ]}
        onLoad={vi.fn()}
      />,
    );

    expect(screen.getAllByText('Hi')).toHaveLength(1);
    expect(screen.queryByText('标题')).not.toBeInTheDocument();
  });

  it('loads a selected conversation and closes the dialog', () => {
    const onLoad = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <ConversationSearchDialog
        open
        onOpenChange={onOpenChange}
        query=""
        onQueryChange={vi.fn()}
        recentConversations={[recentConversation]}
        searchResults={[]}
        onLoad={onLoad}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /6月10日 · 半导体复盘/i }));

    expect(onLoad).toHaveBeenCalledWith('recent-1');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
