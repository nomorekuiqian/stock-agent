'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { getAccessTokenSync, getAccessTokenAsync } from '@/contexts/AuthContext';
import type {
  UserDetailData,
  UserProfile,
  Interaction,
  ContactFeedback,
  Questionnaire,
  EmailSubscriptions,
  PersonalDigestSummary,
  ConversationSummary,
  ConversationFull,
  ConversationMessage,
  Watchlist,
  PortfolioRow,
} from '../page';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OPS_STATUSES = ['待联系', '已联系', '跟进中', '已反馈', '活跃', '流失'] as const;
const PRIORITIES = [
  { value: 'high', label: '高', color: 'text-red-700 bg-red-50' },
  { value: 'mid', label: '中', color: 'text-amber-700 bg-amber-50' },
  { value: 'low', label: '低', color: 'text-gray-600 bg-gray-50' },
] as const;
const INTERACTION_TYPES = ['微信', '电话', '邮件', '面聊'] as const;
const SENTIMENTS = [
  { value: 'positive', label: '积极', color: 'text-emerald-700' },
  { value: 'neutral', label: '中性', color: 'text-gray-600' },
  { value: 'negative', label: '消极', color: 'text-red-700' },
] as const;
const CHANNELS = ['微信群', '小红书', '朋友介绍', 'ProductHunt', '其他'] as const;

