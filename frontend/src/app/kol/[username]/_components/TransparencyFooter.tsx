'use client';

interface Props {
  username: string;
}

export default function TransparencyFooter({ username }: Props) {
  return (
    <footer className="border-t border-border/40 bg-background">
      <div className="mx-auto max-w-7xl px-4 py-7 md:px-6">
        <hr className="editorial-rule mb-5" />
        <p className="font-data text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          透明度声明
        </p>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          本页基于 @{username} 的公开推文蒸馏，
          <span className="text-foreground">不是本人发言，也不构成投资建议</span>
          。方法论为已蒸馏内容；推文摘录均为原文逐字 + 原文链接 + 日期 + 互动数；命中原推才说「原文支持」。价格数据来自 FMP。
        </p>
      </div>
    </footer>
  );
}
