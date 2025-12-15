'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

export default function UnsubscribePage() {
  const [email, setEmail] = useState('');
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
      const result = await api.unsubscribe(email);
      setStatus('success');
      setMessage(result.message);
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Failed to unsubscribe');
    }
  };

  return (
    <main className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">
            Unsubscribe
          </h1>
          <p className="text-sm text-gray-500">
            We're sorry to see you go. Enter your email to unsubscribe from daily reports.
          </p>
        </div>

        {status === 'success' ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              You've been unsubscribed
            </h2>
            <p className="text-sm text-gray-500 mb-6">
              {message}
            </p>
            <div className="space-y-3">
              <p className="text-xs text-gray-400">
                Changed your mind?
              </p>
              <Link
                href="/#subscribe"
                className="inline-block px-6 py-2.5 bg-emerald-600 text-white rounded-xl font-medium text-sm transition-all hover:bg-emerald-700"
              >
                Re-subscribe
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email Address
              </label>
              <input
                type="email"
                id="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={status === 'loading'}
                required
                className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400"
              />
            </div>

            {status === 'error' && message && (
              <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-3">
                <p className="text-sm text-red-600">{message}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={status === 'loading'}
              className="w-full px-6 py-3 bg-gray-900 text-white rounded-xl font-medium text-sm transition-all hover:bg-gray-800 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {status === 'loading' ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Processing...
                </>
              ) : (
                'Unsubscribe'
              )}
            </button>

            <p className="text-xs text-gray-400 text-center pt-2">
              You can always re-subscribe later from our homepage.
            </p>
          </form>
        )}

        <div className="text-center mt-6">
          <Link
            href="/"
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Back to homepage
          </Link>
        </div>
      </div>
    </main>
  );
}
