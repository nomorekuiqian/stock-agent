'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { LogIn, LogOut, RefreshCw, UserPlus } from 'lucide-react';
import { useAuth, type User } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { ResearchWorkspace } from '@/app/research/page';

const PANDA_REDIRECT = '/panda';
const LOGIN_URL = `/login?redirect=${encodeURIComponent(PANDA_REDIRECT)}`;
const SIGNUP_URL = `/login?mode=signup&redirect=${encodeURIComponent(PANDA_REDIRECT)}`;
const PANDA_PRODUCT_NAME = '潘大科技圈专属投研助手';
const PANDA_AVATAR_SRC = '/kol-avatars/pandacircle.png';

function formatAccessError(err: unknown): string {
  if (!(err instanceof Error)) {
    return `无法读取 ${PANDA_PRODUCT_NAME} 权限`;
  }

  const message = err.message.trim();
  const lowerMessage = message.toLowerCase();
  if (
    lowerMessage.includes('failed to fetch') ||
    lowerMessage.includes('networkerror') ||
    lowerMessage.includes('network error')
  ) {
    return '暂时无法连接权限服务，请稍后重试。';
  }

  return message || `无法读取 ${PANDA_PRODUCT_NAME} 权限`;
}

function PandaGateHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3">
      <Image
        src={PANDA_AVATAR_SRC}
        alt="潘大头像"
        width={56}
        height={56}
        className="h-14 w-14 shrink-0 rounded-full border border-border object-cover"
        priority
      />
      <div className="min-w-0">
        <div className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
          潘大科技圈
        </div>
        <h1 className="mt-2 text-2xl font-editorial leading-tight text-foreground">
          {title}
        </h1>
      </div>
    </div>
  );
}

function PandaTopNav({
  user,
  email,
  isSigningOut,
  signOutError,
  onSignOut,
}: {
  user: User;
  email: string | null;
  isSigningOut: boolean;
  signOutError: string | null;
  onSignOut: () => void | Promise<void>;
}) {
  const displayEmail = email || user.email;
  const displayName = user.name?.trim() || displayEmail.split('@')[0] || '当前账号';

  return (
    <header className="fixed inset-x-0 top-0 z-[70] h-16 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between gap-3 px-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Image
            src={PANDA_AVATAR_SRC}
            alt="潘大头像"
            width={36}
            height={36}
            className="h-9 w-9 shrink-0 rounded-full border border-border object-cover"
            priority
          />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-foreground">
              潘大科技圈
            </div>
            <div className="truncate text-xs text-muted-foreground">
              专属投研助手
            </div>
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-2">
          <div className="hidden min-w-0 text-right sm:block">
            <div className="truncate text-xs font-medium text-foreground">
              {displayName}
            </div>
            <div className="max-w-[220px] truncate text-xs text-muted-foreground">
              {displayEmail}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void onSignOut()}
            disabled={isSigningOut}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSigningOut ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <LogOut className="h-3.5 w-3.5" aria-hidden />
            )}
            退出登录
          </button>
        </div>
      </div>
      {signOutError ? (
        <div className="absolute right-3 top-full mt-2 rounded-md border border-destructive/30 bg-background px-3 py-2 text-xs text-destructive shadow-lg">
          {signOutError}
        </div>
      ) : null}
    </header>
  );
}

