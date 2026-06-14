'use client';

import { useTheme } from 'next-themes';
import { useSyncExternalStore } from 'react';
import { Moon, Sun } from 'lucide-react';

// Use useSyncExternalStore to avoid hydration mismatch warning
const emptySubscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(emptySubscribe, getSnapshot, getServerSnapshot);

  if (!mounted) {
    return (
      <button
        type="button"
        className="p-2 rounded-lg hover:bg-muted/70 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
        aria-label="切换主题"
        disabled
      >
        <div className="w-4 h-4" />
      </button>
    );
  }

  const isDark = resolvedTheme === 'dark';

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="p-2 rounded-lg hover:bg-muted/70 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
      aria-label={isDark ? '切换到亮色主题' : '切换到暗色主题'}
    >
      {isDark ? (
        <Sun className="w-4 h-4 text-muted-foreground hover:text-primary transition-colors" />
      ) : (
        <Moon className="w-4 h-4 text-muted-foreground hover:text-primary transition-colors" />
      )}
    </button>
  );
}
