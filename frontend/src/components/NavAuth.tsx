'use client';

import { useAuth } from '@/contexts/AuthContext';

export function NavAuth() {
  const { user, isAuthenticated, isLoading, signOut } = useAuth();

  if (isLoading) {
    return (
      <div className="w-6 h-6 rounded-full bg-gray-200 animate-pulse" />
    );
  }

  if (isAuthenticated && user) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-600 hidden sm:block">
          {user.name || user.email}
        </span>
        <button
          onClick={() => signOut()}
          className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
        >
          退出登录
        </button>
      </div>
    );
  }

  return (
    <a
      href="/login"
      className="text-sm text-emerald-600 font-medium hover:text-emerald-700 transition-colors"
    >
      登录
    </a>
  );
}
