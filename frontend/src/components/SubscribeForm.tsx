'use client';

import { useState } from 'react';
import { api } from '@/lib/api';

interface SubscribeFormProps {
  variant?: 'inline' | 'card';
  className?: string;
}

export default function SubscribeForm({ variant = 'card', className = '' }: SubscribeFormProps) {
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email) {
      setStatus('error');
      setMessage('Please enter your email address');
      return;
    }

    setStatus('loading');
    setMessage('');

    try {
      const result = await api.subscribe(email, firstName || undefined);
      setStatus('success');
      setMessage(result.message);
      setEmail('');
      setFirstName('');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Failed to subscribe');
    }
  };

  if (variant === 'inline') {
    return (
      <form onSubmit={handleSubmit} className={`flex flex-col sm:flex-row gap-3 ${className}`}>
        <input
          type="email"
          placeholder="Enter your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={status === 'loading'}
          className="flex-1 px-4 py-3 rounded-lg border border-border/50 bg-card/50 backdrop-blur-sm text-foreground text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50 disabled:bg-muted disabled:text-muted-foreground transition-all"
        />
        <button
          type="submit"
          disabled={status === 'loading'}
          className="px-6 py-3 bg-emerald-600 text-white rounded-lg font-medium text-sm transition-all hover:bg-emerald-500 hover:shadow-lg hover:shadow-emerald-500/20 disabled:bg-emerald-900 disabled:text-emerald-300/50 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-2"
        >
          {status === 'loading' ? (
            <>
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Subscribing...
            </>
          ) : (
            'Subscribe'
          )}
        </button>
        {message && (
          <p className={`text-xs mt-1 sm:mt-0 sm:ml-2 self-center ${status === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
            {message}
          </p>
        )}
      </form>
    );
  }

  // Card variant - Terminal style
  return (
    <div className={`terminal-card p-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
          <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <div>
          <h3 className="font-medium text-foreground">Daily Market Report</h3>
          <p className="text-xs text-muted-foreground">Get insights delivered to your inbox</p>
        </div>
      </div>

      {status === 'success' ? (
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-5 text-center">
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-emerald-400">You&apos;re subscribed!</p>
          <p className="text-xs text-muted-foreground mt-1">{message}</p>
          <button
            onClick={() => setStatus('idle')}
            className="mt-4 text-xs text-emerald-400/80 hover:text-emerald-400 transition-colors"
          >
            Subscribe another email
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* First Name Field */}
          <div>
            <label htmlFor="firstName" className="block text-xs font-medium text-muted-foreground mb-2">
              First Name <span className="text-muted-foreground/50">(optional)</span>
            </label>
            <input
              type="text"
              id="firstName"
              placeholder="John"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              disabled={status === 'loading'}
              className="w-full px-4 py-2.5 rounded-lg border border-border/50 bg-background/50 text-foreground text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50 disabled:bg-muted disabled:text-muted-foreground transition-all"
            />
          </div>

          {/* Email Field */}
          <div>
            <label htmlFor="email" className="block text-xs font-medium text-muted-foreground mb-2">
              Email Address <span className="text-emerald-500">*</span>
            </label>
            <input
              type="email"
              id="email"
              placeholder="john@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={status === 'loading'}
              required
              className="w-full px-4 py-2.5 rounded-lg border border-border/50 bg-background/50 text-foreground text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50 disabled:bg-muted disabled:text-muted-foreground transition-all"
            />
          </div>

          {/* Error Message */}
          {status === 'error' && message && (
            <div className="bg-red-500/5 border border-red-500/20 rounded-lg px-3 py-2.5">
              <p className="text-xs text-red-400">{message}</p>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={status === 'loading'}
            className="w-full px-6 py-3 bg-emerald-600 text-white rounded-lg font-medium text-sm transition-all hover:bg-emerald-500 hover:shadow-lg hover:shadow-emerald-500/20 disabled:bg-emerald-900 disabled:text-emerald-300/50 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-2 group"
          >
            {status === 'loading' ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Subscribing...
              </>
            ) : (
              <>
                <svg className="w-4 h-4 transition-transform group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                Subscribe to Daily Reports
              </>
            )}
          </button>

          {/* Privacy Note */}
          <p className="text-[10px] text-muted-foreground/60 text-center">
            Unsubscribe anytime. We respect your privacy.
          </p>
        </form>
      )}
    </div>
  );
}
