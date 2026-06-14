'use client';

import { useState, type ChangeEvent, type ReactNode } from 'react';

interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  disabled?: boolean;
  helperText?: ReactNode;
  labelAction?: ReactNode;
}

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.58 10.58A3 3 0 0012 15a3 3 0 002.42-1.22" />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9.88 5.09A9.77 9.77 0 0112 4.5c4.77 0 8.44 3.02 9.5 7.5a11.73 11.73 0 01-4.04 5.94M6.1 6.1A11.8 11.8 0 002.5 12a11.8 11.8 0 004.4 6.56"
        />
      </svg>
    );
  }

  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.5 12C3.56 7.52 7.23 4.5 12 4.5S20.44 7.52 21.5 12c-1.06 4.48-4.73 7.5-9.5 7.5S3.56 16.48 2.5 12z"
      />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function PasswordField({
  id,
  label,
  value,
  onChange,
  placeholder = '******',
  autoComplete,
  required = false,
  minLength,
  disabled = false,
  helperText,
  labelAction,
}: PasswordFieldProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label htmlFor={id} className="block text-sm font-medium text-foreground">
          {label}
        </label>
        {labelAction}
      </div>

      <div className="relative">
        <input
          id={id}
          type={isVisible ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
          minLength={minLength}
          disabled={disabled}
          className="w-full px-4 py-3 pr-12 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-primary/50 focus:ring-2 focus:ring-primary/10 outline-none transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <button
          type="button"
          aria-label={isVisible ? `隐藏${label}` : `显示${label}`}
          aria-pressed={isVisible}
          onClick={() => setIsVisible((current) => !current)}
          className="absolute inset-y-0 right-0 flex items-center px-4 text-muted-foreground hover:text-foreground transition-colors"
        >
          <EyeIcon open={isVisible} />
        </button>
      </div>

      {helperText ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {helperText}
        </p>
      ) : null}
    </div>
  );
}
