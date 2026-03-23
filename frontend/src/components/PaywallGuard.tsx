'use client';

import { ReactNode, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';

const PAYWALL_ENABLED = process.env.NEXT_PUBLIC_ENABLE_PAYWALL === 'true';
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

const BACKGROUND_OPTIONS = [
  '散户投资者',
  '专业投资者 / 交易员',
  '金融从业者',
  '学生 / 研究员',
  '其他',
];

const FEATURE_OPTIONS = [
  '市场日报',
  '盘前早报',
  '个性化日报',
  '个股深度分析',
  '宏观仪表盘',
  'AI 选股助手',
];

type Stage = 'gate' | 'questionnaire' | 'code-revealed';

export default function PaywallGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { isPro, isLoading: subLoading, redeemInviteCode } = useSubscription();

  const [stage, setStage] = useState<Stage>('gate');
  const [codeInput, setCodeInput] = useState('');
  const [codeError, setCodeError] = useState('');
  const [isRedeeming, setIsRedeeming] = useState(false);

  const [background, setBackground] = useState('');
  const [featuresWanted, setFeaturesWanted] = useState<string[]>([]);
  const [feedback, setFeedback] = useState('');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const [revealedCode, setRevealedCode] = useState('');
  const [redeemError, setRedeemError] = useState('');

  if (!PAYWALL_ENABLED) {
    return <>{children}</>;
  }

  if (authLoading || subLoading) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
          <p className="text-muted-foreground text-sm">加载中...</p>
        </div>
      </main>
    );
  }

  if (!isPro) {
    const handleRedeemGate = async () => {
      if (!codeInput.trim()) return;
      if (!isAuthenticated) {
        const redirect = typeof window !== 'undefined' ? window.location.pathname : '/';
        router.push(`/login?redirect=${encodeURIComponent(redirect)}`);
        return;
      }
      setIsRedeeming(true);
      setCodeError('');
      const result = await redeemInviteCode(codeInput.trim());
      setIsRedeeming(false);
      if (!result.success) {
        setCodeError(result.error || '兑换失败，请稍后再试');
      }
    };

    const toggleFeature = (f: string) => {
      setFeaturesWanted(prev =>
        prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]
      );
    };

    const handleQualifySubmit = async () => {
      if (!background) {
        setSubmitError('请先选择你的背景');
        return;
      }
      setIsSubmitting(true);
      setSubmitError('');
      try {
        const res = await fetch(`${API_BASE_URL}/invites/qualify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            background,
            features_wanted: featuresWanted,
            feedback,
            email,
          }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          setRevealedCode(data.invite_code);
          setStage('code-revealed');
        } else {
          setSubmitError('提交失败，请稍后再试');
        }
      } catch {
        setSubmitError('网络错误，请稍后再试');
      } finally {
        setIsSubmitting(false);
      }
    };

    const handleRedeemRevealed = async () => {
      if (!isAuthenticated) {
        const redirect = typeof window !== 'undefined' ? window.location.pathname : '/';
        router.push(`/login?redirect=${encodeURIComponent(redirect)}`);
        return;
      }
      setIsRedeeming(true);
      setRedeemError('');
      const result = await redeemInviteCode(revealedCode);
      setIsRedeeming(false);
      if (!result.success) {
        setRedeemError(result.error || '兑换失败，请稍后再试');
      }
    };

    return (
      <main className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <p className="text-xs font-medium tracking-[0.2em] uppercase text-primary mb-2">TheMarketBrew</p>
            <h1 className="text-2xl font-editorial text-foreground">专业级市场分析</h1>
            <p className="text-sm text-muted-foreground mt-1">需要邀请码才能访问</p>
          </div>

          <div className="terminal-card p-6 shadow-xl shadow-black/40">
            {stage === 'gate' && (
              <>
                <div className="mb-5">
                  <label className="text-sm font-medium text-foreground block mb-2">邀请码</label>
                  <input
                    type="text"
                    value={codeInput}
                    onChange={e => setCodeInput(e.target.value.toUpperCase())}
                    onKeyDown={e => e.key === 'Enter' && handleRedeemGate()}
                    placeholder="输入邀请码"
                    className="w-full px-3 py-2.5 bg-background border border-border/60 rounded-lg text-sm text-foreground placeholder:text-muted-foreground/50 font-mono tracking-wider focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20 transition-colors"
                  />
                  {codeError && <p className="text-xs text-red-400 mt-1.5">{codeError}</p>}
                </div>

                <button
                  onClick={handleRedeemGate}
                  disabled={isRedeeming || !codeInput.trim()}
                  className="w-full px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium transition-all hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isRedeeming ? (
                    <>
                      <div className="w-4 h-4 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
                      兑换中...
                    </>
                  ) : isAuthenticated ? '立即兑换' : '登录后兑换'}
                </button>

                <div className="mt-4 pt-4 border-t border-border/30 text-center">
                  <p className="text-xs text-muted-foreground mb-2">没有邀请码？</p>
                  <button
                    type="button"
                    onClick={() => setStage('questionnaire')}
                    className="text-xs text-primary hover:text-primary/80 transition-colors underline-offset-2 hover:underline"
                  >
                    填写问卷，立即获取邀请码
                  </button>
                </div>
              </>
            )}

            {stage === 'questionnaire' && (
              <>
                <button
                  type="button"
                  onClick={() => setStage('gate')}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  返回
                </button>

                <h2 className="text-sm font-medium text-foreground mb-5">填写问卷，立即获取邀请码</h2>

                <div className="mb-5">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2.5">你是</p>
                  <div className="space-y-1.5">
                    {BACKGROUND_OPTIONS.map(opt => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setBackground(opt)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors border ${
                          background === opt
                            ? 'border-primary/50 bg-primary/15 text-foreground'
                            : 'border-border/50 bg-background text-muted-foreground hover:border-border hover:text-foreground'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mb-5">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2.5">感兴趣的功能<span className="normal-case ml-1 text-muted-foreground/50">可多选</span></p>
                  <div className="flex flex-wrap gap-2">
                    {FEATURE_OPTIONS.map(f => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => toggleFeature(f)}
                        className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                          featuresWanted.includes(f)
                            ? 'border-primary/50 bg-primary/15 text-primary'
                            : 'border-border/50 bg-background text-muted-foreground hover:border-border hover:text-foreground'
                        }`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mb-5">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2.5">
                    有什么想说的<span className="normal-case ml-1 text-muted-foreground/50">可选，现有用户可提供反馈</span>
                  </p>
                  <textarea
                    value={feedback}
                    onChange={e => setFeedback(e.target.value)}
                    placeholder="你的体验、建议或期望..."
                    rows={3}
                    className="w-full px-3 py-2 bg-background border border-border/60 rounded-lg text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20 transition-colors resize-none"
                  />
                </div>

                <div className="mb-5">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2.5">
                    邮箱<span className="normal-case ml-1 text-muted-foreground/50">可选</span>
                  </p>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="方便我们后续联系"
                    className="w-full px-3 py-2.5 bg-background border border-border/60 rounded-lg text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20 transition-colors"
                  />
                </div>

                {submitError && <p className="text-xs text-red-400 mb-3">{submitError}</p>}

                <button
                  onClick={handleQualifySubmit}
                  disabled={isSubmitting || !background}
                  className="w-full px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium transition-all hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
                      提交中...
                    </>
                  ) : '获取邀请码'}
                </button>
              </>
            )}

            {stage === 'code-revealed' && (
              <>
                <div className="text-center mb-6">
                  <p className="text-sm text-muted-foreground mb-4">你的专属邀请码</p>
                  <div className="bg-background border border-primary/30 rounded-xl p-5 mb-3">
                    <p className="text-2xl font-mono font-bold tracking-widest text-primary">{revealedCode}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">解锁 14 天 Pro 免费体验</p>
                </div>

                <button
                  onClick={handleRedeemRevealed}
                  disabled={isRedeeming}
                  className="w-full px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium transition-all hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isRedeeming ? (
                    <>
                      <div className="w-4 h-4 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
                      兑换中...
                    </>
                  ) : isAuthenticated ? '立即兑换，开始 14 天体验' : '登录后兑换'}
                </button>

                {redeemError && <p className="text-xs text-red-400 mt-2 text-center">{redeemError}</p>}

                {!isAuthenticated && (
                  <p className="text-xs text-muted-foreground text-center mt-3">
                    记住邀请码，登录后凭邀请码兑换
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
