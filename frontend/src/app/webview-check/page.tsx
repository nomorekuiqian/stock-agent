'use client';

/**
 * WebView 登录态诊断页
 *
 * 用于微信小程序 web-view PoC：在 web-view 里加载此页面，直观查看：
 *   1. document.cookie 里能读到什么（第一方 non-httpOnly cookie）
 *   2. /api/auth/session 返回的登录态（依赖 httpOnly 的 app_access_token / app_refresh_token）
 *   3. User-Agent，用于判断是否真的跑在微信 web-view 里
 *   4. 基本的 storage 可用性
 *
 * httpOnly cookie 读不到是正常的 —— 它们只能由服务端访问。
 * 如果 /api/auth/session 返回 user 不为 null，说明 httpOnly cookie 正常送达 server action。
 *
 * ⚠️ 只做诊断用途，不在受保护路由里，不做任何鉴权。
 */

import { useEffect, useState } from 'react';

type SessionResponse = {
  user: { id: string; email: string; name?: string | null } | null;
  accessToken: string | null;
};

type DiagnoseState = {
  loading: boolean;
  userAgent: string;
  isWeChat: boolean;
  isMiniProgramWebView: boolean;
  href: string;
  cookieString: string;
  cookieCount: number;
  hasFirstPartyAuthCookie: boolean;
  localStorageOk: boolean;
  sessionStorageOk: boolean;
  sessionStatus: number | null;
  sessionJson: SessionResponse | null;
  sessionError: string | null;
  fetchedAt: string;
};

const INITIAL: DiagnoseState = {
  loading: true,
  userAgent: '',
  isWeChat: false,
  isMiniProgramWebView: false,
  href: '',
  cookieString: '',
  cookieCount: 0,
  hasFirstPartyAuthCookie: false,
  localStorageOk: false,
  sessionStorageOk: false,
  sessionStatus: null,
  sessionJson: null,
  sessionError: null,
  fetchedAt: '',
};

function probeStorage(store: Storage | undefined): boolean {
  if (!store) return false;
  try {
    const key = '__webview_probe__';
    store.setItem(key, '1');
    const v = store.getItem(key);
    store.removeItem(key);
    return v === '1';
  } catch {
    return false;
  }
}

export default function WebViewCheckPage() {
  const [state, setState] = useState<DiagnoseState>(INITIAL);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
      const cookie = typeof document !== 'undefined' ? document.cookie : '';
      // 注意：middleware 会把 insforge_csrf_token 写成 first-party 非 httpOnly cookie,
      //       但 app_access_token / app_refresh_token 是 httpOnly, document.cookie 读不到。
      //       这里只用来观察非 httpOnly cookie 的存活状况。
      const cookieCount = cookie ? cookie.split(';').filter(Boolean).length : 0;
      const hasFirstPartyAuthCookie = /insforge_csrf_token=/.test(cookie);

      let sessionStatus: number | null = null;
      let sessionJson: SessionResponse | null = null;
      let sessionError: string | null = null;
      try {
        const res = await fetch('/api/auth/session', { credentials: 'include' });
        sessionStatus = res.status;
        if (res.ok) {
          sessionJson = await res.json();
        } else {
          sessionError = `HTTP ${res.status}`;
        }
      } catch (err) {
        sessionError = err instanceof Error ? err.message : String(err);
      }

      if (cancelled) return;

      setState({
        loading: false,
        userAgent: ua,
        isWeChat: /MicroMessenger/i.test(ua),
        isMiniProgramWebView: /miniProgram/i.test(ua),
        href: typeof window !== 'undefined' ? window.location.href : '',
        cookieString: cookie,
        cookieCount,
        hasFirstPartyAuthCookie,
        localStorageOk: probeStorage(typeof window !== 'undefined' ? window.localStorage : undefined),
        sessionStorageOk: probeStorage(typeof window !== 'undefined' ? window.sessionStorage : undefined),
        sessionStatus,
        sessionJson,
        sessionError,
        fetchedAt: new Date().toISOString(),
      });
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="min-h-screen bg-white px-4 py-6 text-slate-900">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-xl font-semibold">WebView 登录态诊断</h1>
        <p className="mt-1 text-sm text-slate-500">
          此页面只做只读诊断。用于在微信小程序 web-view PoC 中确认第一方 cookie / session 是否存活。
        </p>

        {state.loading ? (
          <p className="mt-6 text-slate-500">加载中…</p>
        ) : (
          <div className="mt-6 space-y-5 text-sm">
            <Section title="登录态（基于 httpOnly cookie）">
              <Row label="/api/auth/session 状态码" value={state.sessionStatus ?? '—'} />
              <Row
                label="已登录用户"
                value={state.sessionJson?.user ? `${state.sessionJson.user.email} (${state.sessionJson.user.id.slice(0, 8)}…)` : '未登录'}
                highlight={!!state.sessionJson?.user}
              />
              <Row
                label="access token 可用"
                value={state.sessionJson?.accessToken ? '是' : '否'}
                highlight={!!state.sessionJson?.accessToken}
              />
              {state.sessionError && (
                <Row label="session 错误" value={state.sessionError} error />
              )}
            </Section>

            <Section title="运行环境">
              <Row
                label="微信"
                value={state.isWeChat ? '是' : '否'}
                highlight={state.isWeChat}
              />
              <Row
                label="小程序 web-view"
                value={state.isMiniProgramWebView ? '是' : '否'}
                highlight={state.isMiniProgramWebView}
              />
              <Row label="当前 URL" value={state.href} mono />
              <Row label="User-Agent" value={state.userAgent} mono small />
            </Section>

            <Section title="非 httpOnly cookie（document.cookie 可读部分）">
              <Row label="cookie 数量" value={state.cookieCount} />
              <Row
                label="insforge_csrf_token"
                value={state.hasFirstPartyAuthCookie ? '存在' : '不存在'}
                highlight={state.hasFirstPartyAuthCookie}
              />
              <Row label="cookie 原文" value={state.cookieString || '(空)'} mono small />
              <p className="mt-2 text-xs text-slate-500">
                说明：<code>app_access_token</code> 和 <code>app_refresh_token</code> 是
                httpOnly，<code>document.cookie</code> 永远读不到，但它们会随 fetch 送到
                <code>/api/auth/session</code>。只要上面的「登录态」部分显示已登录，就说明 httpOnly cookie 正常送达。
              </p>
            </Section>

            <Section title="存储能力">
              <Row label="localStorage 可用" value={state.localStorageOk ? '是' : '否'} highlight={state.localStorageOk} />
              <Row label="sessionStorage 可用" value={state.sessionStorageOk ? '是' : '否'} highlight={state.sessionStorageOk} />
            </Section>

            <Section title="元信息">
              <Row label="采样时间" value={state.fetchedAt} mono small />
            </Section>

            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 w-full rounded-md bg-emerald-600 px-4 py-2 text-white"
            >
              重新采样
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <h2 className="mb-2 text-base font-medium">{title}</h2>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({
  label,
  value,
  highlight,
  error,
  mono,
  small,
}: {
  label: string;
  value: string | number;
  highlight?: boolean;
  error?: boolean;
  mono?: boolean;
  small?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="shrink-0 text-slate-500">{label}</span>
      <span
        className={[
          'text-right',
          mono ? 'font-mono' : '',
          small ? 'text-xs' : '',
          highlight ? 'font-medium text-emerald-700' : '',
          error ? 'text-red-600' : '',
          'break-all',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {String(value)}
      </span>
    </div>
  );
}
