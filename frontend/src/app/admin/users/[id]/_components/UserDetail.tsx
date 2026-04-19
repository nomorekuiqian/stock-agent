'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import type { UserDetailData, UserProfile, Interaction, ContactFeedback, Questionnaire } from '../page';

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
  cronSecret: string,
  options?: RequestInit,
) {
  const res = await fetch(`${API_BASE}/admin/crm${path}`, {
    ...options,
    headers: {
      'X-Cron-Secret': cronSecret,
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
  cronSecret,
}: {
  data: UserDetailData;
  cronSecret: string;
}) {
  const [data, setData] = useState(initialData);
  const [saving, setSaving] = useState(false);
  const [showDetailedForm, setShowDetailedForm] = useState(false);

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
      const result = await crmFetch('/profiles', cronSecret, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (result.profile) {
        setData((d) => ({ ...d, profile: result.profile }));
      }
    } finally {
      setSaving(false);
    }
  }, [data.user_id, editProfile, tags, cronSecret]);

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
      const result = await crmFetch('/interactions', cronSecret, {
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
  }, [data.user_id, newInteraction, cronSecret]);

  const deleteInteraction = useCallback(async (id: string) => {
    const result = await crmFetch(`/interactions/${id}`, cronSecret, {
      method: 'DELETE',
    });
    if (result.deleted) {
      setData((d) => ({
        ...d,
        interactions: d.interactions.filter((i) => i.id !== id),
      }));
    }
  }, [cronSecret]);

  const updateInteraction = useCallback(async (id: string, updates: Record<string, unknown>) => {
    const result = await crmFetch('/interactions', cronSecret, {
      method: 'PUT',
      body: JSON.stringify({ id, ...updates }),
    });
    if (result.interaction) {
      setData((d) => ({
        ...d,
        interactions: d.interactions.map((i) => i.id === id ? result.interaction : i),
      }));
    }
  }, [cronSecret]);

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
          </Section>

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
