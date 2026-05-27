import type { Metadata } from 'next';
import QinbaFrankPage from './_components/QinbaFrankPage';

export const metadata: Metadata = {
  title: 'qinbafrank 投研驾驶舱',
  description: '用 qinbafrank 的公开方法论、历史观点证据和 TheMarketBrew 投研工具研究美股与宏观问题。',
};

export default function Page() {
  return <QinbaFrankPage />;
}
