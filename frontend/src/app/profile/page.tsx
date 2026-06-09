'use client';

import { Suspense, useState, useEffect, useMemo, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useEntitlements } from '@/contexts/EntitlementsContext';
import { api, type EmailPreferences } from '@/lib/api';
import { useEmailPreferences } from '@/hooks/queries/use-preferences';
import { PRICING, STRIPE_LIVE } from '@/lib/pricing';
import { queryKeys } from '@/hooks/queries/query-keys';

const PREFERENCE_ITEMS: { key: keyof EmailPreferences; label: string; description: string; entitlement?: string }[] = [
  { key: 'morning_report', label: '早报', description: '每个交易日早上发送', entitlement: 'morning_report_email' },
  { key: 'daily_report', label: '晚报', description: '每个交易日收盘后发送' },
  { key: 'weekly_report', label: '宏观周报', description: '每周日发送', entitlement: 'weekly_report_email' },
  { key: 'twitter_digest', label: '推特日报', description: '每个交易日盘后发送 · KOL 圈观点摘要', entitlement: 'twitter_digest' },
  // personal_digest is auto-managed: has watchlist + entitlement = receives digest.
  // No toggle needed — users clear their watchlist to stop receiving it.
];

const PREFERENCE_ENTITLEMENTS = new Map(
  PREFERENCE_ITEMS
    .filter((item): item is typeof item & { entitlement: string } => Boolean(item.entitlement))
    .map((item) => [item.key, item.entitlement])
);

const INVITE_DAYS = 14;

type TabId = 'account' | 'subscription' | 'email';

const TABS: { id: TabId; label: string }[] = [
  { id: 'account', label: '账户信息' },
  { id: 'subscription', label: '订阅管理' },
  { id: 'email', label: '邮件偏好' },
];

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

function normalizeEmailPreferences(
  preferences: EmailPreferences | null | undefined,
  hasEntitlement: (feature: string) => boolean
): EmailPreferences | null {
  if (!preferences) return null;

  const normalized = { ...preferences };
  for (const [key, entitlement] of PREFERENCE_ENTITLEMENTS.entries()) {
    if (!hasEntitlement(entitlement)) {
      normalized[key] = false;
    }
  }

  return normalized;
}

function lockedPreferenceLabel(entitlement?: string): string {
  return entitlement === 'twitter_digest' ? '升级 Max 解锁' : '升级 Pro 解锁';
}

export default function ProfilePage(): ReactNode {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-12 h-12 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
      </div>
    }>
      <ProfileContent />
    </Suspense>
  );
}

