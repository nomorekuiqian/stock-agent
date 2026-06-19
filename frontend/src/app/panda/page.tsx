'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { LogIn, LogOut, RefreshCw, UserPlus } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
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

export default function PandaPage() {
  const { isLoading: authLoading, user, signOut } = useAuth();
  const [accessLoading, setAccessLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  const [accessEmail, setAccessEmail] = useState<string | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [checkedUserId, setCheckedUserId] = useState<string | null>(null);
  const [accessCheckAttempt, setAccessCheckAttempt] = useState(0);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      return;
    }

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
  }, [accessCheckAttempt, authLoading, user]);

  function retryAccessCheck() {
    setAccessLoading(true);
    setAccessError(null);
    setCheckedUserId(null);
    setAccessCheckAttempt((attempt) => attempt + 1);
  }

  if (authLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" aria-hidden />
          正在检查登录状态
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-background px-4 py-8">
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-xl flex-col justify-center">
          <div className="rounded-lg border border-border bg-card p-5">
            <PandaGateHeader title={`欢迎使用 ${PANDA_PRODUCT_NAME}`} />
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              请使用你在潘大知识星球评论区填写的邮箱登录或注册。登录后系统会自动检查你的专属访问权限。
            </p>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <a
                href={LOGIN_URL}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <LogIn className="h-4 w-4" aria-hidden />
                登录
              </a>
              <a
                href={SIGNUP_URL}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                <UserPlus className="h-4 w-4" aria-hidden />
                注册
              </a>
            </div>
            <p className="mt-4 text-xs leading-5 text-muted-foreground">
              如果你已经在知识星球留下邮箱，但登录后仍显示未开通，请确认登录邮箱和评论区填写邮箱完全一致。
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (accessLoading || checkedUserId !== user.id) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" aria-hidden />
          正在验证访问权限
        </div>
      </main>
    );
  }

  if (accessError) {
    return (
      <main className="min-h-screen bg-background px-4 py-8">
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-xl flex-col justify-center">
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
                onClick={() => void signOut()}
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
      <main className="min-h-screen bg-background px-4 py-8">
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-xl flex-col justify-center">
          <div className="rounded-lg border border-border bg-card p-5">
            <PandaGateHeader title="当前账号未开通" />
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              你当前登录的邮箱是 {accessEmail || user?.email || '未知邮箱'}。请确认你在潘大知识星球报名评论中填写的是同一个邮箱。
            </p>
            <button
              type="button"
              onClick={() => void signOut()}
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
    <ResearchWorkspace
      variant="community_panda"
      storageKey="panda_research_state"
      conversationScope="community_panda"
      defaultPersonaUsername="pandacircle"
      lockedPersonaUsername="pandacircle"
      personaScope="community_panda"
      allowDefaultAssistant={false}
      showPersonaUpsell={false}
      useFullViewport
    />
  );
}
