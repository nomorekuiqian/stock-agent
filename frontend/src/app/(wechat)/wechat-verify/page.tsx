'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

type VerifyState =
  | 'verifying'
  | 'success'
  | 'error_expired'
  | 'error_used'
  | 'error_invalid'
  | 'error_no_token';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

async function confirmOtp(
  token: string
): Promise<{ success: boolean; account_state?: string; error?: string }> {
  const res = await fetch(`${API_BASE}/wechat/register/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ otp_token: token }),
  });
  if (res.ok) {
    return res.json();
  }
  const body = await res.json().catch(() => ({}));
  return { success: false, error: body.detail ?? '验证失败' };
}

function tryRedirectToMiniProgram(): boolean {
  if (typeof window === 'undefined') return false;
  if ((window as any).__wxjs_environment !== 'miniprogram') return false;
  const wx = (window as any).wx;
  if (!wx?.miniProgram) return false;
  wx.miniProgram.redirectTo({ url: '/pages/login/login?verified=1' });
  return true;
}

function WechatVerifyContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('t');
  const [state, setState] = useState<VerifyState>('verifying');
  const [redirected, setRedirected] = useState(false);

  useEffect(() => {
    if (!token) {
      setState('error_no_token');
      return;
    }

    confirmOtp(token)
      .then((result) => {
        if (result.success) {
          setState('success');
          setRedirected(tryRedirectToMiniProgram());
        } else {
          const err = result.error ?? '';
          if (err.includes('过期')) setState('error_expired');
          else if (err.includes('已使用')) setState('error_used');
          else setState('error_invalid');
        }
      })
      .catch(() => {
        setState('error_invalid');
      });
  }, [token]);

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-6">
      <div className="max-w-sm w-full text-center space-y-6">
        {/* Logo */}
        <div className="flex justify-center gap-1.5 items-end h-10 mb-2">
          <div className="w-1.5 h-6 rounded-full bg-gradient-to-t from-emerald-600 to-emerald-400" />
          <div className="w-1.5 h-10 rounded-full bg-gradient-to-t from-emerald-600 to-emerald-400" />
          <div className="w-1.5 h-4 rounded-full bg-gradient-to-t from-emerald-600 to-emerald-400" />
          <div className="w-1.5 h-7 rounded-full bg-gradient-to-t from-emerald-600 to-emerald-400" />
        </div>
        <p className="text-xs tracking-widest text-emerald-500 font-medium uppercase">
          TheMarketBrew
        </p>

        {state === 'verifying' && (
          <>
            <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-white text-lg font-medium">正在验证邮箱...</p>
          </>
        )}

        {state === 'success' && (
          <>
            <div className="w-16 h-16 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto">
              <svg
                className="w-8 h-8 text-emerald-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="text-white text-xl font-semibold">验证成功</p>
              <p className="text-gray-400 text-sm mt-2">
                {redirected
                  ? '正在返回小程序...'
                  : '请返回小程序，点击"我已完成验证"继续'}
              </p>
            </div>
          </>
        )}

        {state === 'error_expired' && (
          <>
            <div className="w-16 h-16 rounded-full bg-red-500/15 flex items-center justify-center mx-auto">
              <svg
                className="w-8 h-8 text-red-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div>
              <p className="text-white text-xl font-semibold">链接已过期</p>
              <p className="text-gray-400 text-sm mt-2">
                验证链接仅 5 分钟有效，请返回小程序重新发送
              </p>
            </div>
          </>
        )}

        {state === 'error_used' && (
          <>
            <div className="w-16 h-16 rounded-full bg-yellow-500/15 flex items-center justify-center mx-auto">
              <svg
                className="w-8 h-8 text-yellow-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div>
              <p className="text-white text-xl font-semibold">链接已使用</p>
              <p className="text-gray-400 text-sm mt-2">
                此验证链接已完成过验证，请返回小程序
              </p>
            </div>
          </>
        )}

        {(state === 'error_invalid' || state === 'error_no_token') && (
          <>
            <div className="w-16 h-16 rounded-full bg-red-500/15 flex items-center justify-center mx-auto">
              <svg
                className="w-8 h-8 text-red-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div>
              <p className="text-white text-xl font-semibold">链接无效</p>
              <p className="text-gray-400 text-sm mt-2">
                请确认邮件链接完整，或返回小程序重新发送
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function WechatVerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-black flex items-center justify-center p-6">
          <div className="text-center space-y-4">
            <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-white">加载中...</p>
          </div>
        </div>
      }
    >
      <WechatVerifyContent />
    </Suspense>
  );
}
