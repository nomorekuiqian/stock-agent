'use client';

interface RiskGaugeProps {
  value: number; // 0-10
  loading?: boolean;
}

export function RiskGauge({ value, loading = false }: RiskGaugeProps) {
  const clampedValue = Math.min(Math.max(value, 0), 10);
  const position = (clampedValue / 10) * 100;

  const getStatus = (v: number) => {
    if (v < 4) return { label: 'Low Risk', labelZh: '低风险', color: 'emerald' };
    if (v < 7) return { label: 'Medium Risk', labelZh: '中等风险', color: 'amber' };
    return { label: 'High Risk', labelZh: '高风险', color: 'red' };
  };

  const status = getStatus(clampedValue);

  if (loading) {
    return (
      <div className="bg-card rounded-xl border border-border p-5">
        <div className="animate-pulse">
          <div className="h-4 w-48 bg-muted rounded mb-4" />
          <div className="h-3 w-full bg-muted rounded mb-4" />
          <div className="h-8 w-20 bg-muted rounded mx-auto" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border border-border p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-foreground">综合风险评分</h3>
        <span className="text-xs text-muted-foreground">4个类别，等权重</span>
      </div>

      {/* Gauge bar */}
      <div className="relative mb-2">
        <div className="h-2.5 bg-gradient-to-r from-emerald-500 via-amber-500 to-red-500 rounded-full" />
        <div
          className="absolute w-4 h-4 bg-white border-2 border-gray-800 dark:border-gray-200 rounded-full -top-[3px] shadow-md transition-all duration-300"
          style={{ left: `${position}%`, transform: 'translateX(-50%)' }}
        />
      </div>

      {/* Labels */}
      <div className="flex justify-between text-xs text-muted-foreground mb-4">
        <span>低</span>
        <span>中</span>
        <span>高</span>
      </div>

      {/* Current value */}
      <div className="text-center">
        <span className={`text-3xl font-bold font-data ${
          status.color === 'emerald' ? 'text-emerald-500' :
          status.color === 'red' ? 'text-red-500' : 'text-amber-500'
        }`}>
          {clampedValue.toFixed(1)}
        </span>
        <span className="text-lg text-muted-foreground ml-1">/ 10</span>
        <div className="mt-2">
          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
            status.color === 'emerald' ? 'bg-emerald-500/10 text-emerald-500' :
            status.color === 'red' ? 'bg-red-500/10 text-red-500' : 'bg-amber-500/10 text-amber-500'
          }`}>
            {status.labelZh}
          </span>
        </div>
      </div>

      {/* Explanation */}
      <p className="text-xs text-muted-foreground text-center mt-4">
        {clampedValue < 4
          ? '宏观环境整体对风险资产构成支撑'
          : clampedValue < 7
          ? '部分宏观逆风正在显现，需密切关注'
          : '多个维度检测到显著宏观风险'
        }
      </p>
    </div>
  );
}
