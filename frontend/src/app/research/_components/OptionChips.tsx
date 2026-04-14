'use client';

interface OptionChipsProps {
  options: string[];
  onSelect: (value: string) => void;
  disabled?: boolean;
  selectedValue?: string | null;
}

export default function OptionChips({
  options,
  onSelect,
  disabled = false,
  selectedValue = null,
}: OptionChipsProps) {
  if (!options.length) return null;

  return (
    <div className="flex flex-wrap gap-1.5 sm:gap-2 mt-1 ml-10">
      {options.map((opt, i) => {
        const isSelected = selectedValue === opt;
        const isUnselected = selectedValue !== null && !isSelected;

        return (
          <button
            key={`${opt}-${i}`}
            onClick={() => !disabled && onSelect(opt)}
            disabled={disabled}
            className={`
              px-3.5 py-1.5 rounded-full text-sm
              border transition-all duration-200
              ${selectedValue === null ? 'animate-chip-enter' : ''}
              ${isSelected
                ? 'bg-primary/10 border-primary/40 text-primary'
                : isUnselected
                  ? 'bg-muted/30 border-border/40 text-muted-foreground/70 cursor-default'
                  : 'bg-card/70 border-border/50 text-muted-foreground hover:border-primary/40 hover:text-primary hover:bg-primary/5 hover:-translate-y-px active:translate-y-0 active:scale-[0.97] cursor-pointer'
              }
            `}
            style={selectedValue === null ? { animationDelay: `${i * 60}ms` } : undefined}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}