const STATUS_COLORS: Record<string, string> = {
  '待联系': 'bg-gray-100 text-gray-700',
  '已联系': 'bg-blue-100 text-blue-700',
  '跟进中': 'bg-amber-100 text-amber-700',
  '已反馈': 'bg-purple-100 text-purple-700',
  '活跃': 'bg-emerald-100 text-emerald-700',
  '流失': 'bg-red-100 text-red-700',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleDateString('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit',
    });
  } catch { return '-'; }
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return '-'; }
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function crmFetch(
  path: string,
  options?: RequestInit,
) {
  const token = getAccessTokenSync() ?? await getAccessTokenAsync();
  const res = await fetch(`${API_BASE}/admin/crm${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  return res.json();
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function UserDetail({
  data: initialData,
}: {
  data: UserDetailData;
}) {
  const [data, setData] = useState(initialData);
  const [saving, setSaving] = useState(false);
  const [showDetailedForm, setShowDetailedForm] = useState(false);
  const [showGrantModal, setShowGrantModal] = useState(false);
  const [grantDays, setGrantDays] = useState(30);
  const [granting, setGranting] = useState(false);

  const profile = data.profile;
  const sub = data.subscription;

  // ------ Profile editing state ------
  const [editProfile, setEditProfile] = useState<Partial<UserProfile>>({
    name: profile?.name ?? '',
    wechat: profile?.wechat ?? '',
    channel: profile?.channel ?? '',
    ops_status: profile?.ops_status ?? '待联系',
    priority: profile?.priority ?? 'mid',
    notes: profile?.notes ?? '',
    next_followup: profile?.next_followup?.slice(0, 10) ?? '',
  });
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>(profile?.tags ?? []);

  const saveProfile = useCallback(async () => {
    setSaving(true);
    try {
      const payload = {
        user_id: data.user_id,
        ...editProfile,
        tags,
        next_followup: editProfile.next_followup || null,
      };
      const result = await crmFetch('/profiles', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (result.profile) {
        setData((d) => ({ ...d, profile: result.profile }));
      }
    } finally {
      setSaving(false);
    }
  }, [data.user_id, editProfile, tags]);

  const grantSubscription = useCallback(async () => {
    setGranting(true);
    try {
      const result = await crmFetch(`/users/${data.user_id}/grant-subscription`, {
        method: 'POST',
        body: JSON.stringify({ user_id: data.user_id, days: grantDays, plan: 'max' }),
      });
      if (result.success && data.subscription) {
        setData((d) => ({
          ...d,
          subscription: d.subscription ? {
            ...d.subscription,
            plan: 'max',
            status: 'active',
            access_expires_at: result.access_expires_at,
            invite_code: 'ADMIN_GRANT',
          } : d.subscription,
        }));
        setShowGrantModal(false);
      }
    } finally {
      setGranting(false);
    }
  }, [data.user_id, grantDays]);

  // ------ Interaction form ------
  const [newInteraction, setNewInteraction] = useState({
    type: '微信',
    summary: '',
    content: '',
    sentiment: 'neutral',
    key_feedback: [] as string[],
  });
  const [feedbackInput, setFeedbackInput] = useState('');

  const addInteraction = useCallback(async () => {
    if (!newInteraction.summary.trim()) return;
    setSaving(true);
    try {
      const result = await crmFetch('/interactions', {
        method: 'POST',
        body: JSON.stringify({
          user_id: data.user_id,
          ...newInteraction,
          date: new Date().toISOString(),
        }),
      });
      if (result.interaction) {
        setData((d) => ({
          ...d,
          interactions: [result.interaction, ...d.interactions],
        }));
        setNewInteraction({ type: '微信', summary: '', content: '', sentiment: 'neutral', key_feedback: [] });
        setFeedbackInput('');
        setShowDetailedForm(false);
      }
    } finally {
      setSaving(false);
    }
  }, [data.user_id, newInteraction]);

  const deleteInteraction = useCallback(async (id: string) => {
    const result = await crmFetch(`/interactions/${id}`, {
      method: 'DELETE',
    });
    if (result.deleted) {
      setData((d) => ({
        ...d,
        interactions: d.interactions.filter((i) => i.id !== id),
      }));
    }
  }, []);

  const updateInteraction = useCallback(async (id: string, updates: Record<string, unknown>) => {
    const result = await crmFetch('/interactions', {
      method: 'PUT',
      body: JSON.stringify({ id, ...updates }),
    });
    if (result.interaction) {
      setData((d) => ({
        ...d,
        interactions: d.interactions.map((i) => i.id === id ? result.interaction : i),
      }));
    }
  }, []);

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) {
      setTags([...tags, t]);
    }
    setTagInput('');
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/admin" className="hover:text-foreground transition-colors">
          Admin
        </Link>
        <span>/</span>
        <span className="text-foreground">{data.email ?? data.user_id.slice(0, 8)}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">
            {profile?.name || data.email || data.user_id.slice(0, 8) + '...'}
          </h1>
          {data.email && (
            <p className="text-sm text-muted-foreground mt-0.5 font-mono">{data.email}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_COLORS[profile?.ops_status ?? '待联系'] ?? STATUS_COLORS['待联系']}`}>
            {profile?.ops_status ?? '待联系'}
          </span>
          {sub?.plan && (
            <span className="inline-block rounded-full px-2.5 py-1 text-xs font-medium bg-emerald-100 text-emerald-700 uppercase">
              {sub.plan}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ────── Left column: Profile + Subscription ────── */}
        <div className="lg:col-span-1 space-y-6">
          {/* Subscription info (read-only) */}
          <Section title="订阅信息">
            <InfoRow label="套餐" value={sub?.plan?.toUpperCase() ?? '无'} />
            <InfoRow label="状态" value={sub?.status ?? '-'} />
            <InfoRow label="试用到期" value={formatDate(sub?.access_expires_at)} />
            <InfoRow label="邀请码" value={sub?.invite_code ?? '-'} />
            <InfoRow label="注册时间" value={formatDate(sub?.created_at)} />
            <InfoRow label="Stripe ID" value={sub?.stripe_customer_id?.slice(0, 16) ?? '-'} mono />
            <button
              onClick={() => setShowGrantModal(true)}
              className="w-full mt-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 transition-colors"
            >
              赠送订阅
            </button>
          </Section>

          {/* Grant subscription modal */}
          {showGrantModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="bg-background border border-border rounded-xl p-6 w-80 space-y-4 shadow-lg">
                <h3 className="text-base font-semibold">赠送订阅</h3>
                <p className="text-sm text-muted-foreground">
                  为 {profile?.name || data.email || data.user_id.slice(0, 8)} 赠送 Max 订阅
                </p>
                <Field label="天数">
                  <div className="flex gap-2">
                    {[7, 14, 30, 90].map((d) => (
                      <button
                        key={d}
                        onClick={() => setGrantDays(d)}
                        className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                          grantDays === d
                            ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-400'
                            : 'bg-muted text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {d}天
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="自定义天数">
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={grantDays}
                    onChange={(e) => setGrantDays(Math.max(1, Math.min(365, Number(e.target.value))))}
                    className="input-field"
                  />
                </Field>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => setShowGrantModal(false)}
                    className="text-sm text-muted-foreground hover:text-foreground px-3 py-1.5 transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={grantSubscription}
                    disabled={granting}
                    className="text-sm bg-emerald-600 text-white rounded-lg px-4 py-1.5 hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                  >
                    {granting ? '处理中...' : `确认赠送 ${grantDays} 天`}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Editable profile */}
          <Section title="运营档案">
            <Field label="姓名/昵称">
              <input
                type="text"
                value={editProfile.name ?? ''}
                onChange={(e) => setEditProfile((p) => ({ ...p, name: e.target.value }))}
                className="input-field"
                placeholder="用户真实姓名"
              />
            </Field>
            <Field label="微信号">
              <input
                type="text"
                value={editProfile.wechat ?? ''}
                onChange={(e) => setEditProfile((p) => ({ ...p, wechat: e.target.value }))}
                className="input-field"
              />
            </Field>
            <Field label="获客渠道">
              <select
                value={editProfile.channel ?? ''}
                onChange={(e) => setEditProfile((p) => ({ ...p, channel: e.target.value }))}
                className="input-field"
              >
                <option value="">选择渠道</option>
                {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="运营状态">
              <select
                value={editProfile.ops_status ?? '待联系'}
                onChange={(e) => setEditProfile((p) => ({ ...p, ops_status: e.target.value }))}
                className="input-field"
              >
                {OPS_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="优先级">
              <div className="flex gap-2">
                {PRIORITIES.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => setEditProfile((prev) => ({ ...prev, priority: p.value }))}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                      editProfile.priority === p.value
                        ? `${p.color} ring-1 ring-current`
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="标签">
              <div className="flex flex-wrap gap-1.5 mb-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700"
                  >
                    {tag}
                    <button onClick={() => removeTag(tag)} className="hover:text-blue-900">x</button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                  className="input-field flex-1"
                  placeholder="添加标签"
                />
                <button onClick={addTag} className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">
                  添加
                </button>
              </div>
            </Field>
            <Field label="下次跟进">
              <input
                type="date"
                value={editProfile.next_followup ?? ''}
                onChange={(e) => setEditProfile((p) => ({ ...p, next_followup: e.target.value }))}
                className="input-field"
              />
            </Field>
            <Field label="备注">
              <textarea
                value={editProfile.notes ?? ''}
                onChange={(e) => setEditProfile((p) => ({ ...p, notes: e.target.value }))}
                rows={3}
                className="input-field resize-none"
                placeholder="用户背景、需求要点..."
              />
            </Field>
            <button
              onClick={saveProfile}
              disabled={saving}
              className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {saving ? '保存中...' : '保存档案'}
            </button>
          </Section>
        </div>

        {/* ────── Right column: Feedback + Interactions ────── */}
        <div className="lg:col-span-2 space-y-6">
          {/* Email subscriptions */}
          <EmailSubscriptionsSection
            userId={data.user_id}
            email={data.email}
            subscriptions={data.email_subscriptions}
            personalDigest={data.personal_digest}
          />

          {/* Watchlist + Portfolio */}
          <HoldingsSection watchlist={data.watchlist} portfolio={data.portfolio} />

          {/* Agent conversations */}
          <ConversationsSection
            userId={data.user_id}
            initial={data.conversations}
            total={data.conversations_total}
          />

          {/* User feedback section */}
          {(data.questionnaires.length > 0 || data.contact_feedbacks.length > 0) && (
            <FeedbackSection
              questionnaires={data.questionnaires}
              contactFeedbacks={data.contact_feedbacks}
            />
          )}

          {/* Interactions */}
          <div className="space-y-4">
            <h2 className="text-base font-semibold">交互记录</h2>

            {/* Quick entry bar */}
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="flex items-center gap-2 p-3">
                <select
                  value={newInteraction.type}
                  onChange={(e) => setNewInteraction((p) => ({ ...p, type: e.target.value }))}
                  className="text-xs border border-border rounded-md px-2 py-1.5 bg-background shrink-0"
                >
                  {INTERACTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <input
                  type="text"
                  value={newInteraction.summary}
                  onChange={(e) => setNewInteraction((p) => ({ ...p, summary: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing && newInteraction.summary.trim() && !showDetailedForm) {
                      addInteraction();
                    }
                  }}
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
                  placeholder="记录一次沟通... (Enter 快速保存)"
                />
                <button
                  onClick={() => setShowDetailedForm(!showDetailedForm)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0 px-2 py-1"
                >
                  {showDetailedForm ? '收起' : '展开'}
                </button>
                {!showDetailedForm && newInteraction.summary.trim() && (
                  <button
                    onClick={addInteraction}
                    disabled={saving}
                    className="text-xs bg-emerald-600 text-white rounded-md px-3 py-1.5 hover:bg-emerald-700 disabled:opacity-50 transition-colors shrink-0"
                  >
                    保存
                  </button>
                )}
              </div>

              {showDetailedForm && (
                <div className="border-t border-border p-3 space-y-3 bg-muted/20">
                  <Field label="情绪" compact>
                    <div className="flex gap-2">
                      {SENTIMENTS.map((s) => (
                        <button
                          key={s.value}
                          onClick={() => setNewInteraction((p) => ({ ...p, sentiment: s.value }))}
                          className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                            newInteraction.sentiment === s.value
                              ? `${s.color} bg-muted ring-1 ring-current`
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </Field>
                  <Field label="详细内容" compact>
                    <textarea
                      value={newInteraction.content}
                      onChange={(e) => setNewInteraction((p) => ({ ...p, content: e.target.value }))}
                      rows={4}
                      className="input-field resize-none"
                      placeholder="完整聊天记录、要点记录..."
                    />
                  </Field>
                  <Field label="关键反馈" compact>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {newInteraction.key_feedback.map((f, i) => (
                        <span key={i} className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-xs text-purple-700">
                          {f}
                          <button
                            onClick={() => setNewInteraction((p) => ({
                              ...p,
                              key_feedback: p.key_feedback.filter((_, idx) => idx !== i),
                            }))}
                            className="hover:text-purple-900"
                          >
                            x
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={feedbackInput}
                        onChange={(e) => setFeedbackInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                            e.preventDefault();
                            const val = feedbackInput.trim();
                            if (val && !newInteraction.key_feedback.includes(val)) {
                              setNewInteraction((p) => ({ ...p, key_feedback: [...p.key_feedback, val] }));
                            }
                            setFeedbackInput('');
                          }
                        }}
                        className="input-field flex-1"
                        placeholder="输入后 Enter 添加"
                      />
                    </div>
                  </Field>
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => {
                        setNewInteraction({ type: '微信', summary: '', content: '', sentiment: 'neutral', key_feedback: [] });
                        setFeedbackInput('');
                        setShowDetailedForm(false);
                      }}
                      className="text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 transition-colors"
                    >
                      取消
                    </button>
                    <button
                      onClick={addInteraction}
                      disabled={saving || !newInteraction.summary.trim()}
                      className="text-xs bg-emerald-600 text-white rounded-md px-3 py-1.5 hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                    >
                      {saving ? '保存中...' : '保存记录'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Timeline */}
            {data.interactions.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                暂无交互记录
              </div>
            ) : (
              <div className="space-y-3">
                {data.interactions.map((interaction) => (
                  <InteractionCard
                    key={interaction.id}
                    interaction={interaction}
                    onDelete={deleteInteraction}
                    onUpdate={updateInteraction}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Global styles for form fields */}
      <style>{`
        .input-field {
          width: 100%;
          border-radius: 0.5rem;
          border: 1px solid hsl(var(--border));
          background: hsl(var(--background));
          padding: 0.375rem 0.75rem;
          font-size: 0.875rem;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .input-field:focus {
          border-color: hsl(152 95% 39% / 0.5);
          box-shadow: 0 0 0 2px hsl(152 95% 39% / 0.15);
        }
        .input-field::placeholder {
          color: hsl(var(--muted-foreground) / 0.5);
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-border rounded-lg p-4 space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        {title}
      </h3>
      {children}
    </div>
  );
}

function Field({
  label,
  children,
  compact,
}: {
  label: string;
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={compact ? 'space-y-1' : 'space-y-1.5'}>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between items-center py-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-sm ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
    </div>
  );
}

function InteractionCard({
  interaction,
  onDelete,
  onUpdate,
}: {
  interaction: Interaction;
  onDelete: (id: string) => void;
  onUpdate: (id: string, updates: Record<string, unknown>) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    type: interaction.type ?? '',
    summary: interaction.summary ?? '',
    content: interaction.content ?? '',
    sentiment: interaction.sentiment ?? 'neutral',
    key_feedback: [...(interaction.key_feedback ?? [])],
  });
  const [editFeedbackInput, setEditFeedbackInput] = useState('');

  const startEdit = () => {
    setEditForm({
      type: interaction.type ?? '',
      summary: interaction.summary ?? '',
      content: interaction.content ?? '',
      sentiment: interaction.sentiment ?? 'neutral',
      key_feedback: [...(interaction.key_feedback ?? [])],
    });
    setEditFeedbackInput('');
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!editForm.summary.trim()) return;
    setSaving(true);
    try {
      await onUpdate(interaction.id, editForm);
      setIsEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const sentimentCfg = SENTIMENTS.find((s) => s.value === (isEditing ? editForm.sentiment : interaction.sentiment));

  if (isEditing) {
    return (
      <div className="border border-emerald-300/60 rounded-lg p-4 space-y-3 bg-emerald-50/30">
        <div className="grid grid-cols-2 gap-3">
          <Field label="类型" compact>
            <select
              value={editForm.type}
              onChange={(e) => setEditForm((p) => ({ ...p, type: e.target.value }))}
              className="input-field"
            >
              {INTERACTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="情绪" compact>
            <div className="flex gap-2 items-center h-[34px]">
              {SENTIMENTS.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setEditForm((p) => ({ ...p, sentiment: s.value }))}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                    editForm.sentiment === s.value
                      ? `${s.color} bg-muted ring-1 ring-current`
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </Field>
        </div>
        <Field label="摘要" compact>
          <input
            type="text"
            value={editForm.summary}
            onChange={(e) => setEditForm((p) => ({ ...p, summary: e.target.value }))}
            className="input-field"
          />
        </Field>
        <Field label="详细内容" compact>
          <textarea
            value={editForm.content}
            onChange={(e) => setEditForm((p) => ({ ...p, content: e.target.value }))}
            rows={6}
            className="input-field resize-none"
          />
        </Field>
        <Field label="关键反馈" compact>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {editForm.key_feedback.map((f, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-xs text-purple-700">
                {f}
                <button
                  onClick={() => setEditForm((p) => ({
                    ...p,
                    key_feedback: p.key_feedback.filter((_, idx) => idx !== i),
                  }))}
                  className="hover:text-purple-900"
                >
                  x
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={editFeedbackInput}
              onChange={(e) => setEditFeedbackInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  const val = editFeedbackInput.trim();
                  if (val && !editForm.key_feedback.includes(val)) {
                    setEditForm((p) => ({ ...p, key_feedback: [...p.key_feedback, val] }));
                  }
                  setEditFeedbackInput('');
                }
              }}
              className="input-field flex-1"
              placeholder="输入后 Enter 添加"
            />
          </div>
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={() => setIsEditing(false)}
            className="text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !editForm.summary.trim()}
            className="text-xs bg-emerald-600 text-white rounded-md px-3 py-1.5 hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-border rounded-lg p-4 hover:border-border/80 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium bg-muted rounded-full px-2 py-0.5">
            {interaction.type ?? '未知'}
          </span>
          {sentimentCfg && (
            <span className={`text-xs ${sentimentCfg.color}`}>{sentimentCfg.label}</span>
          )}
          <span className="text-xs text-muted-foreground">{formatDateTime(interaction.date)}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={startEdit}
            className="text-xs text-muted-foreground hover:text-emerald-600 transition-colors"
          >
            编辑
          </button>
          <button
            onClick={() => {
              if (confirm('确定删除这条记录?')) onDelete(interaction.id);
            }}
            className="text-xs text-muted-foreground hover:text-red-600 transition-colors"
          >
            删除
          </button>
        </div>
      </div>
      <p className="text-sm mt-2 font-medium">{interaction.summary}</p>
      {interaction.content && (
        <>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-emerald-600 mt-1.5 hover:text-emerald-700"
          >
            {expanded ? '收起详情' : '展开详情'}
          </button>
          {expanded && (
            <pre className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap bg-muted/50 rounded-lg p-3 max-h-80 overflow-y-auto">
              {interaction.content}
            </pre>
          )}
        </>
      )}
      {interaction.key_feedback.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {interaction.key_feedback.map((f, i) => (
            <span key={i} className="text-xs bg-purple-50 text-purple-700 rounded-full px-2 py-0.5">
              {f}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Feedback Section - questionnaire + contact page feedback
// ---------------------------------------------------------------------------

const CONTACT_RATING_STYLES: Record<string, { label: string; style: string }> = {
  helpful:     { label: '很有帮助', style: 'bg-emerald-50 text-emerald-700' },
  neutral:     { label: '还行', style: 'bg-gray-100 text-gray-600' },
  not_helpful: { label: '不太行', style: 'bg-red-50 text-red-700' },
};

function FeedbackSection({
  questionnaires,
  contactFeedbacks,
}: {
  questionnaires: Questionnaire[];
  contactFeedbacks: ContactFeedback[];
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold">用户反馈</h2>

      {/* Questionnaire responses */}
      {questionnaires.length > 0 && (
        <div className="border border-border rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              问卷反馈
            </h3>
            <span className="text-[10px] text-muted-foreground">
              {formatDateTime(questionnaires[0].created_at)}
            </span>
          </div>
          {questionnaires.map((q) => (
            <div key={q.id} className="space-y-2.5">
              <div className="flex justify-between items-center py-0.5">
                <span className="text-xs text-muted-foreground">投资经历</span>
                <span className="text-xs font-medium bg-blue-50 text-blue-700 rounded-full px-2 py-0.5">
                  {q.background}
                </span>
              </div>
              {q.markets.length > 0 && (
                <div>
                  <span className="text-xs text-muted-foreground block mb-1">关注市场</span>
                  <div className="flex flex-wrap gap-1">
                    {q.markets.map((m) => (
                      <span key={m} className="text-[11px] bg-muted rounded-full px-2 py-0.5 text-muted-foreground">
                        {m}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {q.trading_style.length > 0 && (
                <div>
                  <span className="text-xs text-muted-foreground block mb-1">交易风格</span>
                  <div className="flex flex-wrap gap-1">
                    {q.trading_style.map((s) => (
                      <span key={s} className="text-[11px] bg-muted rounded-full px-2 py-0.5 text-muted-foreground">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {q.pain_points.length > 0 && (
                <div>
                  <span className="text-xs text-muted-foreground block mb-1">投研痛点</span>
                  <div className="flex flex-wrap gap-1">
                    {q.pain_points.map((p) => (
                      <span key={p} className="text-[11px] bg-amber-50 text-amber-700 rounded-full px-2 py-0.5">
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {q.feedback && (
                <div>
                  <span className="text-xs text-muted-foreground block mb-1">希望解决的问题</span>
                  <p className="text-sm text-foreground bg-muted/50 rounded-lg p-3">
                    {q.feedback}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Contact page feedbacks */}
      {contactFeedbacks.length > 0 && (
        <div className="border border-border rounded-lg p-4 space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            联系页反馈
          </h3>
          <div className="space-y-2.5">
            {contactFeedbacks.map((fb) => {
              const ratingCfg = CONTACT_RATING_STYLES[fb.rating];
              return (
                <div key={fb.id} className="border border-border/50 rounded-lg p-3 space-y-1.5">
                  <div className="flex items-center gap-2">
                    {ratingCfg && (
                      <span className={`text-[11px] font-medium rounded-full px-2 py-0.5 ${ratingCfg.style}`}>
                        {ratingCfg.label}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(fb.created_at)}
                    </span>
                  </div>
                  {fb.message && (
                    <p className="text-sm text-foreground">{fb.message}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Email Subscriptions Section
// ---------------------------------------------------------------------------

const EMAIL_CHANNELS = [
  { key: 'morning_report' as const,  label: '早报',          hint: 'Pro · 盘前邮件' },
  { key: 'daily_report' as const,    label: '收盘日报',       hint: '免费 · 用户偏好' },
  { key: 'weekly_report' as const,   label: '周报',           hint: 'Pro · 周末' },
  { key: 'personal_digest' as const, label: '专属持仓日报',    hint: 'Pro · 基于持仓' },
];

function EmailSubscriptionsSection({
  userId,
  email,
  subscriptions,
  personalDigest,
}: {
  userId: string;
  email: string | null;
  subscriptions: EmailSubscriptions | null;
  personalDigest: PersonalDigestSummary;
}) {
  // Force-regenerate today's digest for this user. No email is sent — this
  // only refreshes the cached `user_digests` row that /for-you reads.
  type RegenStatus =
    | { kind: 'idle' }
    | { kind: 'pending' }
    | { kind: 'success'; stocks_count: number; symbols: string[] }
    | { kind: 'error'; message: string };

  const [regenStatus, setRegenStatus] = useState<RegenStatus>({ kind: 'idle' });

  const handleRegenerate = useCallback(async () => {
    const ok = window.confirm(
      '强制重新生成该用户今日的专属日报？\n\n· 会消耗一次 LLM 调用（≈$0.02）\n· 不会发送邮件\n· 会覆盖今日已有的 digest 缓存',
    );
    if (!ok) return;

    setRegenStatus({ kind: 'pending' });
    try {
      const token = getAccessTokenSync() ?? (await getAccessTokenAsync());
      const res = await fetch(`${API_BASE}/admin/digest/regenerate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user_id: userId }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        setRegenStatus({
          kind: 'error',
          message: data?.detail || data?.error || `HTTP ${res.status}`,
        });
        return;
      }
      setRegenStatus({
        kind: 'success',
        stocks_count: data.stocks_count ?? 0,
        symbols: data.symbols_used ?? [],
      });
    } catch (e) {
      setRegenStatus({
        kind: 'error',
        message: e instanceof Error ? e.message : '请求失败',
      });
    }
  }, [userId]);

  return (
    <div className="border border-border rounded-lg p-4 space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        邮件订阅
      </h3>
      {!email ? (
        <p className="text-sm text-muted-foreground">用户无邮箱，无法查询订阅状态</p>
      ) : !subscriptions ? (
        <p className="text-sm text-muted-foreground">订阅状态加载失败（Resend 未响应）</p>
      ) : (
        <div className="space-y-2">
          {EMAIL_CHANNELS.map((ch) => {
            const subscribed = subscriptions[ch.key];
            return (
              <div key={ch.key} className="flex items-center justify-between py-1">
                <div className="flex flex-col">
                  <span className="text-sm">{ch.label}</span>
                  <span className="text-[11px] text-muted-foreground">{ch.hint}</span>
                </div>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                    subscribed
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {subscribed ? '✓ 已订阅' : '未订阅'}
                </span>
              </div>
            );
          })}
        </div>
      )}
      <div className="pt-2 border-t border-border">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">专属日报近 30 天发送</span>
          <span className="font-medium">{personalDigest.count_30d} 期</span>
        </div>
        <div className="flex items-center justify-between text-xs mt-1">
          <span className="text-muted-foreground">最近一期</span>
          <span className="font-medium">{personalDigest.last_date ?? '-'}</span>
        </div>

        {/* Force-regenerate today's digest. No email send. */}
        <div className="mt-3 pt-3 border-t border-border space-y-2">
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={regenStatus.kind === 'pending'}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:border-primary/40 hover:text-primary disabled:opacity-50 transition-colors"
          >
            {regenStatus.kind === 'pending' ? '正在重新生成...（最多 30 秒）' : '强制刷新今日 digest'}
          </button>
          <p className="text-[11px] text-muted-foreground/80 leading-relaxed">
            重新跑一次 LLM 分析，覆盖今日缓存。<span className="text-amber-600">不会重发邮件</span>。用于测试 prompt/数据变化后的效果，或者用户加完股后立即看到分析。
          </p>

          {regenStatus.kind === 'success' && (
            <div className="rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-800">
              <p className="font-medium">✓ 重新生成完成</p>
              <p className="mt-1 leading-relaxed">
                LLM 输出 <span className="font-mono font-semibold">{regenStatus.stocks_count}</span> 只股票分析
                {regenStatus.symbols.length > 0 && (
                  <span className="text-emerald-700/80">
                    {' '}（{regenStatus.symbols.join(', ')}）
                  </span>
                )}
              </p>
              <p className="mt-1 text-emerald-700/70">让用户刷新 /for-you 即可看到新结果。</p>
            </div>
          )}

          {regenStatus.kind === 'error' && (
            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800">
              <p className="font-medium">✗ 失败</p>
              <p className="mt-1 leading-relaxed break-all">{regenStatus.message}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Conversations Section
// ---------------------------------------------------------------------------

function ConversationsSection({
  userId,
  initial,
  total,
}: {
  userId: string;
  initial: ConversationSummary[];
  total: number;
}) {
  const [conversations, setConversations] = useState(initial);
  const [showingAll, setShowingAll] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedFull, setExpandedFull] = useState<ConversationFull | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const totalMessages = conversations.reduce((sum, c) => sum + (c.message_count ?? 0), 0);

  const loadAll = useCallback(async () => {
    setLoadingAll(true);
    try {
      const result = await crmFetch(`/users/${userId}/conversations`);
      if (Array.isArray(result.conversations)) {
        setConversations(result.conversations);
        setShowingAll(true);
      }
    } finally {
      setLoadingAll(false);
    }
  }, [userId]);

  const toggleExpand = useCallback(async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setExpandedFull(null);
      return;
    }
    setExpandedId(id);
    setExpandedFull(null);
    setLoadingDetail(true);
    try {
      const result = await crmFetch(`/users/${userId}/conversations/${id}`);
      if (result.conversation) {
        setExpandedFull(result.conversation as ConversationFull);
      }
    } finally {
      setLoadingDetail(false);
    }
  }, [expandedId, userId]);

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold">Agent 对话</h2>
        <span className="text-xs text-muted-foreground">
          {total} 个对话 · 共 {totalMessages} 条消息（已显示 {conversations.length}）
        </span>
      </div>

      {conversations.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm border border-border rounded-lg">
          暂无对话
        </div>
      ) : (
        <div className="space-y-2">
          {conversations.map((c) => (
            <div
              key={c.id}
              className="border border-border rounded-lg hover:border-border/80 transition-colors"
            >
              <button
                onClick={() => toggleExpand(c.id)}
                className="w-full flex items-center justify-between p-3 text-left"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {c.title || '(未命名对话)'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {c.message_count} 条消息 · {formatDateTime(c.updated_at)}
                  </p>
                </div>
                <span className="text-xs text-emerald-600 ml-3 shrink-0">
                  {expandedId === c.id ? '收起' : '展开'}
                </span>
              </button>

              {expandedId === c.id && (
                <div className="border-t border-border p-3 bg-muted/20">
                  {loadingDetail && !expandedFull ? (
                    <p className="text-xs text-muted-foreground">加载中...</p>
                  ) : (
                    <ConversationMessages messages={expandedFull?.data?.messages} />
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {!showingAll && total > conversations.length && (
        <button
          onClick={loadAll}
          disabled={loadingAll}
          className="w-full text-sm text-emerald-600 hover:text-emerald-700 disabled:opacity-50 py-2 border border-dashed border-border rounded-lg transition-colors"
        >
          {loadingAll ? '加载中...' : `查看全部 ${total} 个对话`}
        </button>
      )}
    </div>
  );
}

function ConversationMessages({ messages }: { messages: ConversationMessage[] | undefined }) {
  if (!messages || messages.length === 0) {
    return <p className="text-xs text-muted-foreground">无消息内容</p>;
  }

  return (
    <div className="space-y-2 max-h-96 overflow-y-auto">
      {messages.map((msg, i) => {
        const text =
          typeof msg.content === 'string' ? msg.content :
          typeof msg.text === 'string'    ? msg.text :
          JSON.stringify(msg.content ?? msg, null, 2);
        const role = msg.role ?? 'system';
        const isUser = role === 'user';
        return (
          <div
            key={i}
            className={`rounded-lg p-2.5 text-xs ${
              isUser
                ? 'bg-emerald-50 border border-emerald-200/60'
                : 'bg-background border border-border'
            }`}
          >
            <div className={`text-[10px] font-medium uppercase tracking-wider mb-1 ${
              isUser ? 'text-emerald-700' : 'text-muted-foreground'
            }`}>
              {isUser ? '用户' : role === 'assistant' ? 'Agent' : role}
            </div>
            <pre className="whitespace-pre-wrap text-foreground font-sans">
              {text}
            </pre>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Holdings Section - watchlist (symbols + preferences) + portfolio (positions)
// ---------------------------------------------------------------------------

function HoldingsSection({
  watchlist,
  portfolio,
}: {
  watchlist: Watchlist | null;
  portfolio: PortfolioRow[];
}) {
  const hasWatchlist = !!(watchlist && watchlist.symbols && watchlist.symbols.length > 0);
  const hasPortfolio = portfolio.length > 0;

  if (!hasWatchlist && !hasPortfolio) {
    return (
      <div className="border border-border rounded-lg p-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          关注列表
        </h3>
        <p className="text-sm text-muted-foreground mt-2">用户尚未设置自选股或持仓</p>
      </div>
    );
  }

  const prefs = (watchlist?.preferences ?? {}) as Record<string, unknown>;
  const focus = Array.isArray(prefs.focus) ? (prefs.focus as string[]) : [];
  const style = typeof prefs.style === 'string' ? (prefs.style as string) : null;

  return (
    <div className="border border-border rounded-lg p-4 space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        关注列表
      </h3>

      {hasWatchlist && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">自选股 ({watchlist!.symbols.length})</span>
            <span className="text-muted-foreground">{formatDate(watchlist!.updated_at)}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {watchlist!.symbols.map((sym) => (
              <span
                key={sym}
                className="inline-block rounded-md bg-emerald-50 text-emerald-700 px-2 py-0.5 text-xs font-mono font-medium"
              >
                {sym}
              </span>
            ))}
          </div>
          {(focus.length > 0 || style) && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {style && (
                <span className="text-[11px] text-muted-foreground">
                  风格: <span className="text-foreground font-medium">{style}</span>
                </span>
              )}
              {focus.length > 0 && (
                <span className="text-[11px] text-muted-foreground">
                  关注:{' '}
                  {focus.map((f, i) => (
                    <span key={f} className="text-foreground font-medium">
                      {f}{i < focus.length - 1 ? '、' : ''}
                    </span>
                  ))}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {hasPortfolio && (
        <div className={`space-y-2 ${hasWatchlist ? 'pt-3 border-t border-border' : ''}`}>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">持仓 ({portfolio.length})</span>
          </div>
          <div className="space-y-1.5">
            {portfolio.map((p) => (
              <div key={p.symbol} className="flex items-baseline gap-3 py-1.5 border-b border-border/40 last:border-b-0">
                <span className="text-xs font-mono font-semibold text-foreground w-16 shrink-0">
                  {p.symbol}
                </span>
                <div className="flex-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                  {p.shares != null && <span>{Number(p.shares).toLocaleString(undefined, { maximumFractionDigits: 4 })} 股</span>}
                  {p.cost_basis != null && <span>成本 ${Number(p.cost_basis).toLocaleString()}</span>}
                  {p.entry_price != null && <span>入价 ${Number(p.entry_price).toLocaleString()}</span>}
                  {p.target != null && <span>目标 ${Number(p.target).toLocaleString()}</span>}
                  {p.stop_loss != null && <span>止损 ${Number(p.stop_loss).toLocaleString()}</span>}
                  {p.conviction != null && <span>信心 {p.conviction}/5</span>}
                </div>
                {p.thesis && (
                  <span className="text-[11px] text-foreground italic max-w-[40%] truncate" title={p.thesis}>
                    “{p.thesis}”
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
