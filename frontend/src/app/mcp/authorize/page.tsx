import Link from 'next/link';

type AuthorizePageProps = {
  searchParams: Promise<{
    user_code?: string;
    status?: string;
    error?: string;
  }>;
};

export default async function McpAuthorizePage({ searchParams }: AuthorizePageProps) {
  const params = await searchParams;
  const userCode = (params.user_code || '').trim().toUpperCase();
  const status = params.status || '';
  const error = params.error || '';

  return (
    <main className="min-h-screen bg-background">
      <section className="border-b border-border/50">
        <div className="mx-auto max-w-2xl px-4 py-10 md:px-6">
          <div className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">
            TheMarketBrew MCP
          </div>
          <h1 className="mt-4 font-editorial text-3xl leading-tight tracking-tight text-foreground md:text-4xl">
            授权 MCP 客户端
          </h1>
        </div>
      </section>

      <div className="mx-auto max-w-2xl px-4 py-8 md:px-6">
        {status === 'approved' ? (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-5">
            <h2 className="text-lg font-medium text-foreground">已授权</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              回到你的 MCP 客户端，调用 <code>market_lens_auth_status</code> 完成登录。
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="rounded-lg border border-border bg-card p-5">
              <div className="text-sm text-muted-foreground">授权码</div>
              <div className="mt-2 font-mono text-2xl font-semibold tracking-[0.16em] text-foreground">
                {userCode || '未提供'}
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-600">
                {decodeURIComponent(error)}
              </div>
            )}

            <form action="/api/mcp/authorize" method="post" className="flex flex-wrap gap-3">
              <input type="hidden" name="user_code" value={userCode} />
              <button
                type="submit"
                disabled={!userCode}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                授权此客户端
              </button>
              <Link
                href="/settings"
                className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
              >
                返回设置
              </Link>
            </form>
          </div>
        )}
      </div>
    </main>
  );
}
