import samples from '@/lib/seo-samples.json';
import { SITE_URL } from '@/lib/seo';
export function GET() {
  const body = '# TheMarketBrew\n> 面向华人投资者的中文 AI 美股研究网站。内容仅供研究参考，不构成投资建议。\n## 核心页面\n' + [['个股', '/stock'], ['今日行情复盘', '/today'], ['盘前早报', '/morning'], ['宏观', '/macro'], ['博主观点', '/kol'], ['美股开盘时间与休市日历','/guide/us-market-hours']].map(([name, path]) => `- ${name}：${SITE_URL}${path}`).join('\n') + '\n## 样本个股\n' + samples.map(item => `- ${item.name}（${item.symbol}）：${SITE_URL}/stock/${item.symbol}`).join('\n') + '\n';
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
