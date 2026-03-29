'use client';

import { useState, useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { api, type EmailPreferences } from '@/lib/api';
import { useEmailPreferences } from '@/hooks/queries/use-preferences';
import { queryKeys } from '@/hooks/queries/query-keys';

const PREFERENCE_ITEMS: { key: keyof EmailPreferences; label: string; description: string }[] = [
  { key: 'morning_report', label: '早报', description: '每个交易日早上发送' },
  { key: 'daily_report', label: '晚报', description: '每个交易日收盘后发送' },
  { key: 'weekly_report', label: '宏观周报', description: '每周日发送' },
  { key: 'personal_digest', label: '专属日报', description: '根据你的持仓每日定制' },
];

const INVITE_DAYS = 14;

function getDaysLeft(accessExpiresAt: string | null): number | null {
  if (!accessExpiresAt) return null;
  const ms = new Date(accessExpiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch { return iso; }
}

export default function ProfilePage(): ReactNode {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isAuthenticated, isLoading, updateProfile } = useAuth();
  const { isPro, isLoading: subLoading, accessExpiresAt, redeemInviteCode, refreshSubscription } = useSubscription();

  const { data: serverPrefs, isLoading: prefsLoading, isError: prefsError } = useEmailPreferences(
    isAuthenticated
  );

  // Profile form state
  const [name, setName] = useState(user?.name || '');
  const [nameSource, setNameSource] = useState(user?.name || '');
  if ((user?.name || '') !== nameSource) {
    setNameSource(user?.name || '');
    setName(user?.name || '');
  }

  const [localPrefs, setLocalPrefs] = useState<EmailPreferences | null>(serverPrefs ?? null);
  const [prefsSource, setPrefsSource] = useState(serverPrefs);
  if (serverPrefs && serverPrefs !== prefsSource) {
    setPrefsSource(serverPrefs);
    setLocalPrefs(serverPrefs);
  }

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Invite code inline state
  const [codeInput, setCodeInput] = useState('');
  const [codeError, setCodeError] = useState('');
  const [codeSuccess, setCodeSuccess] = useState('');
  const [isRedeeming, setIsRedeeming] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login?redirect=/profile');
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || !isAuthenticated || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-12 h-12 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
      </div>
    );
  }

  const nameChanged = name.trim() !== (user.name || '');
  const prefsChanged = serverPrefs && localPrefs
    ? PREFERENCE_ITEMS.some(({ key }) => serverPrefs[key] !== localPrefs[key])
    : false;
  const hasChanges = nameChanged || prefsChanged;

  function handleToggle(key: keyof EmailPreferences) {
    if (!localPrefs || saving) return;
    setLocalPrefs({ ...localPrefs, [key]: !localPrefs[key] });
    setMessage(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!hasChanges || saving) return;
    setSaving(true);
    setMessage(null);
    const results: { success: boolean; error?: string }[] = [];
    if (nameChanged) {
      results.push(await updateProfile({ name: name.trim() }));
    }
    if (prefsChanged && localPrefs && serverPrefs) {
      const diff: Partial<EmailPreferences> = {};
      for (const { key } of PREFERENCE_ITEMS) {
        if (localPrefs[key] !== serverPrefs[key]) diff[key] = localPrefs[key];
      }
      try {
        const result = await api.subscriptions.updatePreferences(diff);
        if (result.success) {
          queryClient.setQueryData(queryKeys.subscriptions.preferences(), result.preferences);
          setLocalPrefs(result.preferences);
          results.push({ success: true });
        } else {
          results.push({ success: false, error: '偏好保存失败' });
        }
      } catch {
        results.push({ success: false, error: '偏好保存失败' });
      }
    }
    const failed = results.find((r) => !r.success);
    setMessage(failed
      ? { type: 'error', text: failed.error || '保存失败，请重试' }
      : { type: 'success', text: '已保存' }
    );
    setSaving(false);
  }

  async function handleRedeemCode() {
    if (!codeInput.trim()) return;
    setIsRedeeming(true);
    setCodeError('');
    setCodeSuccess('');
    const result = await redeemInviteCode(codeInput.trim());
    setIsRedeeming(false);
    if (result.success) {
      setCodeInput('');
      setCodeSuccess(result.accessExpiresAt
        ? `已激活，有效期至 ${formatDate(result.accessExpiresAt)}`
        : '兑换成功'
      );
      await refreshSubscription();
    } else {
      setCodeError(result.error || '兑换失败，请稍后再试');
    }
  }

  const initials = user.name
    ? user.name.charAt(0).toUpperCase()
    : user.email?.charAt(0).toUpperCase() || 'U';

  // Subscription display logic
  const daysLeft = getDaysLeft(accessExpiresAt);
  const progressPct = daysLeft !== null
    ? Math.round((daysLeft / INVITE_DAYS) * 100)
    : 0;

  const urgency = daysLeft !== null
    ? daysLeft <= 3 ? 'red'
    : daysLeft <= 7 ? 'amber'
    : 'green'
    : 'green';

  const urgencyStyles = {
    red:   { bar: 'bg-red-400',   text: 'text-red-400',   badge: 'bg-red-400/10 border-red-400/30 text-red-400' },
    amber: { bar: 'bg-amber-400', text: 'text-amber-400', badge: 'bg-amber-400/10 border-amber-400/30 text-amber-400' },
    green: { bar: 'bg-primary',   text: 'text-primary',   badge: 'bg-primary/10 border-primary/30 text-primary' },
  }[urgency];

  return (
    <div className="min-h-screen bg-background py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-lg mx-auto space-y-10">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-2xl font-editorial text-foreground tracking-tight">个人资料</h1>
          <p className="text-sm text-muted-foreground">管理你的账户信息和邮件偏好</p>
        </div>

        {/* Avatar + Email */}
        <div className="flex items-center gap-4 p-4 bg-card border border-border/50 rounded-xl">
          <div className="w-12 h-12 rounded-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/30 border border-primary/30">
            <span className="text-lg font-semibold text-primary">{initials}</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-foreground truncate">{user.name || '未设置昵称'}</p>
              {subLoading ? (
                <span className="shrink-0 w-8 h-4 rounded bg-muted animate-pulse" />
              ) : isPro ? (
                <span className="shrink-0 inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/15 text-primary border border-primary/20 uppercase tracking-wide">
                  Pro
                </span>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          </div>
        </div>

        {/* ─── Subscription Status ─── */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-editorial text-foreground">订阅状态</h2>
            {subLoading ? (
              <span className="w-12 h-5 rounded-full bg-muted animate-pulse" />
            ) : (
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                isPro ? urgencyStyles.badge : 'bg-muted border-border/50 text-muted-foreground'
              }`}>
                {isPro ? 'Pro' : '免费版'}
              </span>
            )}
          </div>

          <div className="bg-card border border-border/50 rounded-xl overflow-hidden">
            {subLoading ? (
              <div className="p-5 space-y-3">
                <div className="w-32 h-4 rounded bg-muted animate-pulse" />
                <div className="w-full h-2 rounded-full bg-muted animate-pulse" />
                <div className="w-20 h-3 rounded bg-muted animate-pulse" />
              </div>
            ) : isPro && daysLeft !== null ? (
              /* Active trial — show progress */
              <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">邀请码体验</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      有效期至 <span className="text-foreground">{formatDate(accessExpiresAt!)}</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-2xl font-bold font-mono ${urgencyStyles.text}`}>{daysLeft}</p>
                    <p className="text-xs text-muted-foreground">天后到期</p>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="h-1.5 bg-background rounded-full overflow-hidden mb-1">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${urgencyStyles.bar}`}
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground/60">
                  <span>{INVITE_DAYS - daysLeft} 天已用</span>
                  <span>共 {INVITE_DAYS} 天</span>
                </div>

                {daysLeft <= 7 && (
                  <p className={`text-xs mt-3 ${urgencyStyles.text}`}>
                    {daysLeft <= 3 ? '即将到期，兑换新邀请码以继续使用' : '体验即将结束，你可以在下方兑换新邀请码'}
                  </p>
                )}
              </div>
            ) : isPro ? (
              /* Pro but no expiry (future paid plan) */
              <div className="p-5 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Pro 已激活</p>
                  <p className="text-xs text-muted-foreground mt-0.5">你的账户已开启 Pro 权限</p>
                </div>
              </div>
            ) : (
              /* Not Pro */
              <div className="p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">当前为免费版</p>
                    <p className="text-xs text-muted-foreground mt-0.5">输入邀请码解锁 14 天 Pro 体验</p>
                  </div>
                </div>
              </div>
            )}

            {/* Divider */}
            <div className="border-t border-border/40 px-5 py-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                {isPro && daysLeft !== null && daysLeft <= 7 ? '兑换新邀请码延续访问' : isPro ? '兑换新邀请码' : '输入邀请码'}
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={codeInput}
                  onChange={e => { setCodeInput(e.target.value.toUpperCase()); setCodeError(''); setCodeSuccess(''); }}
                  onKeyDown={e => e.key === 'Enter' && handleRedeemCode()}
                  placeholder="例如：BREW2026"
                  className="flex-1 px-3 py-2 bg-background border border-border/60 rounded-lg text-sm text-foreground placeholder:text-muted-foreground/50 font-mono tracking-wider focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20 transition-colors"
                />
                <button
                  type="button"
                  onClick={handleRedeemCode}
                  disabled={isRedeeming || !codeInput.trim()}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap flex items-center gap-1.5"
                >
                  {isRedeeming ? (
                    <div className="w-4 h-4 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
                  ) : '兑换'}
                </button>
              </div>
              {codeError && <p className="text-xs text-red-400 mt-2">{codeError}</p>}
              {codeSuccess && <p className="text-xs text-primary mt-2">{codeSuccess}</p>}
            </div>
          </div>
        </div>

        {/* Profile Form */}
        <form onSubmit={handleSave} className="space-y-10">
          {/* Message */}
          {message && (
            <div className={`p-4 rounded-lg border ${
              message.type === 'success'
                ? 'bg-primary/10 border-primary/20'
                : 'bg-red-500/10 border-red-500/20'
            }`}>
              <p className={`text-sm text-center ${
                message.type === 'success' ? 'text-primary' : 'text-red-400'
              }`}>
                {message.text}
              </p>
            </div>
          )}

          {/* Name */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-foreground/90 mb-2">昵称</label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setMessage(null); }}
              placeholder="输入你的昵称"
              maxLength={50}
              className="w-full px-4 py-3 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary/50 focus:ring-2 focus:ring-primary/10 outline-none transition-all duration-200"
            />
            <p className="mt-2 text-xs text-muted-foreground">此昵称将用于每日邮件的称呼</p>
          </div>

          {/* Email Preferences */}
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-editorial text-foreground">邮件订阅偏好</h2>
              <p className="text-sm text-muted-foreground mt-1">选择你想接收的报告类型</p>
            </div>

            {prefsLoading ? (
              <div className="p-4 bg-card border border-border/50 rounded-xl flex items-center justify-center py-6">
                <div className="w-5 h-5 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
              </div>
            ) : prefsError || !localPrefs ? (
              <div className="p-4 bg-card border border-border/50 rounded-xl">
                <p className="text-sm text-muted-foreground text-center">无法加载偏好设置</p>
              </div>
            ) : (
              <div className="bg-card border border-border/50 rounded-xl divide-y divide-border/50">
                {PREFERENCE_ITEMS.map(({ key, label, description }) => (
                  <div key={key} className="flex items-center justify-between px-4 py-3.5">
                    <div className="min-w-0 flex-1 mr-4">
                      <p className="text-sm font-medium text-foreground">{label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={localPrefs[key]}
                      aria-label={`${label} ${localPrefs[key] ? '已开启' : '已关闭'}`}
                      disabled={saving}
                      onClick={() => handleToggle(key)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50 disabled:cursor-not-allowed ${
                        localPrefs[key] ? 'bg-primary' : 'bg-zinc-700'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ${
                          localPrefs[key] ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={!hasChanges || saving}
            className="w-full px-4 py-3 bg-primary text-white rounded-lg font-medium text-sm hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none transition-all duration-200 flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                保存中...
              </>
            ) : '保存'}
          </button>
        </form>
      </div>
    </div>
  );
}
