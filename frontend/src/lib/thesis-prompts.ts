export type ThesisTopic = 'buy_reason' | 'sell_condition' | 'risk_awareness' | 'outlook' | 'event_driven';

export interface ThesisPromptVariant {
  question: string;
  tags: string[];
}

export interface ThesisTopicDef {
  topic: ThesisTopic;
  label: string;
  variants: ThesisPromptVariant[];
}

const SECTOR_TAGS: Record<string, string[]> = {
  tech: ['AI 算力需求持续增长', '数据中心业务护城河', '估值合理可长期持有', '跟随市场趋势'],
  consumer: ['品牌忠诚度高', '消费刚需稳健', '市场份额持续扩大', '看好消费复苏'],
  finance: ['利率环境有利', '资产质量稳健', '分红收益稳定', '估值低于历史均值'],
  default: ['看好长期增长', '行业龙头', '价值低估', '分红稳定'],
};

export const THESIS_TOPICS: ThesisTopicDef[] = [
  {
    topic: 'buy_reason',
    label: '买入理由',
    variants: [
      { question: '你看好 {sym} 的核心逻辑是？', tags: [] },
      { question: '一句话说说为什么持有 {sym}？', tags: [] },
      { question: '{sym} 最吸引你的是什么？', tags: [] },
    ],
  },
  {
    topic: 'sell_condition',
    label: '卖出条件',
    variants: [
      { question: '什么情况下你会考虑卖出 {sym}？', tags: ['基本面恶化', '估值过高', '有更好标的', '止损纪律'] },
      { question: '{sym} 跌到多少你会离场？', tags: ['跌破成本20%', '跌破关键位', '视情况而定', '不止损长期持有'] },
      { question: '持有 {sym} 的底线条件是什么？', tags: ['营收持续增长', '行业地位不变', '管理层稳定', '现金流健康'] },
    ],
  },
  {
    topic: 'risk_awareness',
    label: '风险认知',
    variants: [
      { question: '持有 {sym} 最大的风险是什么？', tags: ['估值过高', '竞争加剧', '政策风险', '宏观不确定性'] },
      { question: '{sym} 有什么因素让你担心？', tags: ['增速放缓', '利润率压力', '行业周期', '暂时不担心'] },
      { question: '如果 {sym} 暴跌 30%，你会怎么做？', tags: ['加仓', '持有不动', '减仓观望', '全部卖出'] },
    ],
  },
  {
    topic: 'outlook',
    label: '预期展望',
    variants: [
      { question: '你觉得 {sym} 一年后会怎样？', tags: ['大幅上涨', '稳健增长', '横盘震荡', '不确定'] },
      { question: '{sym} 的下一个催化剂是什么？', tags: ['财报超预期', '新产品发布', '行业政策利好', '市场情绪回暖'] },
      { question: '长期来看，{sym} 值得持有吗？', tags: ['核心持仓', '中期持有', '短线交易', '还在观察'] },
    ],
  },
  {
    topic: 'event_driven',
    label: '事件驱动',
    variants: [
      { question: '{sym} 即将发布财报，你怎么看？', tags: ['看好超预期', '谨慎观望', '考虑减仓避险', '不影响长期逻辑'] },
      { question: '近期消息面对 {sym} 有什么影响？', tags: ['利好确认', '短期噪音', '需要关注', '不确定'] },
      { question: '当前市场环境下，{sym} 的表现符合预期吗？', tags: ['超出预期', '符合预期', '不及预期', '还需观察'] },
    ],
  },
];

export function getSectorTags(sector?: string): string[] {
  if (!sector) return SECTOR_TAGS.default;
  const key = sector.toLowerCase();
  if (key.includes('tech') || key.includes('科技')) return SECTOR_TAGS.tech;
  if (key.includes('consumer') || key.includes('消费')) return SECTOR_TAGS.consumer;
  if (key.includes('financ') || key.includes('金融')) return SECTOR_TAGS.finance;
  return SECTOR_TAGS.default;
}

export function pickThesisPrompt(
  context: 'just_added' | 'detail_expand' | 'red_alert',
  symbol: string,
): { question: string; tags: string[] } {
  let topic: ThesisTopicDef;

  if (context === 'red_alert') {
    topic = THESIS_TOPICS.find(t => t.topic === 'risk_awareness')!;
  } else if (context === 'just_added') {
    topic = THESIS_TOPICS.find(t => t.topic === 'buy_reason')!;
  } else {
    const eligible = THESIS_TOPICS.filter(t => t.topic !== 'event_driven');
    topic = eligible[Math.floor(Math.random() * eligible.length)];
  }

  const variant = topic.variants[Math.floor(Math.random() * topic.variants.length)];
  const question = variant.question.replace('{sym}', symbol);
  const tags = variant.tags.length > 0 ? variant.tags : getSectorTags();

  return { question, tags };
}
