'use client';

import type { PickerOption } from '@/lib/api';

interface OptionChipsProps {
  options: PickerOption[];
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
        const isSelected = selectedValue === opt.value;
        const isDisabled = disabled;

        return (
          <button
            key={`${opt.value}-${i}`}
            onClick={() => !isDisabled && onSelect(opt.value)}
            disabled={isDisabled}
            className={`
              animate-chip-enter
              px-3.5 py-1.5 rounded-full text-sm
              border transition-all duration-200
              ${isSelected
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                : isDisabled
                  ? 'bg-zinc-800/30 border-border/20 text-zinc-500 cursor-default'
                  : 'bg-zinc-800/40 border-border/30 text-zinc-300 hover:border-emerald-500/30 hover:text-emerald-400 hover:bg-emerald-500/5 active:scale-95 cursor-pointer'
              }
            `}
            style={{ animationDelay: `${i * 60}ms` }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
