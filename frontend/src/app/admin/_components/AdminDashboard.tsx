'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import type { DashboardData, UserRecord } from '../page';

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

type Category = 'all' | 'paid' | 'active_trial' | 'expiring_soon' | 'trial_expired' | 'never_trialed';
type SortKey = 'email' | 'conversations' | 'messages' | 'feedback_count' | 'api_calls' | 'last_active_at' | 'created_at';
type EngagementFilter = 'all' | 'has_conversations' | 'has_feedback' | 'has_api_calls' | 'no_activity';
type OpsFilter = 'all' | 'pending' | 'reached' | 'following' | 'feedback_received' | 'active' | 'churned';

const OPS_STATUS_CONFIG: Record<string, { label: string; style: string; filterKey: OpsFilter }> = {
  '待联系': { label: '待联系', style: 'bg-gray-100 text-gray-600', filterKey: 'pending' },
  '已联系': { label: '已联系', style: 'bg-blue-100 text-blue-700', filterKey: 'reached' },
  '跟进中': { label: '跟进中', style: 'bg-amber-100 text-amber-700', filterKey: 'following' },
  '已反馈': { label: '已反馈', style: 'bg-purple-100 text-purple-700', filterKey: 'feedback_received' },
  '活跃':   { label: '活跃',   style: 'bg-emerald-100 text-emerald-700', filterKey: 'active' },
  '流失':   { label: '流失',   style: 'bg-red-100 text-red-700', filterKey: 'churned' },
};

const OPS_FILTER_OPTIONS: { value: OpsFilter; label: string }[] = [
  { value: 'all', label: '运营状态: 全部' },
  { value: 'pending', label: '待联系' },
  { value: 'reached', label: '已联系' },
  { value: 'following', label: '跟进中' },
  { value: 'feedback_received', label: '已反馈' },
  { value: 'active', label: '活跃' },
  { value: 'churned', label: '流失' },
];

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

const ENGAGEMENT_OPTIONS: { value: EngagementFilter; label: string }[] = [
  { value: 'all',               label: '不限' },
  { value: 'has_conversations', label: '有对话' },
  { value: 'has_feedback',      label: '有反馈' },
  { value: 'has_api_calls',     label: '有 API 调用' },
  { value: 'no_activity',       label: '零互动' },
];

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

export function AdminDashboard({ data }: { data: DashboardData }) {
  const [activeFilter, setActiveFilter] = useState<Category>('all');
  const [engagement, setEngagement] = useState<EngagementFilter>('all');
  const [opsFilter, setOpsFilter] = useState<OpsFilter>('all');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('last_active_at');
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState('');

  const filteredUsers = useMemo(() => {
    let list = data.users;

    // Category filter
    if (activeFilter !== 'all') {
      list = list.filter((u) => u.category === activeFilter);
    }

    // Engagement filter
    if (engagement === 'has_conversations') list = list.filter((u) => u.conversations > 0);
    else if (engagement === 'has_feedback') list = list.filter((u) => u.feedback_count > 0);
    else if (engagement === 'has_api_calls') list = list.filter((u) => u.api_calls > 0);
    else if (engagement === 'no_activity') list = list.filter((u) => !u.conversations && !u.feedback_count && !u.api_calls);

    // Ops status filter
    if (opsFilter !== 'all') {
      list = list.filter((u) => {
        const status = u.ops_status ?? '待联系';
        const cfg = OPS_STATUS_CONFIG[status];
        return cfg?.filterKey === opsFilter;
      });
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
  }, [data.users, activeFilter, engagement, opsFilter, search, sortKey, sortAsc]);

  const { summary } = data;

  // Engagement overview numbers
  const engagementStats = useMemo(() => {
    const users = data.users;
    return {
      withConversations: users.filter((u) => u.conversations > 0).length,
      withFeedback: users.filter((u) => u.feedback_count > 0).length,
      totalConversations: users.reduce((sum, u) => sum + u.conversations, 0),
      totalMessages: users.reduce((sum, u) => sum + u.messages, 0),
    };
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
            共 {summary.total} 位用户 · {engagementStats.withConversations} 人有对话 · {engagementStats.totalMessages} 条消息
          </p>
        </div>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {cards.map(({ key, count }) => {
          const cfg = CATEGORY_CONFIG[key];
          const isActive = activeFilter === key;
          return (
            <button
              key={key}
              onClick={() => setActiveFilter(key)}
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

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索邮箱、用户 ID..."
          className="w-full md:w-72 rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/50"
        />
        <select
          value={engagement}
          onChange={(e) => setEngagement(e.target.value as EngagementFilter)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
        >
          {ENGAGEMENT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <select
          value={opsFilter}
          onChange={(e) => setOpsFilter(e.target.value as OpsFilter)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
        >
          {OPS_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-muted-foreground">
            {filteredUsers.length} / {summary.total}
          </span>
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

      {/* Table */}
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <SortTh label="邮箱" field="email" current={sortKey} asc={sortAsc} onSort={handleSort} />
                <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">订阅</th>
                <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">运营</th>
                <SortTh label="对话" field="conversations" current={sortKey} asc={sortAsc} onSort={handleSort} />
                <SortTh label="消息" field="messages" current={sortKey} asc={sortAsc} onSort={handleSort} />
                <SortTh label="反馈" field="feedback_count" current={sortKey} asc={sortAsc} onSort={handleSort} />
                <SortTh label="API" field="api_calls" current={sortKey} asc={sortAsc} onSort={handleSort} />
                <SortTh label="最近活跃" field="last_active_at" current={sortKey} asc={sortAsc} onSort={handleSort} />
                <SortTh label="注册" field="created_at" current={sortKey} asc={sortAsc} onSort={handleSort} />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">暂无数据</td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <UserRowGroup
                    key={user.user_id}
                    user={user}
                    expanded={expandedUser === user.user_id}
                    onToggle={() => setExpandedUser(expandedUser === user.user_id ? null : user.user_id)}
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
  user, expanded, onToggle,
}: {
  user: UserRecord; expanded: boolean; onToggle: () => void;
}) {
  const badge = BADGE_STYLES[user.category] ?? 'bg-gray-100 text-gray-600';
  const label = CATEGORY_CONFIG[user.category as Category]?.label ?? user.category;

  return (
    <>
      <tr
        onClick={onToggle}
        className={`cursor-pointer transition-colors ${expanded ? 'bg-muted/40' : 'hover:bg-muted/20'}`}
      >
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
          <td colSpan={9} className="bg-muted/20 px-4 py-4 border-t border-border/50">
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
