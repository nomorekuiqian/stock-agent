'use client';

import { FileCheck2 } from 'lucide-react';

interface Props {
  username: string;
}

export default function TransparencyNote({ username }: Props) {
  return (
    <aside
      aria-label="内容边界说明"
      className="mx-auto mb-10 mt-8 max-w-[1480px] rounded-lg border border-border/35 bg-card/35 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] md:px-5"
    >
      <div className="flex gap-3">
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-md border border-border/45 bg-background/45 text-primary">
          <FileCheck2 className="h-4 w-4" strokeWidth={1.7} />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">
            内容边界
          </p>
          <p className="mt-2 max-w-4xl text-sm leading-relaxed text-muted-foreground">
            本页把 @{username} 的公开推文整理成主题索引、导读和原文阅读器，用来帮助理解过往观点的上下文。
            <span className="text-foreground">导读和摘要不是本人新增表态，也不构成投资建议。</span>
          </p>
          <p className="mt-1 max-w-4xl text-xs leading-relaxed text-muted-foreground">
            只有能够回到原推的内容才视为「原文支持」；判断具体含义时，请以原文、日期和当时语境为准。
          </p>
        </div>
      </div>
    </aside>
  );
}
