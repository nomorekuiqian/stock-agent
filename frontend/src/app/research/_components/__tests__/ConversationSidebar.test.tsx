import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';

import type { ConversationSummary } from '@/lib/api';
import ConversationSidebar from '../ConversationSidebar';

const recentConversation: ConversationSummary = {
  id: 'recent',
  title: 'Recent item',
  message_count: 2,
  updated_at: '2026-06-10T20:00:00Z',
};

const olderConversation: ConversationSummary = {
  id: 'older',
  title: 'Older item',
  message_count: 4,
  updated_at: '2026-06-09T20:00:00Z',
};

function renderSidebar(
  conversations: ConversationSummary[],
  overrides: Partial<ComponentProps<typeof ConversationSidebar>> = {},
) {
  return render(
    <ConversationSidebar
      conversations={conversations}
      onLoad={vi.fn()}
      onDelete={vi.fn()}
      onNewChat={vi.fn()}
      {...overrides}
    />,
  );
}

function renderedTitles(): string[] {
  return screen
    .getAllByText(/Recent item|Older item/i)
    .map((element) => element.textContent ?? '');
}

describe('ConversationSidebar', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders pinned conversations before newer unpinned conversations', () => {
    renderSidebar([
      recentConversation,
      {
        ...olderConversation,
        is_pinned: true,
        pinned_at: '2026-06-11T20:00:00Z',
      },
    ]);

    expect(renderedTitles()).toEqual(['Older item', 'Recent item']);
  });

  it('moves a conversation to the top immediately while pin is saving', async () => {
    let resolvePin!: () => void;
    const onTogglePin = vi.fn(() => new Promise<void>((resolve) => {
      resolvePin = resolve;
    }));

    renderSidebar([recentConversation, olderConversation], { onTogglePin });

    expect(renderedTitles()).toEqual(['Recent item', 'Older item']);

    fireEvent.click(screen.getByRole('button', { name: '置顶对话: Older item' }));

    expect(onTogglePin).toHaveBeenCalledWith('older', true);
    await waitFor(() => {
      expect(renderedTitles()).toEqual(['Older item', 'Recent item']);
    });

    await act(async () => {
      resolvePin();
    });
  });

  it('rolls back the immediate pin ordering when the save fails', async () => {
    let rejectPin!: (error: Error) => void;
    const onTogglePin = vi.fn(() => new Promise<void>((_resolve, reject) => {
      rejectPin = reject;
    }));

    renderSidebar([recentConversation, olderConversation], { onTogglePin });

    fireEvent.click(screen.getByRole('button', { name: '置顶对话: Older item' }));

    await waitFor(() => {
      expect(renderedTitles()).toEqual(['Older item', 'Recent item']);
    });

    await act(async () => {
      rejectPin(new Error('Runtime session not found'));
    });

    await waitFor(() => {
      expect(renderedTitles()).toEqual(['Recent item', 'Older item']);
    });
  });
});
