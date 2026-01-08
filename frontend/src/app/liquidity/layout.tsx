import { Metadata } from 'next';

export const metadata: Metadata = {
  title: '流动性监控仪表盘 - 美联储资产负债表追踪',
  description: '实时监控美联储流动性指标：Fed 总资产 (WALCL)、财政部一般账户 (TGA)、隔夜逆回购 (RRP)、净流动性、NFCI 金融条件指数。理解市场流动性变化。',
  keywords: [
    '美联储流动性', '流动性监控', 'Fed 资产负债表', '净流动性',
    'TGA', 'RRP', 'WALCL', 'NFCI', '金融条件指数',
    '量化紧缩 QT', '量化宽松 QE', '银行准备金',
    'Fed liquidity', 'liquidity tracker', 'Fed balance sheet'
  ],
  openGraph: {
    title: '流动性监控仪表盘 - MarketBrew',
    description: '实时追踪美联储流动性指标，理解市场资金面变化',
    type: 'website',
  },
};

export default function LiquidityLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
