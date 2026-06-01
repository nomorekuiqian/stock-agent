import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

import TopicTree from '../TopicTree';
import type { KolCockpitTopicNode } from '@/lib/api';

const TREE: KolCockpitTopicNode[] = [
  {
    key: 'industry',
    label: '产业板块',
    count: 674,
    children: [
      { key: 'industry/ai_infra', label: 'AI 基建', count: 420 },
      { key: 'industry/optical', label: '光通信', count: 48 },
    ],
  },
  { key: 'macro', label: '宏观', count: 1564 },
  { key: 'rules', label: '美股规律', count: 50 },
];

afterEach(() => cleanup());

describe('TopicTree', () => {
  it('renders the "全部" row plus every top-level node with counts', () => {
    render(<TopicTree tree={TREE} total={2288} value={null} onChange={vi.fn()} />);
    expect(screen.getByText('全部')).toBeInTheDocument();
    expect(screen.getByText('2288')).toBeInTheDocument();
    expect(screen.getByText('产业板块')).toBeInTheDocument();
    expect(screen.getByText('宏观')).toBeInTheDocument();
    expect(screen.getByText('美股规律')).toBeInTheDocument();
  });

  it('children are hidden until parent is expanded', () => {
    render(<TopicTree tree={TREE} total={2288} value={null} onChange={vi.fn()} />);
    expect(screen.queryByText('AI 基建')).not.toBeInTheDocument();
  });

  it('clicking the chevron expands the parent and reveals children', () => {
    render(<TopicTree tree={TREE} total={2288} value={null} onChange={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('展开'));
    expect(screen.getByText('AI 基建')).toBeInTheDocument();
    expect(screen.getByText('光通信')).toBeInTheDocument();
  });

  it('clicking a leaf node calls onChange with its key', () => {
    const onChange = vi.fn();
    render(<TopicTree tree={TREE} total={2288} value={null} onChange={onChange} />);
    fireEvent.click(screen.getByText('宏观'));
    expect(onChange).toHaveBeenCalledWith('macro');
  });

  it('clicking the currently-selected leaf again clears the filter (toggle to null)', () => {
    const onChange = vi.fn();
    render(<TopicTree tree={TREE} total={2288} value="macro" onChange={onChange} />);
    fireEvent.click(screen.getByText('宏观'));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('clicking "全部" calls onChange(null)', () => {
    const onChange = vi.fn();
    render(<TopicTree tree={TREE} total={2288} value="macro" onChange={onChange} />);
    fireEvent.click(screen.getByText('全部'));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('auto-expands the industry group when a child is selected (childActive)', () => {
    render(<TopicTree tree={TREE} total={2288} value="industry/ai_infra" onChange={vi.fn()} />);
    // Without clicking the chevron, the child leaf should be visible because
    // childActive opens the group.
    expect(screen.getByText('AI 基建')).toBeInTheDocument();
  });

  it('disables and does not call onChange for nodes with count=0', () => {
    const empty: KolCockpitTopicNode[] = [{ key: 'rules', label: '美股规律', count: 0 }];
    const onChange = vi.fn();
    render(<TopicTree tree={empty} total={0} value={null} onChange={onChange} />);
    fireEvent.click(screen.getByText('美股规律'));
    expect(onChange).not.toHaveBeenCalled();
  });
});
