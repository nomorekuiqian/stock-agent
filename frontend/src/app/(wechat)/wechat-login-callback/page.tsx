'use client';

import { useEffect, useState } from 'react';
import { useAuth, getAccessTokenAsync } from '@/contexts/AuthContext';

export default function WechatLoginCallbackPage() {
  const { user, isAuthenticated } = useAuth();
  const [status, setStatus] = useState<'waiting' | 'success' | 'error'>('waiting');

  useEffect(() => {
    if (!isAuthenticated || !user) return;

    const getToken = async () => {
      try {
        const token = await getAccessTokenAsync();

        if (token && typeof window !== 'undefined' && (window as any).__wxjs_environment === 'miniprogram') {
          const wx = (window as any).wx;
          if (wx?.miniProgram) {
            wx.miniProgram.redirectTo({
              url: `/pages/login/login?token=${encodeURIComponent(token)}&user_id=${user.id}`,
            });
            setStatus('success');
            return;
          }
        }

        if (token) {
          setStatus('success');
        }
      } catch {
        setStatus('error');
      }
    };

    getToken();
  }, [isAuthenticated, user]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center space-y-4 p-8">
        {status === 'waiting' && (
          <>
            <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto" />
            <p className="text-muted-foreground">正在完成登录...</p>
          </>
        )}
        {status === 'success' && (
          <p className="text-primary">登录成功，正在返回小程序...</p>
        )}
        {status === 'error' && (
          <p className="text-destructive">登录失败，请重试</p>
        )}
      </div>
    </div>
  );
}
