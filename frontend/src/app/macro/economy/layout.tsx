import { MacroText } from '../_components/MacroText';
import { Metadata } from 'next';

export const metadata: Metadata = {
  alternates: { canonical: '/macro/economy' },
  openGraph: { url: '/macro/economy' },
  title: '经济基本面 - GDP、就业与信贷风险',
  description: '追踪美国经济核心指标：GDP 增速、就业与非农数据、企业盈利与信贷风险，评估经济健康状况与衰退概率。',
};

export default function EconomyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}<MacroText kind="economy" /></>;
}
