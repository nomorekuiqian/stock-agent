'use client';

/**
 * Dashboard导读 strip · 放在 /macro 首屏顶部
 *
 * 给首次访问的用户一个"10 秒读懂"的导读：
 *  - 说明这个页面在讲什么（4 个维度）
 *  - 解释颜色含义（绿/黄/红）
 *  - 建立阅读预期
 */
export function DashboardLegend() {
  return (
    <section className="rounded-xl border border-border/40 bg-card/40 px-5 py-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        {/* Left: 4 dimensions */}
        <div className="flex flex-col gap-1">
          <p className="text-sm text-foreground">
            <span className="font-medium">四个维度回答一个问题：</span>
            <span className="text-muted-foreground ml-1">现在该进攻还是防守?</span>
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span><span className="text-foreground/90 font-medium">流动性</span> · 市场里的钱多了还是少了</span>
            <span className="hidden sm:inline text-border">·</span>
            <span><span className="text-foreground/90 font-medium">经济</span> · 基本面在变好还是变差</span>
            <span className="hidden sm:inline text-border">·</span>
            <span><span className="text-foreground/90 font-medium">通胀利率</span> · 物价和利率趋势</span>
            <span className="hidden sm:inline text-border">·</span>
            <span><span className="text-foreground/90 font-medium">情绪</span> · 市场恐慌还是贪婪</span>
          </div>
        </div>

        {/* Right: color legend */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>健康</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span>观察</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            <span>压力</span>
          </div>
        </div>
      </div>
    </section>
  );
}
