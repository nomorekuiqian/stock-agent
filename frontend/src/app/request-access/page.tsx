'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

export default function RequestAccessPage(): ReactNode {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !reason.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE_URL}/invites/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), reason: reason.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.detail === 'email_send_failed' ? '邮件发送失败，请稍后再试' : '申请失败，请稍后再试');
      } else {
        setSubmitted(true);
      }
    } catch {
      setError('网络错误，请检查连接后重试');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
            <svg className="w-8 h-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-editorial text-foreground mb-2">邀请码已发送</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              请查收 <span className="text-foreground font-medium">{email}</span> 的邮件，
              邀请码和使用说明已发送至该地址。
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            没有收到？请检查垃圾邮件文件夹，或
            <button
              type="button"
              onClick={() => setSubmitted(false)}
              className="text-primary hover:text-primary/80 transition-colors ml-1"
            >
              重新申请
            </button>
          </p>
          <Link
            href="/"
            className="inline-block text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            返回首页
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="mb-8">
          <Link href="/" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            ← 返回
          </Link>
        </div>

        <div className="space-y-2 mb-8">
          <h1 className="text-2xl font-editorial text-foreground">申请访问</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            填写以下信息，我们会将邀请码发送到你的邮箱，解锁 14 天 Pro 免费体验。
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-foreground/90 mb-2">
              姓名
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(null); }}
              placeholder="你的姓名"
              maxLength={50}
              required
              className="w-full px-4 py-3 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary/50 focus:ring-2 focus:ring-primary/10 outline-none transition-all duration-200"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-foreground/90 mb-2">
              邮箱
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(null); }}
              placeholder="your@email.com"
              required
              className="w-full px-4 py-3 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary/50 focus:ring-2 focus:ring-primary/10 outline-none transition-all duration-200"
            />
          </div>

          <div>
            <label htmlFor="reason" className="block text-sm font-medium text-foreground/90 mb-2">
              为什么对 TheMarketBrew 感兴趣？
            </label>
            <textarea
              id="reason"
              value={reason}
              onChange={(e) => { setReason(e.target.value); setError(null); }}
              placeholder="简单说说你的投资背景或使用场景..."
              rows={3}
              maxLength={500}
              required
              className="w-full px-4 py-3 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary/50 focus:ring-2 focus:ring-primary/10 outline-none transition-all duration-200 resize-none"
            />
          </div>

          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !name.trim() || !email.trim() || !reason.trim()}
            className="w-full px-4 py-3 bg-primary text-primary-foreground rounded-lg font-medium text-sm hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none transition-all duration-200 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                发送中...
              </>
            ) : '申请邀请码'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          已有邀请码？
          <Link href="/login" className="text-primary hover:text-primary/80 transition-colors ml-1">
            登录并兑换
          </Link>
        </p>
      </div>
    </div>
  );
}
