'use client';

import { useState, useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import type { User } from '@/lib/auth';

function ProfileForm({ user, onUpdateProfile }: {
  user: User;
  onUpdateProfile: (profile: { name?: string }) => Promise<{ success: boolean; error?: string }>;
}) {
  const [name, setName] = useState(user.name || '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const hasChanges = name.trim() !== (user.name || '');

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!hasChanges || saving) return;

    setSaving(true);
    setMessage(null);

    const result = await onUpdateProfile({ name: name.trim() });

    if (result.success) {
      setMessage({ type: 'success', text: '昵称已更新' });
    } else {
      setMessage({ type: 'error', text: result.error || '更新失败，请重试' });
    }

    setSaving(false);
  }

  const initials = user.name
    ? user.name.charAt(0).toUpperCase()
    : user.email?.charAt(0).toUpperCase() || 'U';

  return (
    <div className="max-w-lg mx-auto space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-2xl font-editorial text-foreground tracking-tight">
          个人资料
        </h1>
        <p className="text-sm text-muted-foreground">
          管理你的账户信息
        </p>
      </div>

      {/* Avatar + Email (read-only) */}
      <div className="flex items-center gap-4 p-4 bg-card border border-border/50 rounded-xl">
        <div className="w-12 h-12 rounded-full flex items-center justify-center bg-gradient-to-br from-emerald-500/20 to-emerald-600/30 border border-emerald-500/30">
          <span className="text-lg font-semibold text-emerald-400">{initials}</span>
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
            ? 'bg-emerald-500/10 border-emerald-500/20'
            : 'bg-red-500/10 border-red-500/20'
        }`}>
          <p className={`text-sm text-center ${
            message.type === 'success' ? 'text-emerald-400' : 'text-red-400'
          }`}>
            {message.text}
          </p>
        </div>
      )}

      {/* Edit Form */}
      <form onSubmit={handleSave} className="space-y-6">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-foreground/90 mb-2">
            昵称
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setMessage(null);
            }}
            placeholder="输入你的昵称"
            maxLength={50}
            className="w-full px-4 py-3 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/10 outline-none transition-all duration-200"
          />
          <p className="mt-2 text-xs text-muted-foreground">
            此昵称将用于每日邮件的称呼
          </p>
        </div>

        <button
          type="submit"
          disabled={!hasChanges || saving}
          className="w-full px-4 py-3 bg-emerald-600 text-white rounded-lg font-medium text-sm hover:bg-emerald-500 hover:shadow-lg hover:shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none transition-all duration-200 flex items-center justify-center gap-2"
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
  );
}

export default function ProfilePage(): ReactNode {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, updateProfile } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login?redirect=/profile');
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || !isAuthenticated || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-12 h-12 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-16 px-4 sm:px-6 lg:px-8">
      <ProfileForm user={user} onUpdateProfile={updateProfile} />
    </div>
  );
}
