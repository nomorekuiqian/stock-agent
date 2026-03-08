function decodeBase64Json(base64Value: string): Record<string, unknown> | null {
  try {
    const normalized = base64Value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), '=');

    const decoded = typeof atob === 'function'
      ? atob(padded)
      : Buffer.from(padded, 'base64').toString('utf8');

    const parsed = JSON.parse(decoded);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export function isJwtExpired(token: string, skewSeconds: number = 60): boolean {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return true;
  }

  const payload = decodeBase64Json(parts[1]);
  if (!payload) {
    return true;
  }

  const exp = payload.exp;
  if (typeof exp !== 'number') {
    return false;
  }

  return Date.now() / 1000 > exp - skewSeconds;
}
