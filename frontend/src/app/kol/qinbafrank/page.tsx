import { KolPublicProfile } from '@/components/KolPublicProfile';
import { pageMetadata } from '@/lib/seo';
export const dynamic='force-dynamic';
export const metadata = pageMetadata('/kol/qinbafrank', 'qinbafrank 最新观点：美股、宏观与板块观点追踪（@qinbafrank）', '基于公开发言整理的历史观点与研究框架，不构成投资建议。');
export default function Page() { return <KolPublicProfile slug="qinbafrank" />; }
