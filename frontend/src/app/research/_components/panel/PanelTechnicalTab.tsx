'use client';

import dynamic from 'next/dynamic';
import { useTechnicalData } from '@/hooks/queries/use-technical-data';

const TechnicalChart = dynamic(
  () => import('@/components/technical/TechnicalChart').then(mod => mod.TechnicalChart),
  { ssr: false, loading: () => <div className="h-[400px] bg-muted/10 animate-pulse rounded-xl" /> },
);

export default function PanelTechnicalTab({ symbol }: { symbol: string }) {
  const { data: chartData, isLoading } = useTechnicalData(symbol, 'daily');

  const derived = chartData?.derived;
  const sr = chartData?.support_resistance;

  return (
    <div className="px-4 py-4 space-y-4">
      {/* K-Line Chart */}
      {isLoading ? (
        <div className="h-[400px] bg-card/30 animate-pulse rounded-xl" />
      ) : chartData ? (
        <TechnicalChart data={chartData} annotations={[]} />
      ) : (
        <div className="h-[400px] bg-card/30 rounded-xl flex items-center justify-center">
          <p className="text-sm text-muted-foreground">暂无图表数据</p>
        </div>
      )}

      {/* Derived signals */}
      {derived && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-1 h-3.5 rounded-full bg-emerald-500/60" />
            <h4 className="text-xs font-medium text-muted-foreground">技术信号</h4>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <SignalItem label="趋势方向" value={derived.trend_direction} />
            <SignalItem label="趋势强度" value={derived.trend_strength != null ? `${derived.trend_strength.toFixed(0)}` : '-'} />
            <SignalItem label="RSI 区间" value={derived.rsi_zone} />
            <SignalItem label="MACD 信号" value={derived.macd_cross} />
            <SignalItem label="均线排列" value={derived.ma_alignment} />
            <SignalItem label="SMA 50/200" value={derived.sma_50_200_cross} />
            <SignalItem label="布林位置" value={derived.bb_position} />
            <SignalItem label="成交量趋势" value={derived.volume_trend} />
          </div>
        </div>
      )}

      {/* Support & Resistance */}
      {sr && (sr.support_1 || sr.resistance_1) && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-1 h-3.5 rounded-full bg-amber-500/60" />
            <h4 className="text-xs font-medium text-muted-foreground">支撑与阻力</h4>
          </div>
          <div className="bg-card/50 border border-border/30 rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/30 bg-card/60">
                  <th className="py-2 px-3 text-left text-muted-foreground font-medium">级别</th>
                  <th className="py-2 px-3 text-right text-muted-foreground font-medium">价格</th>
                </tr>
              </thead>
              <tbody>
                {sr.resistance_2 != null && (
                  <tr className="border-b border-border/15">
                    <td className="py-2 px-3 text-red-400">阻力 2</td>
                    <td className="py-2 px-3 text-right font-data tabular-nums text-foreground">${sr.resistance_2.toFixed(2)}</td>
                  </tr>
                )}
                {sr.resistance_1 != null && (
                  <tr className="border-b border-border/15">
                    <td className="py-2 px-3 text-red-400">阻力 1</td>
                    <td className="py-2 px-3 text-right font-data tabular-nums text-foreground">${sr.resistance_1.toFixed(2)}</td>
                  </tr>
                )}
                {sr.current_price != null && (
                  <tr className="border-b border-border/15 bg-primary/5">
                    <td className="py-2 px-3 text-primary font-medium">当前价</td>
                    <td className="py-2 px-3 text-right font-data tabular-nums text-foreground font-medium">${sr.current_price.toFixed(2)}</td>
                  </tr>
                )}
                {sr.support_1 != null && (
                  <tr className="border-b border-border/15">
                    <td className="py-2 px-3 text-emerald-400">支撑 1</td>
                    <td className="py-2 px-3 text-right font-data tabular-nums text-foreground">${sr.support_1.toFixed(2)}</td>
                  </tr>
                )}
                {sr.support_2 != null && (
                  <tr>
                    <td className="py-2 px-3 text-emerald-400">支撑 2</td>
                    <td className="py-2 px-3 text-right font-data tabular-nums text-foreground">${sr.support_2.toFixed(2)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function SignalItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card/50 border border-border/30 rounded-lg px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-data font-medium text-foreground mt-0.5">{value || '-'}</div>
    </div>
  );
}
