'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import {
  useInvestmentProfile,
  useSaveInvestmentProfile,
} from '@/hooks/queries/use-portfolio';
import PaywallGuard from '@/components/PaywallGuard';
import type { NotifyMode } from '@/lib/api';

const NOTIFY_OPTIONS: {
  value: NotifyMode;
  label: string;
  description: string;
  badge?: string;
}[] = [
  {
    value: 'silent',
    label: '静默',
    description: '不发送任何邮件，自己打开 app 查看',
  },
  {
    value: 'events_only',
    label: '事件触发',
    description: '有事才通知 + 每周体检邮件',
    badge: '推荐',
  },
  {
    value: 'daily',
    label: '每日推送',
    description: '每天早上收到日报 + 所有通知',
  },
];

function SettingsContent() {
  const router = useRouter();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const { data: profile, isLoading: profileLoading } = useInvestmentProfile(
    user?.id,
  );
  const saveProfile = useSaveInvestmentProfile();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login?redirect=/settings');
    }
  }, [authLoading, isAuthenticated, router]);

  if (authLoading || !isAuthenticated || !user) return null;

  const currentMode: NotifyMode = profile?.notify_mode || 'events_only';

  const handleChange = (mode: NotifyMode) => {
    if (mode === currentMode) return;
    saveProfile.mutate({
      userId: user.id,
      data: { notify_mode: mode },
    });
  };

  return (
    <main className="min-h-screen bg-background">
      <section className="border-b border-border/50">
        <div className="max-w-3xl mx-auto px-4 md:px-6 py-8 md:py-12">
          <div className="flex items-center gap-3 animate-fade-in-up">
            <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-primary to-transparent" />
            <span className="text-primary text-xs font-semibold tracking-[0.25em] uppercase">
              Settings
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-editorial text-foreground tracking-tight leading-[1.1] mt-4">
            设置
          </h1>
        </div>
      </section>

      <div className="max-w-3xl mx-auto px-4 md:px-6 py-8">
        {/* Notify Mode */}
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-medium text-foreground">邮件通知</h2>
            <p className="text-sm text-muted-foreground mt-1">
              选择你希望收到邮件的频率
            </p>
          </div>

          {profileLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-16 bg-muted/40 rounded-xl animate-pulse"
                />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {NOTIFY_OPTIONS.map((opt) => {
                const isSelected = currentMode === opt.value;
                const isSavingThis =
                  saveProfile.isPending &&
                  saveProfile.variables?.data?.notify_mode === opt.value;

                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleChange(opt.value)}
                    disabled={saveProfile.isPending}
                    className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-xl border text-left transition-all ${
                      isSelected
                        ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/20'
                        : 'border-border/50 bg-card hover:border-primary/20 hover:bg-card/80'
                    } ${saveProfile.isPending ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                        isSelected
                          ? 'border-primary'
                          : 'border-muted-foreground/30'
                      }`}
                    >
                      {isSelected && (
                        <div className="w-2 h-2 rounded-full bg-primary" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">
                          {opt.label}
                        </span>
                        {opt.badge && (
                          <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-primary">
                            {opt.badge}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {opt.description}
                      </span>
                    </div>
                    {isSavingThis && (
                      <div className="w-4 h-4 border-2 border-primary/40 border-t-primary rounded-full animate-spin flex-shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {saveProfile.isSuccess && (
            <p className="text-xs text-primary animate-fade-in-up">
              已更新，下次邮件将按新设置发送
            </p>
          )}
          {saveProfile.isError && (
            <p className="text-xs text-red-500 animate-fade-in-up">
              更新失败，请重试
            </p>
          )}
        </div>
      </div>
    </main>
  );
}

export default function SettingsPage() {
  return (
    <PaywallGuard requiredFeature="for_you_website">
      <SettingsContent />
    </PaywallGuard>
  );
}
