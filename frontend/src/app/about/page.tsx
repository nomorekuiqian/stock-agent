import Link from 'next/link';
import { InformationPage } from '@/components/InformationPage';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata('/about', '关于我们', '少花时间追噪音，多看事实和主线。');

export default function Page() {
  return <InformationPage label="About TheMarketBrew" title="关于我们" intro="少花时间追噪音，多看事实和主线。">
    <section><h2>从一份日报开始</h2><p>TheMarketBrew 面向关注美股的中文投资者，将行情、新闻与公开观点整理成可阅读、可追问的研究材料，帮助理解每天发生的变化。</p><p>这个项目从一份 AI 日报开始，逐步加入盘前情报、个股研究、宏观数据与研究助手。我们希望把分散的信息整理成有来源、可追问的研究材料。</p></section>
<section><h2>我们提供什么</h2><p>以美股为核心的中文市场简报、数据展示和 AI 辅助研究。你可以先阅读公开日报，再根据需要选择邮件订阅或更深入的研究功能。</p><p><Link href="/today">阅读盘后总览</Link> · <Link href="/pricing">了解订阅方案</Link></p></section>
<section><h2>如何看待 AI 研究</h2><p>AI 适合整理资料、比较观点和提出研究问题，但可能误读数据、遗漏信息或生成不准确的结论。报告和回答应当作为研究起点，关键事实仍需要回到原始来源核实。</p><p>平台引用公开博主观点时，不代表博主本人参与服务、认可分析或为平台背书。</p></section>
<section><h2>反馈与改进</h2><p>你的使用问题、内容纠错和改进建议，都可以通过<Link href="/contact">联系与支持</Link>页面找到反馈方式。</p></section>
  </InformationPage>;
}
