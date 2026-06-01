'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

import type { KolCockpitTopicNode } from '@/lib/api';

interface Props {
  tree: KolCockpitTopicNode[];
  total: number;
  value: string | null;
  onChange: (key: string | null) => void;
}

export default function TopicTree({ tree, total, value, onChange }: Props) {
  return (
    <nav aria-label="主题筛选" className="space-y-1">
      <TopicRow
        label="全部"
        count={total}
        active={value == null}
        onClick={() => onChange(null)}
      />
      {tree.map((node) =>
        node.children && node.children.length > 0 ? (
          <TopicGroup key={node.key} node={node} value={value} onChange={onChange} />
        ) : (
          <TopicRow
            key={node.key}
            label={node.label}
            count={node.count}
            active={value === node.key}
            disabled={node.count === 0}
            onClick={() => onChange(value === node.key ? null : node.key)}
          />
        ),
      )}
    </nav>
  );
}

function TopicGroup({
  node,
  value,
  onChange,
}: {
  node: KolCockpitTopicNode;
  value: string | null;
  onChange: (key: string | null) => void;
}) {
  const childActive = value === node.key || (node.children ?? []).some((c) => c.key === value);
  const [open, setOpen] = useState(childActive);
  const isExpanded = open || childActive;

  return (
    <div>
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          aria-label={isExpanded ? '收起' : '展开'}
          onClick={() => setOpen((v) => !v)}
          className="grid h-8 w-6 place-items-center rounded text-muted-foreground transition hover:bg-card/40 hover:text-foreground"
        >
          {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        <TopicRow
          label={node.label}
          count={node.count}
          active={value === node.key}
          disabled={node.count === 0}
          onClick={() => onChange(value === node.key ? null : node.key)}
          flex
        />
      </div>
      {isExpanded ? (
        <div className="ml-6 mt-1 space-y-0.5 border-l border-border/40 pl-2">
          {node.children?.map((child) => (
            <TopicRow
              key={child.key}
              label={child.label}
              count={child.count}
              active={value === child.key}
              disabled={child.count === 0}
              onClick={() => onChange(value === child.key ? null : child.key)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TopicRow({
  label,
  count,
  active,
  disabled,
  onClick,
  flex,
}: {
  label: string;
  count: number;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  flex?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`group flex h-8 items-center justify-between gap-2 rounded px-2 text-sm transition ${
        flex ? 'flex-1' : 'w-full'
      } ${
        active
          ? 'bg-primary/10 text-primary'
          : disabled
            ? 'text-muted-foreground/40 cursor-not-allowed'
            : 'text-muted-foreground hover:bg-card/40 hover:text-foreground'
      }`}
    >
      <span className="truncate font-medium">{label}</span>
      <span
        className={`font-data text-[11px] tabular-nums ${
          active ? 'text-primary/80' : 'text-muted-foreground/70 group-hover:text-muted-foreground'
        }`}
      >
        {count}
      </span>
    </button>
  );
}
