'use client';

import { useState } from 'react';
import { getPersonaDisplayName } from '../_lib/personaDisplay';

interface AssistantAvatarProps {
  /** When set, render the persona's avatar image instead of the brand mark. */
  personaUsername?: string | null;
  /** Wrapper size classes. Defaults to chat-message size (24/28px). */
  className?: string;
  /** Gradient id suffix — avoids collisions when multiple instances render. */
  gradientIdSuffix?: string;
}

const DEFAULT_CLASS = 'w-6 h-6 sm:w-7 sm:h-7';

/**
 * AI assistant avatar — single source of truth for the avatar shown in
 * ChatMessage AI bubbles and the ChatPanel "thinking..." status row.
 *
 * Two modes:
 * - Default: brand "M" mark SVG (emerald gradient).
 * - Persona: `/kol-avatars/{username}.png` with initials fallback if missing.
 */
export default function AssistantAvatar({
  personaUsername,
  className = DEFAULT_CLASS,
  gradientIdSuffix = 'default',
}: AssistantAvatarProps) {
  const [imgFailed, setImgFailed] = useState(false);

  if (personaUsername) {
    const displayName = getPersonaDisplayName(personaUsername);
    if (!imgFailed) {
      const src = `/kol-avatars/${personaUsername.toLowerCase()}.png`;
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={displayName}
          className={`${className} shrink-0 rounded-full object-cover ring-1 ring-primary/30`}
          onError={() => setImgFailed(true)}
        />
      );
    }
    return (
      <div
        className={`${className} shrink-0 rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/40 flex items-center justify-center font-editorial italic text-xs text-emerald-700`}
        aria-label={displayName}
      >
        {displayName.slice(0, 2).toUpperCase()}
      </div>
    );
  }

  const gradId = `assistant-avatar-grad-${gradientIdSuffix}`;
  return (
    <div className={`${className} shrink-0 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center`}>
      <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" viewBox="0 0 32 32" fill="none">
        <path
          d="M4 24V12L10 6V24M10 6L16 14L22 6M22 6V24M28 24V12L22 6"
          stroke={`url(#${gradId})`}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#10B981" />
            <stop offset="100%" stopColor="#6EE7B7" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}
