'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEntitlements } from '@/contexts/EntitlementsContext';

function CheckoutSuccessContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { refresh } = useEntitlements();
  const [status, setStatus] = useState<'activating' | 'ready' | 'timeout'>('activating');

  useEffect(() => {
    let cancelled = false;
    const target = params.get('next') || '/for-you';

    const run = async () => {
      await refresh({ fresh: true });
      if (cancelled) return;
      setStatus('ready');
      setTimeout(() => !cancelled && router.push(target), 800);
    };

    const timeoutId = setTimeout(() => {
      if (!cancelled) setStatus('timeout');
    }, 10000);

    run();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center space-y-4">
        {status === 'activating' && (
          <>
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-zinc-400">正在激活你的订阅...</p>
          </>
        )}
        {status === 'ready' && (
          <p className="text-emerald-400 text-lg font-medium">订阅已激活，正在跳转...</p>
        )}
        {status === 'timeout' && (
          <div className="space-y-2">
            <p className="text-zinc-300">激活稍有延迟</p>
            <p className="text-zinc-500 text-sm">请刷新页面，或联系我们获取帮助</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <CheckoutSuccessContent />
    </Suspense>
  );
}
