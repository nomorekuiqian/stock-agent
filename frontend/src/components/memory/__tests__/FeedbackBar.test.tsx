import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FeedbackBar } from '../FeedbackBar';
import { TooltipProvider } from '@/components/ui/tooltip';

const mutateAsync = vi.fn();

vi.mock('@/hooks/queries/use-feedback', () => ({
  useSubmitFeedback: () => ({
    mutateAsync,
  }),
}));

describe('FeedbackBar', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    mutateAsync.mockReset();
    mutateAsync.mockResolvedValue({ success: true, id: 'feedback-1' });
  });

  it('keeps the prompt visible after selecting feedback', async () => {
    render(
      <TooltipProvider>
        <FeedbackBar
          targetType="research_agent_answer"
          targetId="research:session:message"
          variant="agent"
        />
      </TooltipProvider>,
    );

    expect(screen.getByText('这条有帮助吗？')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '标记为有帮助' }));

    expect(screen.getByText('这条有帮助吗？')).toBeInTheDocument();
    expect(screen.queryByText('已记录，会用来校准后续回答')).not.toBeInTheDocument();
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ sentiment: 1 }),
    ));
  });

  it('submits agent runtime identity fields and trims snapshot text', async () => {
    render(
      <TooltipProvider>
        <FeedbackBar
          targetType="research_agent_answer"
          targetId="research:session-1:message-1"
          variant="agent"
          agentId="kol_research_agent"
          sessionId="session-1"
          turnId="turn-1"
          clientEventId="turn-1:assistant_message"
          messageEventId="event-1"
          snapshot={{ text: 'x'.repeat(600), persona_username: 'qinbafrank' }}
        />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: '标记为有帮助' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({
      target_type: 'research_agent_answer',
      target_id: 'research:session-1:message-1',
      sentiment: 1,
      snapshot: {
        text: 'x'.repeat(500),
        persona_username: 'qinbafrank',
      },
      agent_id: 'kol_research_agent',
      session_id: 'session-1',
      turn_id: 'turn-1',
      client_event_id: 'turn-1:assistant_message',
      message_event_id: 'event-1',
    }));
  });

  it('lets users clear and override an existing choice', async () => {
    render(
      <TooltipProvider>
        <FeedbackBar
          targetType="research_agent_answer"
          targetId="research:session:message"
          variant="agent"
          initialSentiment={1}
        />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: '取消有帮助反馈' }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ sentiment: 0 }),
    ));

    fireEvent.click(screen.getByRole('button', { name: '标记为需改善' }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ sentiment: -1 }),
    ));

    expect(screen.getByRole('button', { name: '取消需改善反馈' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
