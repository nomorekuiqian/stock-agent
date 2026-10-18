import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="terminal-card max-w-lg w-full p-8 text-center space-y-6">
        <div className="space-y-2">
          <p className="font-mono text-6xl font-semibold text-primary">404</p>
          <h1 className="font-serif text-2xl text-foreground">
            页面不存在
          </h1>
          <p className="text-sm text-muted-foreground">
            这个网址不存在或已迁移，请从首页或日报继续浏览。
          </p>
        </div>

        <div className="flex items-center justify-center gap-3">
          <Link
            href="/"
            className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            返回首页
          </Link>
          <Link
            href="/today"
            className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            查看每日复盘
          </Link>
        </div>
      </div>
    </div>
  );
}
