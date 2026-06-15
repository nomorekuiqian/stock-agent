const PERSONA_DISPLAY_NAMES: Record<string, string> = {
  pandacircle: '潘大的科技交流圈',
};

function normalizeUsername(username: string | null | undefined): string {
  return (username || '').trim().toLowerCase();
}

export function getPersonaDisplayName(
  username: string | null | undefined,
  fallbackName?: string | null,
): string {
  const key = normalizeUsername(username);
  if (key && PERSONA_DISPLAY_NAMES[key]) return PERSONA_DISPLAY_NAMES[key];
  return (fallbackName || username || '').trim();
}

export function getPersonaDisplayLabel(
  username: string | null | undefined,
  fallbackName?: string | null,
): string {
  const key = normalizeUsername(username);
  const name = getPersonaDisplayName(username, fallbackName);
  if (!name) return '';
  if (key && PERSONA_DISPLAY_NAMES[key]) return name;
  return name.startsWith('@') ? name : `@${name}`;
}

export function replacePersonaUsernamesForDisplay(text: string): string {
  if (!text) return text;
  return text.replace(
    /(^|[^A-Za-z0-9_/@.-])@?pandacircle(?![A-Za-z0-9_.-])/gi,
    (_match, prefix: string) => `${prefix}${PERSONA_DISPLAY_NAMES.pandacircle}`,
  );
}
