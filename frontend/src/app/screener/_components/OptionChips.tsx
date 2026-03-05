'use client';

interface OptionChipsProps {
  options: string[];
  onSelect: (value: string) => void;
  /** Whether these chips have been used (clicked) */
  disabled?: boolean;
  /** The value that was selected (to highlight it) */
  selectedValue?: string | null;
}

/**
 * OptionChips - Dynamic clickable option buttons from AI agent.
 *
 * Staggered scale-in entry animation. After one is clicked,
 * all chips become disabled and the selected one is highlighted.
 */
export default function OptionChips({
  options,
  onSelect,
  disabled = false,
  selectedValue = null,
}: OptionChipsProps) {
  if (!options.length) return null;

  return (
    <div className="flex flex-wrap gap-2 mt-2.5 ml-10">
      {options.map((opt, i) => {
        const isSelected = selectedValue === opt;
        const isDisabled = disabled;

        return (
          <button
            key={`${opt}-${i}`}
            onClick={() => !isDisabled && onSelect(opt)}
            disabled={isDisabled}
            className={`
              animate-chip-enter
              px-3.5 py-1.5 rounded-full text-sm
              border transition-all duration-200
              ${isSelected
                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
                : isDisabled
                  ? 'bg-muted/50 border-border/30 text-muted-foreground/50 cursor-default'
                  : 'bg-card/60 border-border/50 text-muted-foreground hover:border-emerald-500/40 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-500/5 active:scale-95 cursor-pointer'
              }
            `}
            style={{ animationDelay: `${i * 60}ms` }}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}
