import Link from 'next/link';
import type { WeeklyMacroReport } from '@/lib/api';
export async function MacroText({ kind }: { kind: 'liquidity' | 'economy' }) {
  let report: WeeklyMacroReport | null = null;
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api'}/weekly-report`, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(5000) });
    if (response.ok) report = (await response.json()).data ?? null;
  } catch { /* The evergreen explanation remains available during upstream outages. */ }
  const analysis = report?.[kind === 'liquidity' ? 'liquidity_analysis' : 'economy_analysis'];
  return <section className="mx-auto max-w-7xl px-4 py-8 md:px-6 space-y-4">
    <h2 className="text-xl font-medium">{kind === 'liquidity' ? '如何判断美元流动性状况' : '如何判断美国经济基本面'}</h2>
    <p className="text-sm leading-7 text-muted-foreground">{kind === 'liquidity'
      ? '美元流动性需要结合美联储资产负债表、财政部一般账户（TGA）、隔夜逆回购（RRP）和银行准备金观察。美联储资产减去 TGA 与 RRP 可作为净流动性的简化参考，但不能单独预测股价。TGA 上升通常吸收银行体系资金，RRP 回落可能释放资金；还应结合短期融资利率与准备金变化，区分财政现金流造成的短期波动和持续收紧。'
      : '经济基本面需要交叉观察增长、就业、消费和信贷。GDP 与就业偏强并不自动意味着股市上涨：若通胀同时上升，利率预期也可能抬高估值压力。非农与失业率衡量劳动力市场，零售和收入反映需求，信用利差反映融资风险。关注数据的发布日期、修订和连续趋势，避免用单月波动判断经济拐点。'}</p>
    {analysis?.summary && <div className="space-y-2"><h3 className="font-medium">最近一期分析 · {report?.week_label}</h3>
      {report?.generated_at && <p className="text-xs text-muted-foreground">生成时间：<time dateTime={report.generated_at}>{report.generated_at}</time></p>}
      <p className="text-sm leading-7 whitespace-pre-line">{analysis.summary}</p>
      {analysis.data_changes && <p className="text-sm leading-7 whitespace-pre-line">{analysis.data_changes}</p>}
    </div>}
    <nav className="flex flex-wrap gap-4 text-sm text-primary"><Link href="/macro">宏观总览</Link><Link href="/macro/inflation-rates">通胀与利率</Link><Link href={kind === 'liquidity' ? '/macro/economy' : '/macro/liquidity'}>{kind === 'liquidity' ? '经济基本面' : '流动性状况'}</Link><Link href="/today">市场日报</Link></nav>
  </section>;
}
