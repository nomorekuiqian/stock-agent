'use client';

import { useTheme } from 'next-themes';
import { useSyncExternalStore } from 'react';
import { Moon, Sun } from 'lucide-react';

// Use useSyncExternalStore to avoid hydration mismatch warning
const emptySubscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(emptySubscribe, getSnapshot, getServerSnapshot);

  if (!mounted) {
    return (
      <button className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center">
        <div className="w-4 h-4" />
      </button>
    );
  }

  return (
    <button
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
      aria-label="Toggle theme"
    >
      {theme === 'dark' ? (
        <Sun className="w-4 h-4 text-gray-400 hover:text-primary transition-colors" />
      ) : (
        <Moon className="w-4 h-4 text-gray-500 hover:text-primary transition-colors" />
      )}
    </button>
  );
}
