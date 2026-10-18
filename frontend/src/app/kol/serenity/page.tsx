import { KolPublicProfile } from '@/components/KolPublicProfile';
import { pageMetadata } from '@/lib/seo';
export const dynamic='force-dynamic';
export const metadata = pageMetadata('/kol/serenity', '白毛股神 Serenity（@aleabitoreddit）最新观点：瓶颈理论与提及个股', '基于公开发言整理的历史观点与研究框架，不构成投资建议。');
export default function Page() { return <KolPublicProfile slug="serenity" />; }
