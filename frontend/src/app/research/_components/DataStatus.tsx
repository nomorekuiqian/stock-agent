'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

function timeAgo(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH} 小时前`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD} 天前`;
}

interface DataStatusProps {
  universeSize?: number;
  freshness?: string | null;
  isStale?: boolean;
  inline?: boolean;
}

export default function DataStatus({
  universeSize: propSize,
  freshness: propFreshness,
  isStale: propStale,
  inline = false,
}: DataStatusProps) {
  const [stockCount, setStockCount] = useState<number>(0);

  // Fetch total stock count from sectors endpoint on mount
  useEffect(() => {
    if (propSize && propSize > 0) return;
    let cancelled = false;
    api.screener.sectors().then((res) => {
      if (cancelled || !res.success) return;
      const total = (res.sectors as { count?: number }[]).reduce(
        (sum, s) => sum + (s.count || 0), 0
      );
      setStockCount(total);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [propSize]);

  const universeSize = propSize && propSize > 0 ? propSize : stockCount;
  const freshness = propFreshness || null;
  const isStale = propStale ?? false;

  if (inline) {
    return (
      <span className="text-xs text-muted-foreground/70">
        {universeSize > 0 && (
          <>
            <span className="font-data tabular-nums">{universeSize.toLocaleString()}</span> 只美股
          </>
        )}
        {freshness && universeSize > 0 && (
          <> · 更新于{timeAgo(freshness)}</>
        )}
        {isStale && <span className="text-amber-500"> · 数据可能过期</span>}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <span>
        {universeSize > 0 ? (
          <>
            <span className="font-data tabular-nums">{universeSize.toLocaleString()}</span> 只美股
          </>
        ) : '数据加载中...'}
      </span>
      {freshness && (
        <>
          <span className="text-border">|</span>
          <span>更新于 {timeAgo(freshness)}</span>
        </>
      )}
      {isStale && (
        <>
          <span className="text-border">|</span>
          <span className="text-amber-500">数据可能过期</span>
        </>
      )}
    </div>
  );
}
