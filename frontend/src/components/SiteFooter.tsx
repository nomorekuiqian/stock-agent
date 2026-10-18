import Link from 'next/link';
import { Logo } from '@/components/Logo';

const groups = [
  { title: '产品', links: [['盘前情报', '/morning'], ['盘后总览', '/today'], ['AI 研究助手', '/research'], ['个股研究', '/stock'], ['宏观研究', '/macro'], ['定价与订阅', '/pricing'], ['交易时间与休市', '/guide/us-market-hours']] },
  { title: '了解我们', links: [['关于 TheMarketBrew', '/about'], ['联系与支持', '/contact'], ['历史日报', '/today/archive']] },
  { title: '条款与隐私', links: [['服务条款', '/terms'], ['隐私政策', '/privacy'], ['投资与 AI 风险', '/terms#investment-risk'], ['订阅与退款', '/terms#billing']] },
];

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-border/50 bg-card/20">
      <div className="mx-auto max-w-6xl px-4 py-12 md:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div>
            <Link href="/" className="inline-flex min-h-11 items-center gap-3 font-semibold text-foreground"><Logo className="h-7 w-7" />TheMarketBrew</Link>
            <p className="mt-4 max-w-xs text-sm leading-7 text-muted-foreground">面向中文投资者的美股研究工具。用日报、数据和 AI 辅助研究，理解市场变化。</p>
            <a id="site-social" href="https://x.com/golden_pan1" target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-primary">X / Twitter ↗</a>
          </div>
          {groups.map(group => (
            <nav key={group.title} aria-label={`页脚：${group.title}`}>
              <h2 className="mb-3 text-sm font-semibold text-foreground">{group.title}</h2>
              <ul>{group.links.map(([label, href]) => <li key={href}><Link href={href} className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-primary">{label}</Link></li>)}</ul>
            </nav>
          ))}
        </div>
        <div className="mt-10 space-y-4 border-t border-border/50 pt-6 text-sm leading-7 text-muted-foreground">
          <p>本页内容由 TheMarketBrew 基于公开数据与 AI 生成，仅供研究与信息参考，不构成任何投资建议或买卖推荐。美股投资有风险，请独立判断。数据更新时间见各内容模块（ET）。</p>
          <p>© {new Date().getFullYear()} TheMarketBrew</p>
        </div>
      </div>
    </footer>
  );
}
