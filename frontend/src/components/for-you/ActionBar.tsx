'use client';

import { useRouter } from 'next/navigation';
import { useActionBar } from '@/hooks/queries/use-action-bar';
import { useAuth } from '@/contexts/AuthContext';
import { useTouchPortfolio } from '@/hooks/queries/use-portfolio';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/hooks/queries/query-keys';
import { ActionChip as ActionChipType } from '@/lib/api';
import { resolveChipUrl, scrollToAnchor } from '@/lib/action-bar-routing';

function ActionChipButton({ chip }: { chip: ActionChipType }) {
  const router = useRouter();
  const touchPortfolio = useTouchPortfolio();
  const queryClient = useQueryClient();

  const handleClick = async () => {
    // Legacy action links (touch portfolio button) stay on link field
    if (chip.link === 'action://touch-portfolio') {
      try {
        await touchPortfolio.mutateAsync();
        queryClient.invalidateQueries({ queryKey: queryKeys.actionBar.all });
      } catch {
        // silent — user can try again
      }
      return;
    }

    const route = chip.target ? resolveChipUrl(chip.target) : null;
    if (route?.kind === 'anchor') {
      scrollToAnchor(route.hash);
      return;
    }
    if (route?.kind === 'push') {
      router.push(route.href);
      return;
    }
    // Fallback to legacy link field if target doesn't resolve
    if (chip.link?.startsWith('#')) {
      scrollToAnchor(chip.link);
      return;
    }
    if (chip.link) {
      router.push(chip.link);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium
                 bg-background/60 border border-current/10 hover:bg-background/80
                 transition-colors cursor-pointer whitespace-nowrap"
    >
      {chip.label}
    </button>
  );
}

export function ActionBar() {
  const { user } = useAuth();
  const { data, isLoading, isError } = useActionBar(!!user?.id);

  if (isError) return null;
  if (!isLoading && !data) return null;
  if (data?.visibility === 'hidden') return null;

  // Legacy server responses (no visibility field) still rely on headline-or-chips
  if (data && data.visibility !== 'visible') {
    if (!data.headline && (!data.chips || data.chips.length === 0)) return null;
  }

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto px-4 md:px-6">
        <div className="h-12 bg-muted/40 rounded-xl animate-pulse" />
      </div>
    );
  }

  const { severity, headline, chips } = data!;
  const hasHeadline = !!headline;
  const hasChips = chips && chips.length > 0;
  if (!hasHeadline && !hasChips) return null;

  const severityStyles = {
    green: 'bg-muted/30 text-muted-foreground border-border/30',
    yellow: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
    red: 'bg-red-500/8 text-red-700 dark:text-red-400 border-red-500/20',
  };

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 pt-4">
      <div
        className={`flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 px-4 py-3 rounded-xl border ${severityStyles[severity]} transition-colors`}
      >
        {hasHeadline && (
          <span className="text-sm flex-1 min-w-0 line-clamp-2 sm:truncate">{headline}</span>
        )}
        {hasChips && (
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
            {/* Single-line (mobile): show only the highest-priority chip (first in sorted order).
                Multi-line (sm+): show up to 3. */}
            <div className="sm:hidden">
              <ActionChipButton chip={chips[0]} />
            </div>
            <div className="hidden sm:flex items-center gap-2 flex-wrap">
              {chips.slice(0, 3).map((chip, i) => (
                <ActionChipButton key={i} chip={chip} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
