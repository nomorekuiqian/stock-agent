'use client';

interface NFCIGaugeProps {
  value: number;
  loading?: boolean;
}

export function NFCIGauge({ value, loading = false }: NFCIGaugeProps) {
  // NFCI: negative = loose, positive = tight
  // Typical range: -1 to +1, but can exceed
  const clampedValue = Math.min(Math.max(value, -1.5), 1.5);
  const position = ((clampedValue + 1.5) / 3) * 100;

  const getStatus = (v: number) => {
    if (v < -0.5) return { label: '宽松', color: 'emerald' };
    if (v > 0.5) return { label: '紧缩', color: 'red' };
    return { label: '中性', color: 'amber' };
  };

  const status = getStatus(value);

  if (loading) {
    return (
      <div className="bg-card rounded-xl border border-border p-5">
        <div className="animate-pulse">
          <div className="h-4 w-40 bg-muted rounded mb-4" />
          <div className="h-3 w-full bg-muted rounded mb-4" />
          <div className="h-8 w-20 bg-muted rounded mx-auto" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border border-border p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-foreground">金融状况指数 (NFCI)</h3>
        <span className="text-xs text-muted-foreground">芝加哥联储</span>
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
        <span>宽松</span>
        <span>中性</span>
        <span>紧缩</span>
      </div>

      {/* Current value */}
      <div className="text-center">
        <span className={`text-3xl font-bold ${
          status.color === 'emerald' ? 'text-emerald-500' :
          status.color === 'red' ? 'text-red-500' : 'text-amber-500'
        }`}>
          {value.toFixed(2)}
        </span>
        <div className="mt-2">
          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
            status.color === 'emerald' ? 'bg-emerald-500/10 text-emerald-500' :
            status.color === 'red' ? 'bg-red-500/10 text-red-500' : 'bg-amber-500/10 text-amber-500'
          }`}>
            {status.label}
          </span>
        </div>
      </div>

      {/* Explanation */}
      <p className="text-xs text-muted-foreground text-center mt-4">
        {value < 0
          ? '负值表示金融条件较平均更宽松,有利于风险资产'
          : '正值表示金融条件较平均更紧缩,风险资产承压'
        }
      </p>
    </div>
  );
}
