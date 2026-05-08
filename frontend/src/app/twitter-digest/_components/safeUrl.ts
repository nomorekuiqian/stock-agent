/**
 * URL whitelist helpers for KOL-sourced content.
 *
 * `tweet_url` and `username` arrive on Topic / Brief / SoloVoice / KeyArgument
 * directly from a backend pipeline that ultimately trusts LLM output. Even
 * though backend validation tightens this, we re-validate on the frontend
 * before putting either into an `href` so a poisoned row from the DB cannot
 * become an XSS vector (e.g. `javascript:alert(1)`).
 */

const TWEET_URL_RE = /^https:\/\/(?:www\.)?x\.com\/[A-Za-z0-9_]{1,30}\/status\/\d+\/?$/;
const HANDLE_RE = /^[A-Za-z0-9_]{1,30}$/;

export function safeTweetUrl(url: string | undefined | null): string {
  if (!url) return '#';
  return TWEET_URL_RE.test(url) ? url : '#';
}

export function safeUserUrl(username: string | undefined | null): string {
  if (!username || !HANDLE_RE.test(username)) return '#';
  return `https://x.com/${username}`;
}
