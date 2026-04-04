'use client';

import Link from 'next/link';
import { useState } from 'react';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

type Rating = 'helpful' | 'neutral' | 'not_helpful';

interface FeedbackFormData {
  rating: Rating | null;
  email: string;
  message: string;
}

const ratingOptions: { value: Rating; label: string; icon: string }[] = [
  { value: 'helpful', label: '很有帮助', icon: 'M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  { value: 'neutral', label: '还行', icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  { value: 'not_helpful', label: '不太行', icon: 'M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
];

export default function ContactPage() {
  const [formData, setFormData] = useState<FeedbackFormData>({
    rating: null,
    email: '',
    message: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.rating) {
      setErrorMessage('请选择一个评分');
      return;
    }

    if (!formData.email) {
      setErrorMessage('请输入您的邮箱');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const response = await fetch(`${API_BASE_URL}/feedback/user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          rating: formData.rating,
          email: formData.email,
          message: formData.message || undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: '提交失败，请稍后重试' }));
        throw new Error(error.detail || '提交失败，请稍后重试');
      }

      setSubmitStatus('success');
      setFormData({ rating: null, email: '', message: '' });
    } catch (error) {
      console.error('Submit feedback error:', error);
      setSubmitStatus('error');
      setErrorMessage(error instanceof Error ? error.message : '出了点问题，请稍后重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-mesh pointer-events-none" />
        <div className="absolute inset-0 bg-dot-pattern pointer-events-none opacity-50" />

        <div className="relative max-w-4xl mx-auto px-4 md:px-6 pt-20 pb-16 md:pt-28 md:pb-20">
          {/* Header */}
          <div className="text-center mb-12 md:mb-16">
            <div className="flex items-center gap-3 mb-6 animate-fade-in-up">
              <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-primary to-transparent animate-line-expand" />
              <span className="text-primary text-xs font-semibold tracking-[0.25em] uppercase">Contact</span>
            </div>

            <h1 className="font-editorial text-4xl md:text-5xl lg:text-6xl text-foreground leading-[1.1] mb-4 animate-fade-in-up delay-100">
              联系我们
            </h1>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto leading-relaxed animate-fade-in-up delay-200">
              有问题或建议？直接告诉我们
            </p>
          </div>

          {/* Feedback Form */}
          <div className="max-w-md mx-auto mb-12">
            {submitStatus === 'success' ? (
              <div className="terminal-card p-6 md:p-8 text-center">
                <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
                  <svg
                    className="w-8 h-8 text-primary"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <h2 className="text-lg font-medium text-foreground mb-2">感谢您的反馈！</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  您的意见对我们非常重要，我们会认真阅读每一条反馈。
                </p>
                <button
                  onClick={() => setSubmitStatus('idle')}
                  className="text-sm text-primary hover:text-primary/80 transition-colors"
                >
                  继续提交反馈
                </button>
              </div>
            ) : (
              <div className="terminal-card p-6 md:p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <svg
                      className="w-6 h-6 text-primary"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
                      />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-lg font-medium text-foreground">用户反馈</h2>
                    <p className="text-sm text-muted-foreground">您的使用体验如何？</p>
                  </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Rating Selection */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-3">
                      您对产品的整体评价 <span className="text-red-500">*</span>
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {ratingOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setFormData({ ...formData, rating: option.value })}
                          className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-all ${
                            formData.rating === option.value
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border hover:border-muted-foreground/50 text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          <svg
                            className="w-6 h-6"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={1.5}
                              d={option.icon}
                            />
                          </svg>
                          <span className="text-xs">{option.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Email Input */}
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-foreground mb-2">
                      邮箱 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      id="email"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="your@email.com"
                      className="w-full px-4 py-2.5 rounded-lg bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-foreground placeholder:text-muted-foreground/50"
                    />
                    <p className="text-xs text-muted-foreground mt-1">方便我们回复您的反馈</p>
                  </div>

                  {/* Message Textarea */}
                  <div>
                    <label htmlFor="message" className="block text-sm font-medium text-foreground mb-2">
                      详细反馈 <span className="text-muted-foreground">（选填）</span>
                    </label>
                    <textarea
                      id="message"
                      rows={4}
                      value={formData.message}
                      onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                      placeholder="告诉我们更多您的想法..."
                      className="w-full px-4 py-2.5 rounded-lg bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-foreground placeholder:text-muted-foreground/50 resize-none"
                    />
                  </div>

                  {/* Error Message */}
                  {errorMessage && (
                    <div className="text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2">
                      {errorMessage}
                    </div>
                  )}

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={isSubmitting || !formData.rating || !formData.email}
                    className="w-full py-3 px-4 rounded-lg bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-primary-foreground font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    {isSubmitting ? (
                      <>
                        <svg
                          className="animate-spin h-4 w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          />
                        </svg>
                        提交中...
                      </>
                    ) : (
                      '提交反馈'
                    )}
                  </button>
                </form>
              </div>
            )}
          </div>

          {/* Navigation Links */}
          <div className="text-center">
            <div className="inline-flex items-center gap-6 text-sm text-muted-foreground">
              <Link
                href="/"
                className="hover:text-foreground transition-colors flex items-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 19l-7-7m0 0l7-7m-7 7h18"
                  />
                </svg>
                返回首页
              </Link>
              <span className="text-border">|</span>
              <Link href="/today" className="hover:text-foreground transition-colors">
                今日报告
              </Link>
              <span className="text-border">|</span>
              <Link href="/#subscribe" className="hover:text-foreground transition-colors">
                订阅日报
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
