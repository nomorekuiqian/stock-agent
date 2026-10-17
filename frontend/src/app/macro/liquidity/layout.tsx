import { MacroText } from '../_components/MacroText';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata('/macro/liquidity', '美元流动性状况与趋势分析', '查看美联储资产负债表、TGA、逆回购与全球流动性指标。');

export default function Layout({ children }: { children: React.ReactNode }) { return <>{children}<MacroText kind="liquidity" /></>; }
