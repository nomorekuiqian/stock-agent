'use client';

import { useState, useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { api, type EmailPreferences } from '@/lib/api';
import { useEmailPreferences } from '@/hooks/queries/use-preferences';
import { queryKeys } from '@/hooks/queries/query-keys';

const PREFERENCE_ITEMS: { key: keyof EmailPreferences; label: string; description: string }[] = [
  { key: 'morning_report', label: '早报', description: '每个交易日早上发送' },
  { key: 'daily_report', label: '晚报', description: '每个交易日收盘后发送' },
  { key: 'weekly_report', label: '宏观周报', description: '每周日发送' },
  { key: 'personal_digest', label: '专属日报', description: '根据你的持仓每日定制' },
];

export default function ProfilePage(): ReactNode {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isAuthenticated, isLoading, updateProfile } = useAuth();

  // Fetch preferences via React Query (cached 5min)
  const { data: serverPrefs, isLoading: prefsLoading, isError: prefsError } = useEmailPreferences(
    isAuthenticated
  );

  // Profile state — initialize from user/server data, reset when source changes
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

  // Form state
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Auth guard
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

    // Save name if changed
    if (nameChanged) {
      results.push(await updateProfile({ name: name.trim() }));
    }

    // Save preferences if changed
    if (prefsChanged && localPrefs && serverPrefs) {
      const diff: Partial<EmailPreferences> = {};
      for (const { key } of PREFERENCE_ITEMS) {
        if (localPrefs[key] !== serverPrefs[key]) {
          diff[key] = localPrefs[key];
        }
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
    if (failed) {
      setMessage({ type: 'error', text: failed.error || '保存失败，请重试' });
    } else {
      setMessage({ type: 'success', text: '已保存' });
    }

    setSaving(false);
  }

  const initials = user.name
    ? user.name.charAt(0).toUpperCase()
    : user.email?.charAt(0).toUpperCase() || 'U';

  return (
    <div className="min-h-screen bg-background py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-lg mx-auto">
        <form onSubmit={handleSave} className="space-y-10">
          {/* Header */}
          <div className="space-y-2">
            <h1 className="text-2xl font-editorial text-foreground tracking-tight">
              个人资料
            </h1>
            <p className="text-sm text-muted-foreground">
              管理你的账户信息和邮件偏好
            </p>
          </div>

          {/* Avatar + Email */}
          <div className="flex items-center gap-4 p-4 bg-card border border-border/50 rounded-xl">
            <div className="w-12 h-12 rounded-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/30 border border-primary/30">
              <span className="text-lg font-semibold text-primary">{initials}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground truncate">
                {user.name || '未设置昵称'}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {user.email}
              </p>
            </div>
          </div>

          {/* Message */}
          {message && (
            <div className={`p-4 rounded-lg border animate-scale-in ${
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
            <label htmlFor="name" className="block text-sm font-medium text-foreground/90 mb-2">
              昵称
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setMessage(null); }}
              placeholder="输入你的昵称"
              maxLength={50}
              className="w-full px-4 py-3 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary/50 focus:ring-2 focus:ring-primary/10 outline-none transition-all duration-200"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              此昵称将用于每日邮件的称呼
            </p>
          </div>

          {/* Email Preferences */}
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-editorial text-foreground">邮件订阅偏好</h2>
              <p className="text-sm text-muted-foreground mt-1">选择你想接收的报告类型</p>
            </div>

            {prefsLoading ? (
              <div className="p-4 bg-card border border-border/50 rounded-xl">
                <div className="flex items-center justify-center py-4">
                  <div className="w-5 h-5 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
                </div>
              </div>
            ) : prefsError || !localPrefs ? (
              <div className="p-4 bg-card border border-border/50 rounded-xl">
                <p className="text-sm text-muted-foreground text-center">
                  无法加载偏好设置
                </p>
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

          {/* Single Save Button */}
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