function ProfileContent(): ReactNode {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { user, isAuthenticated, isLoading, updateProfile } = useAuth();
  const {
    plan, isLoading: subLoading, status,
    currentPeriodEnd, accessExpiresAt,
    openBillingPortal,
    portalError,
  } = useSubscription();
  const { has: hasEntitlement } = useEntitlements();

  const { data: serverPrefs, isLoading: prefsLoading, isError: prefsError } = useEmailPreferences(
    isAuthenticated
  );
  const normalizedServerPrefs = useMemo(
    () => normalizeEmailPreferences(serverPrefs, hasEntitlement),
    [serverPrefs, hasEntitlement]
  );

  // Tab state synced with URL param
  const tabFromUrl = TABS.find(t => t.id === searchParams.get('tab'))?.id ?? 'account';
  const [activeTab, setActiveTab] = useState<TabId>(tabFromUrl);

  useEffect(() => {
    setActiveTab(tabFromUrl);
  }, [tabFromUrl]);

  function switchTab(tab: TabId) {
    setActiveTab(tab);
    const url = tab === 'account' ? '/profile' : `/profile?tab=${tab}`;
    router.replace(url, { scroll: false });
  }

  // Profile form state
  const [name, setName] = useState(user?.name || '');
  const [nameSource, setNameSource] = useState(user?.name || '');
  if ((user?.name || '') !== nameSource) {
    setNameSource(user?.name || '');
    setName(user?.name || '');
  }

  const [localPrefs, setLocalPrefs] = useState<EmailPreferences | null>(normalizedServerPrefs);
  const [prefsSource, setPrefsSource] = useState(normalizedServerPrefs);
  if (normalizedServerPrefs && normalizedServerPrefs !== prefsSource) {
    setPrefsSource(normalizedServerPrefs);
    setLocalPrefs(normalizedServerPrefs);
  }

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Invite code inline state
  const [isPortalLoading, setIsPortalLoading] = useState(false);
  async function handleManageSubscription() {
    setIsPortalLoading(true);
    await openBillingPortal();
    // openBillingPortal redirects on success; reset after timeout if it didn't
    setTimeout(() => setIsPortalLoading(false), 5000);
  }

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

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    if (!nameChanged || saving) return;
    setSaving(true);
    setMessage(null);
    const result = await updateProfile({ name: name.trim() });
    setMessage(result.success
      ? { type: 'success', text: '已保存' }
      : { type: 'error', text: result.error || '保存失败，请重试' }
    );
    setSaving(false);
  }

  const prefsChanged = serverPrefs && localPrefs
    ? PREFERENCE_ITEMS.some(({ key }) => normalizedServerPrefs?.[key] !== localPrefs[key])
    : false;

  function isPreferenceLocked(key: keyof EmailPreferences) {
    const entitlement = PREFERENCE_ENTITLEMENTS.get(key);
    return entitlement ? !hasEntitlement(entitlement) : false;
  }

  function handleToggle(key: keyof EmailPreferences) {
    if (!localPrefs || saving || isPreferenceLocked(key)) return;
    setLocalPrefs({ ...localPrefs, [key]: !localPrefs[key] });
    setMessage(null);
  }

  async function handleSavePrefs(e: React.FormEvent) {
    e.preventDefault();
    if (!prefsChanged || !localPrefs || !normalizedServerPrefs || saving) return;
    setSaving(true);
    setMessage(null);
    const diff: Partial<EmailPreferences> = {};
    for (const { key } of PREFERENCE_ITEMS) {
      if (localPrefs[key] !== normalizedServerPrefs[key]) diff[key] = localPrefs[key];
    }
    try {
      const result = await api.subscriptions.updatePreferences(diff);
      if (result.success) {
        queryClient.setQueryData(queryKeys.subscriptions.preferences(), result.preferences);
        setLocalPrefs(result.preferences);
        setMessage({ type: 'success', text: '已保存' });
      } else {
        setMessage({ type: 'error', text: '偏好保存失败' });
      }
    } catch {
      setMessage({ type: 'error', text: '偏好保存失败' });
    }
    setSaving(false);
  }

  const initials = user.name
    ? user.name.charAt(0).toUpperCase()
    : user.email?.charAt(0).toUpperCase() || 'U';

  // Subscription display logic
  const daysLeft = getDaysLeft(accessExpiresAt);
  const progressPct = daysLeft !== null
    ? Math.round((daysLeft / INVITE_DAYS) * 100)
    : 0;

  const normalizedPlan = plan === 'max' || plan === 'pro' ? plan : 'free';
  const hasActiveAccessStatus = status === 'active' || status === 'trialing';
  const hasActivePlan = hasActiveAccessStatus && normalizedPlan !== 'free' && (daysLeft === null || daysLeft > 0);
  const isDisplayMax = hasActivePlan && normalizedPlan === 'max';
  const isDisplayPro = hasActivePlan && normalizedPlan === 'pro';
  const isPaid = hasActivePlan && daysLeft === null;
  const isPaidPro = isPaid && isDisplayPro;
  const isTrial = hasActivePlan && daysLeft !== null;
  const isCanceled = !hasActivePlan && status === 'canceled';
  const tierLabel = isDisplayMax ? 'Max' : hasActivePlan ? 'Pro' : null;

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
      <div className="max-w-lg mx-auto space-y-8">
        {/* Header */}
        <div className="space-y-2 animate-fade-in-up">
          <h1 className="text-2xl md:text-3xl font-editorial text-foreground tracking-tight leading-[1.1]">个人资料</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">管理你的账户、订阅和邮件偏好</p>
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
              ) : hasActivePlan ? (
                <span className={`shrink-0 inline-block px-1.5 py-0.5 rounded text-micro font-medium uppercase tracking-wide ${
                  isDisplayMax ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20' : 'bg-primary/15 text-primary border border-primary/20'
                }`}>
                  {tierLabel}
                </span>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border/50">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => switchTab(id)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
                activeTab === id
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
              {activeTab === id && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'account' && (
          <form onSubmit={handleSaveName} className="space-y-6">
            {message && (
              <div className={`p-4 rounded-lg border ${
                message.type === 'success'
                  ? 'bg-primary/10 border-primary/20'
                  : 'bg-red-500/10 border-red-500/20'
              }`}>
                <p className={`text-sm text-center ${
                  message.type === 'success' ? 'text-primary' : 'text-red-400'
                }`}>{message.text}</p>
              </div>
            )}

            <div>
              <label htmlFor="name" className="block text-sm font-medium text-foreground mb-2">昵称</label>
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

            <div className="bg-card border border-border/50 rounded-xl p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">邮箱</span>
                <span className="text-foreground font-medium">{user.email}</span>
              </div>
            </div>

            <button
              type="submit"
              disabled={!nameChanged || saving}
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
        )}

        {activeTab === 'subscription' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-editorial text-foreground">订阅状态</h2>
              {subLoading ? (
                <span className="w-12 h-5 rounded-full bg-muted animate-pulse" />
              ) : (
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                  hasActivePlan ? urgencyStyles.badge
                    : isCanceled ? 'bg-amber-400/10 border-amber-400/30 text-amber-400'
                    : 'bg-muted border-border/50 text-muted-foreground'
                }`}>
                  {hasActivePlan ? tierLabel : isCanceled ? '已取消' : '免费版'}
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
              ) : isTrial ? (
                /* ── Active trial ── */
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

                  <div className="h-1.5 bg-background rounded-full overflow-hidden mb-1">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${urgencyStyles.bar}`}
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground/70">
                    <span>{INVITE_DAYS - (daysLeft ?? 0)} 天已用</span>
                    <span>共 {INVITE_DAYS} 天</span>
                  </div>

                  <div className="mt-4 pt-4 border-t border-border/40">
                    {daysLeft !== null && daysLeft <= 7 && (
                      <p className={`text-xs mb-3 ${urgencyStyles.text}`}>
                        {daysLeft <= 3 ? '体验即将到期' : '体验即将结束'}
                      </p>
                    )}
                    <Link
                      href="/pricing"
                      className="block w-full px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors text-center"
                    >
                      升级到 Pro
                    </Link>
                  </div>
                </div>
              ) : isPaid ? (
                /* ── Paid (Pro or Max) ── */
                <div className="p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${isDisplayMax ? 'bg-amber-400/10' : 'bg-primary/10'}`}>
                      <svg className={`w-4 h-4 ${isDisplayMax ? 'text-amber-400' : 'text-primary'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{tierLabel} 会员</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{isDisplayMax ? PRICING.maxPerMonth : PRICING.proPerMonth} · 自动续费</p>
                    </div>
                  </div>

                  <div className="space-y-2.5 mb-4">
                    {currentPeriodEnd && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">下次续费</span>
                        <span className="text-foreground font-medium">{formatDate(currentPeriodEnd)}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">方案</span>
                      <span className="text-foreground font-medium">{tierLabel}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">状态</span>
                      <span className={`font-medium ${isDisplayMax ? 'text-amber-400' : 'text-primary'}`}>活跃</span>
                    </div>
                  </div>

                  {/* Pro users: upgrade to Max CTA */}
                  {isPaidPro && (
                    <Link
                      href="/pricing"
                      className="block w-full px-4 py-2.5 mb-3 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-600/90 transition-colors text-center"
                    >
                      升级到 Max
                    </Link>
                  )}

                  <button
                    type="button"
                    onClick={handleManageSubscription}
                    disabled={isPortalLoading}
                    className="w-full px-4 py-2.5 bg-background border border-border/60 rounded-lg text-sm font-medium text-foreground hover:bg-muted/50 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                  >
                    {isPortalLoading ? (
                      <div className="w-4 h-4 rounded-full border-2 border-foreground/20 border-t-foreground animate-spin" />
                    ) : (
                      <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    )}
                    管理订阅
                  </button>
                  {portalError ? (
                    <p className="text-xs text-red-400 text-center mt-2">{portalError}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground/70 text-center mt-2">修改付款方式、查看账单或取消订阅</p>
                  )}
                </div>
              ) : isCanceled ? (
                /* ── Canceled ── */
                <div className="p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-9 h-9 rounded-full bg-amber-400/10 flex items-center justify-center shrink-0">
                      <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">订阅已取消</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {currentPeriodEnd
                          ? <>权限有效至 <span className="text-foreground">{formatDate(currentPeriodEnd)}</span></>
                          : '你的付费权限已结束'}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={STRIPE_LIVE ? () => router.push('/pricing') : undefined}
                    disabled={!STRIPE_LIVE}
                    className="w-full px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {STRIPE_LIVE ? '查看订阅方案' : '订阅即将开放'}
                  </button>
                </div>
              ) : (
                /* ── Free ── */
                <div className="p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-3-3v6" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">暂无订阅</p>
                      <p className="text-xs text-muted-foreground mt-0.5">升级 Pro 或 Max 解锁更多功能</p>
                    </div>
                  </div>

                  <div className="p-4 bg-background/50 rounded-lg mb-4">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">付费会员权益</p>
                    <ul className="space-y-2.5">
                      {[
                        '每日个性化投研摘要',
                        '盘前早报 & 收盘日报',
                        '宏观周报 & 流动性监控',
                        '个股深度分析',
                      ].map((item) => (
                        <li key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                          <svg className="w-4 h-4 text-primary shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <Link
                    href="/pricing"
                    className="block w-full px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors text-center"
                  >
                    查看方案
                  </Link>
                </div>
              )}

            </div>
          </div>
        )}

        {activeTab === 'email' && (
          <form onSubmit={handleSavePrefs} className="space-y-6">
            {message && (
              <div className={`p-4 rounded-lg border ${
                message.type === 'success'
                  ? 'bg-primary/10 border-primary/20'
                  : 'bg-red-500/10 border-red-500/20'
              }`}>
                <p className={`text-sm text-center ${
                  message.type === 'success' ? 'text-primary' : 'text-red-400'
                }`}>{message.text}</p>
              </div>
            )}

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
              <>
                <div className="bg-card border border-border/50 rounded-xl divide-y divide-border/50">
                  {PREFERENCE_ITEMS.map(({ key, label, description, entitlement }) => {
                    const locked = entitlement ? !hasEntitlement(entitlement) : false;
                    return (
                      <div key={key} className="flex items-center justify-between px-4 py-3.5">
                        <div className="min-w-0 flex-1 mr-4">
                          <p className="text-sm font-medium text-foreground">{label}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {locked ? lockedPreferenceLabel(entitlement) : description}
                          </p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={locked ? false : localPrefs[key]}
                          aria-label={`${label} ${locked ? '需要升级' : localPrefs[key] ? '已开启' : '已关闭'}`}
                          disabled={saving || locked}
                          onClick={() => handleToggle(key)}
                          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50 disabled:cursor-not-allowed ${
                            localPrefs[key] && !locked ? 'bg-primary' : 'bg-zinc-700'
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ${
                              localPrefs[key] && !locked ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>
                    );
                  })}
                </div>

                {hasEntitlement('personal_digest_email') && (
                  <p className="text-xs text-muted-foreground px-1">
                    专属日报根据你的持仓自动发送，如需停止接收请清空持仓列表。
                  </p>
                )}
              </>
            )}

            <button
              type="submit"
              disabled={!prefsChanged || saving}
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
        )}
      </div>
    </div>
  );
}
