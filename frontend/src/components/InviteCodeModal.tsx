'use client';

import { useState } from 'react';
import { useSubscription } from '@/contexts/SubscriptionContext';

interface InviteCodeModalProps {
  onClose: () => void;
}

export default function InviteCodeModal({ onClose }: InviteCodeModalProps) {
  const { redeemInviteCode } = useSubscription();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ accessExpiresAt: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;

    setLoading(true);
    setError(null);

    const result = await redeemInviteCode(code.trim());

    setLoading(false);

    if (!result.success) {
      setError(result.error || '兑换失败');
    } else {
      setSuccess({ accessExpiresAt: result.accessExpiresAt || '' });
    }
  };

  const formatExpiry = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
    } catch {
      return iso;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md terminal-card p-6 shadow-2xl">
        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="关闭"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {success ? (
          /* Success screen */
          <div className="text-center space-y-5">
            <div className="w-14 h-14 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
              <svg className="w-7 h-7 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>

            <div>
              <h2 className="text-xl font-editorial text-foreground mb-1">兑换成功</h2>
              {success.accessExpiresAt && (
                <p className="text-sm text-muted-foreground">
                  Pro 访问有效期至 <span className="text-foreground">{formatExpiry(success.accessExpiresAt)}</span>
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-full px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              开始使用
            </button>
          </div>
        ) : (
          /* Input screen */
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-editorial text-foreground mb-1">兑换邀请码</h2>
              <p className="text-sm text-muted-foreground">
                输入邀请码，立即获得 14 天 Pro 免费访问
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <input
                  type="text"
                  value={code}
                  onChange={e => setCode(e.target.value.toUpperCase())}
                  placeholder="例如：BREW2024"
                  className="w-full px-4 py-3 rounded-lg bg-background border border-border/60 text-foreground placeholder:text-muted-foreground/50 font-mono text-sm focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30 transition-colors"
                  disabled={loading}
                  autoFocus
                />
                {error && (
                  <p className="mt-2 text-sm text-red-400">{error}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading || !code.trim()}
                className="w-full px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <svg aria-hidden="true" className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span>兑换中...</span>
                  </>
                ) : (
                  '兑换'
                )}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
