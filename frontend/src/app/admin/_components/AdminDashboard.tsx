'use client';

import { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { getAccessTokenSync, getAccessTokenAsync } from '@/contexts/AuthContext';
import type { DashboardData, UserRecord } from '../page';

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

type Category = 'all' | 'paid' | 'active_trial' | 'expiring_soon' | 'trial_expired' | 'never_trialed';
type SortKey = 'email' | 'conversations' | 'messages' | 'feedback_count' | 'api_calls' | 'last_active_at' | 'created_at';

const OPS_STATUS_CONFIG: Record<string, { label: string; style: string }> = {
  '待联系': { label: '待联系', style: 'bg-gray-100 text-gray-600' },
  '已联系': { label: '已联系', style: 'bg-blue-100 text-blue-700' },
  '跟进中': { label: '跟进中', style: 'bg-amber-100 text-amber-700' },
  '已反馈': { label: '已反馈', style: 'bg-purple-100 text-purple-700' },
  '活跃':   { label: '活跃',   style: 'bg-emerald-100 text-emerald-700' },
  '流失':   { label: '流失',   style: 'bg-red-100 text-red-700' },
};

const CATEGORY_CONFIG: Record<Category, { label: string; color: string; bg: string }> = {
  all:            { label: '全部',   color: 'text-foreground',   bg: 'bg-muted' },
  active_trial:   { label: '试用中', color: 'text-blue-700',     bg: 'bg-blue-50' },
  expiring_soon:  { label: '快到期', color: 'text-amber-700',    bg: 'bg-amber-50' },
  trial_expired:  { label: '已到期', color: 'text-red-700',      bg: 'bg-red-50' },
  never_trialed:  { label: '未试用', color: 'text-gray-600',     bg: 'bg-gray-50' },
  paid:           { label: '已付费', color: 'text-emerald-700',  bg: 'bg-emerald-50' },
};

const BADGE_STYLES: Record<string, string> = {
  active_trial:  'bg-blue-100 text-blue-800',
  expiring_soon: 'bg-amber-100 text-amber-800',
  trial_expired: 'bg-red-100 text-red-700',
  never_trialed: 'bg-gray-100 text-gray-600',
  paid:          'bg-emerald-100 text-emerald-800',
};

// ---------------------------------------------------------------------------
// Filter chip definitions
// ---------------------------------------------------------------------------

interface FilterChip {
  tag: string;
  label: string;
  match: (u: UserRecord) => boolean;
}

interface FilterGroup {
  key: string;
  label: string;
  chips: FilterChip[];
}

const FILTER_GROUPS: FilterGroup[] = [
  {
    key: 'mail',
    label: '邮件',
    chips: [
      { tag: 'm:digest',   label: '订阅专属日报', match: (u) => !!u.personal_digest_subscribed },
      { tag: 'm:no_digest', label: '未订阅专属',  match: (u) => !u.personal_digest_subscribed },
      { tag: 'm:morning',  label: 'Pro 早报权限', match: (u) => (u.entitlements ?? []).includes('morning_report_email') },
      { tag: 'm:weekly',   label: 'Pro 周报权限', match: (u) => (u.entitlements ?? []).includes('weekly_report_email') },
    ],
  },
  {
    key: 'engagement',
    label: '互动',
    chips: [
      { tag: 'e:conv',     label: '有对话',     match: (u) => u.conversations > 0 },
      { tag: 'e:email_fb', label: '有邮件反馈', match: (u) => u.feedback_count > 0 },
      { tag: 'e:api',      label: '有API',      match: (u) => u.api_calls > 0 },
      { tag: 'e:none',     label: '零互动',     match: (u) => !u.conversations && !u.feedback_count && !u.api_calls },
    ],
  },
  {
    key: 'feedback',
    label: '反馈',
    chips: [
      { tag: 'f:quest',   label: '有问卷',     match: (u) => u.has_questionnaire },
      { tag: 'f:contact',  label: '有联系反馈', match: (u) => u.contact_feedback_count > 0 },
    ],
  },
  {
    key: 'ops',
    label: '运营',
    chips: [
      { tag: 'o:待联系', label: '待联系', match: (u) => (u.ops_status ?? '待联系') === '待联系' },
      { tag: 'o:已联系', label: '已联系', match: (u) => u.ops_status === '已联系' },
      { tag: 'o:跟进中', label: '跟进中', match: (u) => u.ops_status === '跟进中' },
      { tag: 'o:已反馈', label: '已反馈', match: (u) => u.ops_status === '已反馈' },
      { tag: 'o:活跃',   label: '活跃',   match: (u) => u.ops_status === '活跃' },
      { tag: 'o:流失',   label: '流失',   match: (u) => u.ops_status === '流失' },
    ],
  },
];

// Build a flat lookup for quick access
const CHIP_LOOKUP = new Map<string, FilterChip>();
for (const group of FILTER_GROUPS) {
  for (const chip of group.chips) {
    CHIP_LOOKUP.set(chip.tag, chip);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string | null): string {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleDateString('zh-CN', {
      month: '2-digit', day: '2-digit', year: 'numeric',
    });
  } catch { return '-'; }
}

function timeAgo(iso: string | null): string {
  if (!iso) return '从未';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return formatDate(iso);
}

function daysUntil(iso: string | null): string {
  if (!iso) return '';
  const diff = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
  if (diff < 0) return `${Math.abs(diff)} 天前到期`;
  if (diff === 0) return '今天到期';
  return `${diff} 天后`;
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api';

const OPS_STATUSES = ['待联系', '已联系', '跟进中', '已反馈', '活跃', '流失'] as const;

export function AdminDashboard({ data: initialData }: { data: DashboardData }) {
  const [data, setData] = useState(initialData);
  const [activeCategory, setActiveCategory] = useState<Category>('all');
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('last_active_at');
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState('');
  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkSaving, setBulkSaving] = useState(false);

  const toggleTag = useCallback((tag: string) => {
    setActiveTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) {
        next.delete(tag);
      } else {
        next.add(tag);
      }
      return next;
    });
  }, []);

  const clearFilters = useCallback(() => {
    setActiveCategory('all');
    setActiveTags(new Set());
    setSearch('');
  }, []);

  const toggleSelect = useCallback((userId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback((userIds: string[]) => {
    setSelectedIds((prev) => {
      const allSelected = userIds.every((id) => prev.has(id));
      if (allSelected) return new Set();
      return new Set(userIds);
    });
  }, []);

  const bulkUpdateStatus = useCallback(async (status: string) => {
    if (selectedIds.size === 0) return;
    const token = getAccessTokenSync() ?? await getAccessTokenAsync();
    if (!token) return;
    setBulkSaving(true);
    try {
      const res = await fetch(`${API_BASE}/admin/crm/profiles/bulk`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_ids: [...selectedIds], ops_status: status }),
      });
      if (res.ok) {
        setData((prev) => ({
          ...prev,
          users: prev.users.map((u) =>
            selectedIds.has(u.user_id) ? { ...u, ops_status: status } : u,
          ),
        }));
        setSelectedIds(new Set());
      }
    } finally {
      setBulkSaving(false);
    }
  }, [selectedIds]);

  const hasActiveFilters = activeCategory !== 'all' || activeTags.size > 0 || search.trim().length > 0;

  const filteredUsers = useMemo(() => {
    let list = data.users;

    // Category filter (from top cards)
    if (activeCategory !== 'all') {
      list = list.filter((u) => u.category === activeCategory);
    }

    // Chip-based filters: group active tags by prefix, OR within group, AND across groups
    if (activeTags.size > 0) {
      const grouped: Record<string, FilterChip[]> = {};
      for (const tag of activeTags) {
        const prefix = tag.split(':')[0];
        const chip = CHIP_LOOKUP.get(tag);
        if (chip) {
          if (!grouped[prefix]) grouped[prefix] = [];
          grouped[prefix].push(chip);
        }
      }

      for (const chips of Object.values(grouped)) {
        list = list.filter((u) => chips.some((chip) => chip.match(u)));
      }
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (u) =>
          u.email?.toLowerCase().includes(q) ||
          u.name?.toLowerCase().includes(q) ||
          u.user_id.toLowerCase().includes(q) ||
          u.invite_code?.toLowerCase().includes(q)
      );
    }

    // Sort
    list = [...list].sort((a, b) => {
      let va: string | number | null;
      let vb: string | number | null;

      if (sortKey === 'email') {
        va = a.email ?? ''; vb = b.email ?? '';
      } else if (sortKey === 'last_active_at' || sortKey === 'created_at') {
        va = a[sortKey] ?? ''; vb = b[sortKey] ?? '';
      } else {
        va = a[sortKey] ?? 0; vb = b[sortKey] ?? 0;
      }

      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });

    return list;
  }, [data.users, activeCategory, activeTags, search, sortKey, sortAsc]);

  const { summary } = data;

  const engagementStats = useMemo(() => {
    const users = data.users;
    return {
      withConversations: users.filter((u) => u.conversations > 0).length,
      withFeedback: users.filter((u) => u.feedback_count > 0).length,
      totalConversations: users.reduce((sum, u) => sum + u.conversations, 0),
      totalMessages: users.reduce((sum, u) => sum + u.messages, 0),
      personalDigestSubscribers: users.filter((u) => u.personal_digest_subscribed).length,
    };
  }, [data.users]);

  // Per-chip count over the full user set, recomputed when users change.
  const chipCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const group of FILTER_GROUPS) {
      for (const chip of group.chips) {
        counts.set(chip.tag, data.users.filter(chip.match).length);
      }
    }
    return counts;
  }, [data.users]);

  const cards: { key: Category; count: number }[] = [
    { key: 'all', count: summary.total },
    { key: 'active_trial', count: summary.active_trial },
    { key: 'expiring_soon', count: summary.expiring_soon },
    { key: 'trial_expired', count: summary.trial_expired },
    { key: 'never_trialed', count: summary.never_trialed },
    { key: 'paid', count: summary.paid },
  ];

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">用户管理看板</h1>
          <p className="text-sm text-muted-foreground mt-1">
            共 {summary.total} 位用户 · {engagementStats.withConversations} 人有对话 · {engagementStats.totalMessages} 条消息 · {engagementStats.personalDigestSubscribers} 人订阅专属日报
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/admin/llm-usage"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
          >
            LLM 用量 →
          </Link>
          <Link
            href="/admin/flags"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
          >
            灰度管理 →
          </Link>
        </div>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {cards.map(({ key, count }) => {
          const cfg = CATEGORY_CONFIG[key];
          const isActive = activeCategory === key;
          return (
            <button
              key={key}
              onClick={() => setActiveCategory(activeCategory === key ? 'all' : key)}
              className={`rounded-lg px-3 py-3 text-left transition-all border ${
                isActive ? 'border-foreground/20 shadow-sm' : 'border-transparent hover:border-border'
              } ${cfg.bg}`}
            >
              <div className={`text-2xl font-semibold tabular-nums ${cfg.color}`}>{count}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{cfg.label}</div>
            </button>
          );
        })}
      </div>

      {/* Search + actions */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索邮箱、用户 ID、邀请码..."
          className="w-full md:w-72 rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/50"
        />
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-muted-foreground tabular-nums">
            {filteredUsers.length} / {summary.total}
          </span>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              清除筛选
            </button>
          )}
          <button
            onClick={() => {
              const emails = filteredUsers
                .map((u) => u.email)
                .filter(Boolean)
                .join(', ');
              navigator.clipboard.writeText(emails).then(() => {
                setCopyFeedback(`${filteredUsers.filter((u) => u.email).length} 个邮箱已复制`);
                setTimeout(() => setCopyFeedback(''), 2000);
              });
            }}
            className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
          >
            {copyFeedback || '复制邮箱'}
          </button>
        </div>
      </div>

      {/* Chip filters */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {FILTER_GROUPS.map((group) => (
          <div key={group.key} className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground/60 font-medium mr-0.5 select-none">
              {group.label}
            </span>
            {group.chips.map((chip) => {
              const isActive = activeTags.has(chip.tag);
              const count = chipCounts.get(chip.tag) ?? 0;
              return (
                <button
                  key={chip.tag}
                  onClick={() => toggleTag(chip.tag)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-all border ${
                    isActive
                      ? 'border-foreground/20 bg-foreground text-background shadow-sm'
                      : 'border-border bg-background text-muted-foreground hover:border-foreground/20 hover:text-foreground'
                  }`}
                >
                  {chip.label}
                  <span className={`ml-1 tabular-nums ${
                    isActive ? 'text-background/70' : 'text-muted-foreground/60'
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-2.5">
          <span className="text-sm font-medium">
            已选 <span className="tabular-nums">{selectedIds.size}</span> 人
          </span>
          <div className="h-4 w-px bg-border" />
          <span className="text-xs text-muted-foreground">设为</span>
          {OPS_STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => bulkUpdateStatus(s)}
              disabled={bulkSaving}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors disabled:opacity-50 ${
                OPS_STATUS_CONFIG[s]?.style ?? 'bg-muted text-muted-foreground'
              } border-transparent hover:border-current`}
            >
              {s}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            {bulkSaving && <span className="text-xs text-muted-foreground">保存中...</span>}
            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              取消选择
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="w-10 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={filteredUsers.length > 0 && filteredUsers.every((u) => selectedIds.has(u.user_id))}
                    onChange={() => toggleSelectAll(filteredUsers.map((u) => u.user_id))}
                    className="rounded border-border accent-emerald-600"
                  />
                </th>
                <SortTh label="邮箱" field="email" current={sortKey} asc={sortAsc} onSort={handleSort} />
                <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">订阅</th>
                <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">邮件</th>
                <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">运营</th>
                <SortTh label="对话" field="conversations" current={sortKey} asc={sortAsc} onSort={handleSort} />
                <SortTh label="消息" field="messages" current={sortKey} asc={sortAsc} onSort={handleSort} />
                <SortTh label="邮件反馈" field="feedback_count" current={sortKey} asc={sortAsc} onSort={handleSort} />
                <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">用户反馈</th>
                <SortTh label="API" field="api_calls" current={sortKey} asc={sortAsc} onSort={handleSort} />
                <SortTh label="最近活跃" field="last_active_at" current={sortKey} asc={sortAsc} onSort={handleSort} />
                <SortTh label="注册" field="created_at" current={sortKey} asc={sortAsc} onSort={handleSort} />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-4 py-8 text-center text-muted-foreground">暂无数据</td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <UserRowGroup
                    key={user.user_id}
                    user={user}
                    expanded={expandedUser === user.user_id}
                    onToggle={() => setExpandedUser(expandedUser === user.user_id ? null : user.user_id)}
                    selected={selectedIds.has(user.user_id)}
                    onSelect={() => toggleSelect(user.user_id)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sortable table header
// ---------------------------------------------------------------------------

function SortTh({
  label, field, current, asc, onSort,
}: {
  label: string; field: SortKey; current: SortKey; asc: boolean;
  onSort: (k: SortKey) => void;
}) {
  const active = current === field;
  return (
    <th
      onClick={() => onSort(field)}
      className="text-left px-3 py-2.5 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors whitespace-nowrap"
    >
      {label}
      {active && <span className="ml-0.5 text-[10px]">{asc ? 'ASC' : 'DESC'}</span>}
    </th>
  );
}

// ---------------------------------------------------------------------------
// User row + expandable detail
// ---------------------------------------------------------------------------

function UserRowGroup({
  user, expanded, onToggle, selected, onSelect,
}: {
  user: UserRecord; expanded: boolean; onToggle: () => void;
  selected: boolean; onSelect: () => void;
}) {
  const badge = BADGE_STYLES[user.category] ?? 'bg-gray-100 text-gray-600';
  const label = CATEGORY_CONFIG[user.category as Category]?.label ?? user.category;

  return (
    <>
      <tr
        onClick={onToggle}
        className={`cursor-pointer transition-colors ${expanded ? 'bg-muted/40' : 'hover:bg-muted/20'}`}
      >
        <td className="w-10 px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={selected}
            onChange={onSelect}
            className="rounded border-border accent-emerald-600"
          />
        </td>
        <td className="px-3 py-2.5">
          {user.name && <div className="text-xs font-medium">{user.name}</div>}
          <span className="font-mono text-xs text-muted-foreground">{user.email ?? user.user_id.slice(0, 12)}</span>
        </td>
        <td className="px-3 py-2.5">
          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${badge}`}>
            {label}
          </span>
        </td>
        <td className="px-3 py-2.5">
          <EmailBadges user={user} />
        </td>
        <td className="px-3 py-2.5">
          <OpsStatusBadge status={user.ops_status} />
        </td>
        <td className="px-3 py-2.5 tabular-nums">
          <NumCell value={user.conversations} />
        </td>
        <td className="px-3 py-2.5 tabular-nums">
          <NumCell value={user.messages} />
        </td>
        <td className="px-3 py-2.5 tabular-nums">
          <NumCell value={user.feedback_count} />
        </td>
        <td className="px-3 py-2.5">
          <UserFeedbackBadges user={user} />
        </td>
        <td className="px-3 py-2.5 tabular-nums">
          <NumCell value={user.api_calls} />
        </td>
        <td className="px-3 py-2.5">
          <span className="text-xs text-muted-foreground">{timeAgo(user.last_active_at)}</span>
        </td>
        <td className="px-3 py-2.5">
          <span className="text-xs text-muted-foreground">{formatDate(user.created_at)}</span>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={12} className="bg-muted/20 px-4 py-4 border-t border-border/50">
            <UserDetail user={user} />
          </td>
        </tr>
      )}
    </>
  );
}

function OpsStatusBadge({ status }: { status: string | null }) {
  const s = status ?? '待联系';
  const cfg = OPS_STATUS_CONFIG[s];
  if (!cfg) return <span className="text-xs text-muted-foreground/40">-</span>;
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cfg.style}`}>
      {cfg.label}
    </span>
  );
}

function NumCell({ value }: { value: number }) {
  if (!value) return <span className="text-xs text-muted-foreground/40">0</span>;
  return <span className="text-xs font-medium">{value}</span>;
}

function EmailPill({ active, char, title }: { active: boolean; char: string; title: string }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold ${
        active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-300'
      }`}
    >
      {char}
    </span>
  );
}

function EmailBadges({ user }: { user: UserRecord }) {
  const ents = user.entitlements ?? [];
  const hasMorning = ents.includes('morning_report_email');
  const hasWeekly = ents.includes('weekly_report_email');
  const digestSubscribed = !!user.personal_digest_subscribed;
  const digestCount = user.personal_digest_count_30d ?? 0;

  const digestTitle = digestSubscribed
    ? `已订阅专属日报${digestCount > 0 ? ` · 近 30 天 ${digestCount} 期` : ''}`
    : '未订阅专属日报';

  return (
    <div className="flex items-center gap-1">
      <EmailPill active={hasMorning} char="早" title={`早报 entitlement · ${hasMorning ? '有' : '无'}`} />
      <EmailPill active={hasWeekly}  char="周" title={`周报 entitlement · ${hasWeekly ? '有' : '无'}`} />
      <EmailPill active={digestSubscribed} char="专" title={digestTitle} />
    </div>
  );
}

const CONTACT_RATING_LABEL: Record<string, { text: string; style: string }> = {
  helpful:     { text: '好评', style: 'bg-emerald-50 text-emerald-700' },
  neutral:     { text: '一般', style: 'bg-gray-100 text-gray-600' },
  not_helpful: { text: '差评', style: 'bg-red-50 text-red-700' },
};

function UserFeedbackBadges({ user }: { user: UserRecord }) {
  const hasFb = user.contact_feedback_count > 0;
  const hasQ = user.has_questionnaire;

  if (!hasFb && !hasQ) {
    return <span className="text-xs text-muted-foreground/40">-</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {hasQ && (
        <span className="inline-block rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-blue-50 text-blue-700">
          {user.questionnaire_background || '问卷'}
        </span>
      )}
      {hasFb && (
        <span className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
          CONTACT_RATING_LABEL[user.contact_feedback_rating ?? '']?.style ?? 'bg-purple-50 text-purple-700'
        }`}>
          {CONTACT_RATING_LABEL[user.contact_feedback_rating ?? '']?.text ?? '反馈'}{user.contact_feedback_count > 1 ? ` x${user.contact_feedback_count}` : ''}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Expanded user detail panel
// ---------------------------------------------------------------------------

function UserDetail({ user }: { user: UserRecord }) {
  const sections = [
    { title: '订阅信息', items: [
      { label: '计划', value: user.plan?.toUpperCase() ?? '无' },
      { label: '状态', value: user.status ?? '无记录' },
      { label: '试用到期', value: user.access_expires_at ? `${formatDate(user.access_expires_at)} (${daysUntil(user.access_expires_at)})` : '-' },
      { label: '邀请码', value: user.invite_code ?? '-' },
      { label: 'Stripe ID', value: user.stripe_customer_id ?? '-' },
    ]},
    { title: 'Agent 对话', items: [
      { label: '对话数', value: String(user.conversations) },
      { label: '总消息数', value: String(user.messages) },
      { label: '最后对话', value: timeAgo(user.last_conversation_at) },
    ]},
    { title: '互动记录', items: [
      { label: '邮件反馈', value: String(user.feedback_count) },
      { label: 'API 调用', value: String(user.api_calls) },
      { label: '最后活跃', value: timeAgo(user.last_active_at) },
      { label: '注册时间', value: formatDate(user.auth_created_at) },
    ]},
  ];

  const entitlements = user.entitlements ?? [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {sections.map((sec) => (
          <div key={sec.title} className="space-y-1.5">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{sec.title}</h4>
            {sec.items.map((item) => (
              <div key={item.label} className="flex justify-between text-xs">
                <span className="text-muted-foreground">{item.label}</span>
                <span className="font-mono">{item.value}</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Entitlements */}
      {entitlements.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">功能权限</h4>
          <div className="flex flex-wrap gap-1.5">
            {entitlements.map((e) => (
              <span key={e} className="bg-muted rounded px-1.5 py-0.5 text-[11px] font-mono text-muted-foreground">
                {e}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* API usage breakdown */}
      {user.api_calls > 0 && Object.keys(user.api_by_type).length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">API 使用分布</h4>
          <div className="flex flex-wrap gap-2">
            {Object.entries(user.api_by_type)
              .sort(([, a], [, b]) => b - a)
              .map(([type, count]) => (
                <span key={type} className="bg-blue-50 text-blue-800 rounded px-2 py-0.5 text-[11px] font-mono">
                  {type}: {count}
                </span>
              ))}
          </div>
        </div>
      )}

      <div className="pt-2 flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground/40 font-mono">
          ID: {user.user_id}
        </span>
        <Link
          href={`/admin/users/${user.user_id}`}
          className="text-xs font-medium text-emerald-600 hover:text-emerald-700 transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          运营笔记 &rarr;
        </Link>
      </div>
    </div>
  );
}
