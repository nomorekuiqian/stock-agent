import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import MobileTabSwitch from '../MobileTabSwitch';

describe('MobileTabSwitch', () => {
  afterEach(() => {
    cleanup();
  });

  it('opens history drawer from the icon button when provided', () => {
    const onHistoryOpen = vi.fn();
    render(
      <MobileTabSwitch
        activeTab="chat"
        onTabChange={vi.fn()}
        onHistoryOpen={onHistoryOpen}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '打开历史对话' }));

    expect(onHistoryOpen).toHaveBeenCalledTimes(1);
  });

  it('omits the history button when no handler is provided', () => {
    render(<MobileTabSwitch activeTab="chat" onTabChange={vi.fn()} />);

    expect(screen.queryByRole('button', { name: '打开历史对话' })).not.toBeInTheDocument();
  });

  it('switches between chat and workspace tabs', () => {
    const onTabChange = vi.fn();
    render(<MobileTabSwitch activeTab="chat" onTabChange={onTabChange} />);

    fireEvent.click(screen.getByRole('button', { name: '工作区' }));

    expect(onTabChange).toHaveBeenCalledWith('results');
  });
});
