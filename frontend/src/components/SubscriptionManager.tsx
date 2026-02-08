'use client';

import { useState, useEffect, useCallback } from 'react';
import { api, SubscriptionChannel } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

interface SubscriptionManagerProps {
  channels?: SubscriptionChannel[];
  defaultChannel?: SubscriptionChannel;
  initialSymbols?: string[];
  className?: string;
  onStatusChange?: (channel: SubscriptionChannel, subscribed: boolean) => void;
}

interface ChannelStatus {
  subscribed: boolean;
  loading: boolean;
  metadata?: Record<string, unknown>;
}

const DEFAULT_CHANNELS: SubscriptionChannel[] = ['daily_report', 'personal_digest'];

export default function SubscriptionManager({
  channels = DEFAULT_CHANNELS,
  defaultChannel = 'daily_report',
  initialSymbols = [],
  className = '',
  onStatusChange,
}: SubscriptionManagerProps) {
  const { user } = useAuth();
  const [activeChannel, setActiveChannel] = useState<SubscriptionChannel>(defaultChannel);
  // Track locally entered email (empty means use user.email if available)
  const [localEmail, setLocalEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [symbols, setSymbols] = useState<string[]>(() => initialSymbols);
  const [symbolInput, setSymbolInput] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [channelStatuses, setChannelStatuses] = useState<Record<SubscriptionChannel, ChannelStatus>>({
    daily_report: { subscribed: false, loading: false },
    personal_digest: { subscribed: false, loading: false },
  });

  // Derive email: use local input if provided, otherwise fallback to user.email
  const email = localEmail || user?.email || '';

  // Wrapper to update local email
  const setEmail = (value: string) => setLocalEmail(value);

  // Check subscription status on mount if user has email
  const checkStatus = useCallback(async () => {
    const currentEmail = localEmail || user?.email || '';
    if (!currentEmail) return;

    setChannelStatuses(prev => {
      const next = { ...prev };
      for (const channel of channels) {
        next[channel] = { ...prev[channel], loading: true };
      }
      return next;
    });

    await Promise.all(channels.map(async (channel) => {
      try {
        const result = await api.subscriptions.getStatus(channel, currentEmail);
        setChannelStatuses(prev => ({
          ...prev,
          [channel]: {
            subscribed: result.subscribed,
            loading: false,
            metadata: result.metadata,
          },
        }));
      } catch {
        setChannelStatuses(prev => ({
          ...prev,
          [channel]: { ...prev[channel], loading: false },
        }));
      }
    }));
  }, [localEmail, user?.email, channels]);

  // Check subscription status when email changes
  useEffect(() => {
    const currentEmail = localEmail || user?.email || '';
    if (currentEmail) {
      // Delay to avoid rapid status checks
      const timer = setTimeout(() => {
        checkStatus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [localEmail, user?.email, checkStatus]);

  const handleSubscribe = async () => {
    if (!email) {
      setStatus('error');
      setMessage('Please enter your email address');
      return;
    }

    if (activeChannel === 'personal_digest' && symbols.length === 0) {
      setStatus('error');
      setMessage('Please add at least one stock symbol');
      return;
    }

    setStatus('loading');
    setMessage('');

    try {
      const data: {
        email: string;
        first_name?: string;
        user_id?: string;
        symbols?: string[];
      } = { email };

      if (firstName) data.first_name = firstName;
      if (user?.id) data.user_id = user.id;
      if (activeChannel === 'personal_digest') data.symbols = symbols;

      const result = await api.subscriptions.subscribe(activeChannel, data);

      if (result.success) {
        setStatus('success');
        setMessage(activeChannel === 'daily_report'
          ? 'Successfully subscribed to daily reports!'
          : 'Successfully subscribed to personalized digest!');
        setChannelStatuses(prev => ({
          ...prev,
          [activeChannel]: { subscribed: true, loading: false, metadata: result.metadata },
        }));
        onStatusChange?.(activeChannel, true);
      } else {
        setStatus('error');
        setMessage(result.error || 'Failed to subscribe');
      }
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Failed to subscribe');
    }
  };

  const handleUnsubscribe = async () => {
    if (!email) return;

    setStatus('loading');
    setMessage('');

    try {
      const result = await api.subscriptions.unsubscribe(activeChannel, email);

      if (result.success) {
        setStatus('success');
        setMessage('Successfully unsubscribed');
        setChannelStatuses(prev => ({
          ...prev,
          [activeChannel]: { subscribed: false, loading: false },
        }));
        onStatusChange?.(activeChannel, false);
      } else {
        setStatus('error');
        setMessage(result.error || 'Failed to unsubscribe');
      }
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Failed to unsubscribe');
    }
  };

  const addSymbol = () => {
    const sym = symbolInput.trim().toUpperCase();
    if (sym && !symbols.includes(sym)) {
      setSymbols([...symbols, sym]);
    }
    setSymbolInput('');
  };

  const removeSymbol = (symbol: string) => {
    setSymbols(symbols.filter(s => s !== symbol));
  };

  const channelLabels: Record<SubscriptionChannel, { name: string; description: string; icon: React.ReactNode }> = {
    daily_report: {
      name: 'Daily Report',
      description: 'Morning market overview for all subscribers',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    personal_digest: {
      name: 'Personal Digest',
      description: 'Personalized insights based on your watchlist',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      ),
    },
  };

  const currentChannelStatus = channelStatuses[activeChannel];
  const isSubscribed = currentChannelStatus.subscribed;

  return (
    <div className={`bg-card rounded-2xl border border-border ${className}`}>
      {/* Channel Tabs */}
      {channels.length > 1 && (
        <div className="flex border-b border-border">
          {channels.map((channel) => {
            const isActive = channel === activeChannel;
            const channelStatus = channelStatuses[channel];
            return (
              <button
                key={channel}
                onClick={() => {
                  setActiveChannel(channel);
                  setStatus('idle');
                  setMessage('');
                }}
                className={`flex-1 px-4 py-3 text-sm font-medium transition-colors relative ${
                  isActive
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  {channelLabels[channel].icon}
                  <span>{channelLabels[channel].name}</span>
                  {channelStatus.subscribed && (
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  )}
                </div>
                {isActive && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-500" />
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Channel Content */}
      <div className="p-6">
        <div className="mb-5">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            {channelLabels[activeChannel].icon}
            {channelLabels[activeChannel].name}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            {channelLabels[activeChannel].description}
          </p>
        </div>

        {isSubscribed ? (
          <div className="bg-emerald-500/10 dark:bg-emerald-500/20 border border-emerald-500/20 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                You&apos;re subscribed!
              </span>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              {activeChannel === 'daily_report'
                ? 'You will receive daily market reports at 6 PM ET on weekdays.'
                : 'You will receive personalized digests at 6 PM ET on weekdays.'}
            </p>
            <button
              onClick={handleUnsubscribe}
              disabled={status === 'loading'}
              className="text-sm text-red-500 hover:text-red-600 underline disabled:opacity-50"
            >
              Unsubscribe
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Email Address <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                placeholder="john@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={status === 'loading'}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:bg-muted disabled:text-muted-foreground"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                First Name <span className="text-muted-foreground/60">(optional)</span>
              </label>
              <input
                type="text"
                placeholder="John"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                disabled={status === 'loading'}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:bg-muted disabled:text-muted-foreground"
              />
            </div>

            {activeChannel === 'personal_digest' && (
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  Watchlist Symbols <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    placeholder="AAPL"
                    value={symbolInput}
                    onChange={(e) => setSymbolInput(e.target.value.toUpperCase())}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addSymbol();
                      }
                    }}
                    disabled={status === 'loading'}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:bg-muted disabled:text-muted-foreground"
                  />
                  <button
                    type="button"
                    onClick={addSymbol}
                    disabled={status === 'loading' || !symbolInput.trim()}
                    className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-500 disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed"
                  >
                    Add
                  </button>
                </div>
                {symbols.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {symbols.map((symbol) => (
                      <span
                        key={symbol}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-lg text-xs font-medium"
                      >
                        {symbol}
                        <button
                          onClick={() => removeSymbol(symbol)}
                          className="hover:text-red-500"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-2">
                  Add stock symbols to get personalized insights (e.g., AAPL, MSFT, NVDA)
                </p>
              </div>
            )}

            {status === 'error' && message && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                <p className="text-xs text-red-500">{message}</p>
              </div>
            )}

            {status === 'success' && message && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
                <p className="text-xs text-emerald-600 dark:text-emerald-400">{message}</p>
              </div>
            )}

            <button
              onClick={handleSubscribe}
              disabled={status === 'loading'}
              className="w-full px-6 py-3 bg-emerald-600 text-white rounded-xl font-medium text-sm transition-all hover:bg-emerald-500 hover:shadow-lg hover:shadow-emerald-500/25 disabled:bg-emerald-800 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-2"
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
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  Subscribe
                </>
              )}
            </button>

            <p className="text-xs text-muted-foreground text-center">
              Delivered at 6 PM ET on weekdays. Unsubscribe anytime.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