function PandaBrandNav() {
  return (
    <header className="fixed inset-x-0 top-0 z-[70] h-16 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-full max-w-7xl items-center px-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Image
            src={PANDA_AVATAR_SRC}
            alt="潘大头像"
            width={36}
            height={36}
            className="h-9 w-9 shrink-0 rounded-full border border-border object-cover"
            priority
          />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-foreground">
              潘大科技圈
            </div>
            <div className="truncate text-xs text-muted-foreground">
              专属投研助手
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

export default function PandaPage() {
  const { isLoading: authLoading, user, signOut } = useAuth();
  const [accessLoading, setAccessLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  const [accessEmail, setAccessEmail] = useState<string | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [checkedUserId, setCheckedUserId] = useState<string | null>(null);
  const [accessCheckAttempt, setAccessCheckAttempt] = useState(0);
  const [didSignOut, setDidSignOut] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      return;
    }
    if (didSignOut) return;

    let cancelled = false;
    api.communityPanda.me()
      .then((status) => {
        if (cancelled) return;
        setHasAccess(status.has_access);
        setAccessEmail(status.email);
        setAccessError(null);
        setCheckedUserId(user.id);
      })
      .catch((err) => {
        if (cancelled) return;
        setAccessError(formatAccessError(err));
        setAccessEmail(user.email ?? null);
        setHasAccess(false);
        setCheckedUserId(user.id);
      })
      .finally(() => {
        if (!cancelled) setAccessLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessCheckAttempt, authLoading, didSignOut, user]);

  function retryAccessCheck() {
    setAccessLoading(true);
    setAccessError(null);
    setCheckedUserId(null);
    setAccessCheckAttempt((attempt) => attempt + 1);
  }

  async function handleSignOut() {
    setIsSigningOut(true);
    setSignOutError(null);
    const result = await signOut();
    setIsSigningOut(false);
    if (!result.success) {
      setSignOutError(result.error || '退出登录失败，请稍后再试');
      return;
    }
    setDidSignOut(true);
    setHasAccess(false);
    setAccessEmail(null);
    setAccessError(null);
    setCheckedUserId(null);
  }

  if (authLoading) {
    return (
      <main className="min-h-screen bg-background px-4 pb-8 pt-24">
        <PandaBrandNav />
        <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" aria-hidden />
            正在检查登录状态
          </div>
        </div>
      </main>
    );
  }

  if (didSignOut || !user) {
    const reloginOnly = didSignOut;
    return (
      <main className="min-h-screen bg-background px-4 pb-8 pt-24">
        <PandaBrandNav />
        <div className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-xl flex-col justify-center">
          <div className="rounded-lg border border-border bg-card p-5">
            <PandaGateHeader title={reloginOnly ? '你已退出登录' : `欢迎使用 ${PANDA_PRODUCT_NAME}`} />
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {reloginOnly
                ? '重新登录后，系统会再次检查你的潘大科技圈专属访问权限。'
                : '请使用你在潘大知识星球评论区填写的邮箱登录或注册。登录后系统会自动检查你的专属访问权限。'}
            </p>
            <div className={reloginOnly ? 'mt-5' : 'mt-5 grid gap-2 sm:grid-cols-2'}>
              <a
                href={LOGIN_URL}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <LogIn className="h-4 w-4" aria-hidden />
                {reloginOnly ? '重新登录' : '登录'}
              </a>
              {!reloginOnly && (
                <a
                  href={SIGNUP_URL}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                >
                  <UserPlus className="h-4 w-4" aria-hidden />
                  注册
                </a>
              )}
            </div>
            {!reloginOnly && (
              <p className="mt-4 text-xs leading-5 text-muted-foreground">
                如果你已经在知识星球留下邮箱，但登录后仍显示未开通，请确认登录邮箱和评论区填写邮箱完全一致。
              </p>
            )}
          </div>
        </div>
      </main>
    );
  }

  if (accessLoading || checkedUserId !== user.id) {
    return (
      <main className="min-h-screen bg-background px-4 pb-8 pt-24">
        <PandaTopNav
          user={user}
          email={accessEmail}
          isSigningOut={isSigningOut}
          signOutError={signOutError}
          onSignOut={handleSignOut}
        />
        <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" aria-hidden />
            正在验证访问权限
          </div>
        </div>
      </main>
    );
  }

  if (accessError) {
    return (
      <main className="min-h-screen bg-background px-4 pb-8 pt-24">
        <PandaTopNav
          user={user}
          email={accessEmail}
          isSigningOut={isSigningOut}
          signOutError={signOutError}
          onSignOut={handleSignOut}
        />
        <div className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-xl flex-col justify-center">
          <div className="rounded-lg border border-border bg-card p-5">
            <PandaGateHeader title="暂时无法验证访问权限" />
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              你当前登录的邮箱是 {accessEmail || user?.email || '未知邮箱'}。系统还没有确认这个账号是否已开通，请稍后重试。
            </p>
            <p className="mt-3 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {accessError}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={retryAccessCheck}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <RefreshCw className="h-4 w-4" aria-hidden />
                重试验证
              </button>
              <button
                type="button"
                onClick={() => void handleSignOut()}
                className="inline-flex h-10 items-center gap-2 rounded-md border border-border px-3 text-sm text-foreground transition-colors hover:bg-muted"
              >
                <LogOut className="h-4 w-4" aria-hidden />
                切换账号
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (!hasAccess) {
    return (
      <main className="min-h-screen bg-background px-4 pb-8 pt-24">
        <PandaTopNav
          user={user}
          email={accessEmail}
          isSigningOut={isSigningOut}
          signOutError={signOutError}
          onSignOut={handleSignOut}
        />
        <div className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-xl flex-col justify-center">
          <div className="rounded-lg border border-border bg-card p-5">
            <PandaGateHeader title="当前账号未开通" />
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              你当前登录的邮箱是 {accessEmail || user?.email || '未知邮箱'}。请确认你在潘大知识星球报名评论中填写的是同一个邮箱。
            </p>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="mt-5 inline-flex h-10 items-center gap-2 rounded-md border border-border px-3 text-sm text-foreground transition-colors hover:bg-muted"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              切换账号
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <>
      <ResearchWorkspace
        variant="community_panda"
        storageKey="panda_research_state"
        conversationScope="community_panda"
        defaultPersonaUsername="pandacircle"
        lockedPersonaUsername="pandacircle"
        personaScope="community_panda"
        allowDefaultAssistant={false}
        showPersonaUpsell={false}
      />
      <PandaTopNav
        user={user}
        email={accessEmail}
        isSigningOut={isSigningOut}
        signOutError={signOutError}
        onSignOut={handleSignOut}
      />
    </>
  );
}
