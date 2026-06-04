import { NextResponse } from 'next/server';
import type { UserSchema } from '@insforge/sdk';
import { createServerClient } from '@/lib/insforge-server';
import { getAuthCookies, setAuthCookies, clearAuthCookies } from '@/lib/auth-cookies';

type RefreshOk = {
  ok: true;
  accessToken: string;
  refreshToken: string | undefined;
  user: UserSchema;
};
type RefreshFail = { ok: false };
type RefreshResult = RefreshOk | RefreshFail;

// InsForge rotates the refresh token on every successful refresh and treats
// reuse of a stale refresh token as a replay attack (which kills the whole
// session family). When the user returns to the tab after the access token
// has expired, multiple requests can fire at once (page mount + 401 retries
// from in-flight business fetches). Without dedup, each one races to the
// InsForge /api/auth/refresh endpoint with the same old refresh token; only
// the first succeeds and the rest trip the replay guard.
//
// We keep a per-refresh-token in-flight Promise so concurrent callers share
// one InsForge round-trip. Entries are evicted shortly after settle so a
// later, legitimate refresh (with the new token) is not blocked.
const inflightRefresh = new Map<string, Promise<RefreshResult>>();
const INFLIGHT_TTL_MS = 2000;

function refreshOnce(refreshToken: string): Promise<RefreshResult> {
  const existing = inflightRefresh.get(refreshToken);
  if (existing) return existing;

  const promise = (async (): Promise<RefreshResult> => {
    try {
      const client = createServerClient();
      const { data, error } = await client.auth.refreshSession({ refreshToken });
      if (error || !data?.accessToken || !data.user) {
        return { ok: false };
      }
      return {
        ok: true,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        user: data.user,
      };
    } catch {
      return { ok: false };
    }
  })();

  inflightRefresh.set(refreshToken, promise);
  void promise.finally(() => {
    setTimeout(() => {
      if (inflightRefresh.get(refreshToken) === promise) {
        inflightRefresh.delete(refreshToken);
      }
    }, INFLIGHT_TTL_MS);
  });
  return promise;
}

function userPayload(user: UserSchema) {
  return {
    id: user.id,
    email: user.email,
    name: user.profile?.name ?? null,
    avatarUrl: user.profile?.avatar_url ?? null,
  };
}

export async function GET() {
  const { accessToken, refreshToken } = await getAuthCookies();

  if (!accessToken && !refreshToken) {
    return NextResponse.json({ user: null, accessToken: null });
  }

  // Fast path: access token still valid — no InsForge refresh needed.
  if (accessToken) {
    try {
      const client = createServerClient(accessToken);
      const { data } = await client.auth.getCurrentUser();
      if (data?.user) {
        return NextResponse.json({ user: userPayload(data.user), accessToken });
      }
    } catch {
      // fall through to refresh
    }
  }

  if (refreshToken) {
    const result = await refreshOnce(refreshToken);
    if (result.ok) {
      await setAuthCookies(result.accessToken, result.refreshToken);
      return NextResponse.json({
        user: userPayload(result.user),
        accessToken: result.accessToken,
      });
    }
    await clearAuthCookies();
  }

  return NextResponse.json({ user: null, accessToken: null });
}
