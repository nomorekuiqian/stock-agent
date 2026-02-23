// Technical indicator explanations dictionary
// Each indicator has: zh (Chinese name), en (English name), tip (explanation), analogy (life analogy)

export const TECHNICAL_INDICATOR_EXPLANATIONS: Record<
  string,
  { zh: string; en: string; tip: string; analogy: string }
> = {
  // Oscillators
  RSI: {
    zh: '相对强弱指数',
    en: 'RSI',
    tip: '衡量近期涨跌力度的指标，范围 0-100。高于 70 表示可能涨过头（超买），低于 30 表示可能跌过头（超卖）。',
    analogy: '像温度计：超过 70 度就"发烧"了（涨太多），低于 30 度就"太冷"了（跌太多）。',
  },
  MACD: {
    zh: '平滑异同移动平均线',
    en: 'MACD',
    tip: '通过两条均线的差值判断趋势方向和动能。MACD 柱状图扩大表示趋势加速，收缩表示趋势减弱。',
    analogy: '像汽车的油门和刹车：柱状图变大 = 在加速，变小 = 在减速。',
  },
  ADX: {
    zh: '平均趋向指数',
    en: 'ADX',
    tip: '衡量趋势强度（不分方向），范围 0-100。高于 25 表示趋势较强，低于 20 表示市场横盘。',
    analogy: '像风速计：只告诉你风有多大，不告诉你往哪吹。ADX 高 = 大风天，ADX 低 = 无风。',
  },
  ATR: {
    zh: '平均真实波幅',
    en: 'ATR',
    tip: '衡量价格每日波动幅度。ATR 越大，价格波动越剧烈。常用于设置止损位。',
    analogy: '像地震的震级：ATR 大 = 价格在"地震"，波动大；ATR 小 = 地面平静。',
  },
  // Moving Averages
  SMA: {
    zh: '简单移动平均线',
    en: 'SMA',
    tip: '过去 N 天收盘价的平均值。SMA20 是短期趋势，SMA50 是中期，SMA200 是长期趋势线。',
    analogy: '像考试的平均分：SMA200 是全年平均分（长期表现），SMA20 是最近几次的平均分（短期状态）。',
  },
  'SMA 20': {
    zh: '20 日均线',
    en: 'SMA 20',
    tip: '最近 20 个交易日的平均价格，代表短期趋势。价格在均线上方通常被视为短期看涨。',
    analogy: '像最近一个月的"平均成绩"，价格高于它说明最近表现不错。',
  },
  SMA20: {
    zh: '20 日均线',
    en: 'SMA 20',
    tip: '最近 20 个交易日的平均价格，代表短期趋势。价格在均线上方通常被视为短期看涨。',
    analogy: '像最近一个月的"平均成绩"，价格高于它说明最近表现不错。',
  },
  SMA50: {
    zh: '50 日均线',
    en: 'SMA 50',
    tip: '最近 50 个交易日的平均价格，代表中期趋势。是机构投资者常看的重要均线。',
    analogy: '像一个学期的"期中考平均分"，是衡量中期趋势的重要参考线。',
  },
  SMA200: {
    zh: '200 日均线',
    en: 'SMA 200',
    tip: '最近 200 个交易日的平均价格，代表长期趋势。价格在其上方被视为牛市，下方为熊市。',
    analogy: '像"全年平均成绩"——只要在这条线上方，说明大方向还是好的。',
  },
  EMA: {
    zh: '指数移动平均线',
    en: 'EMA',
    tip: '类似 SMA 但更重视近期数据。对价格变化反应更快，适合捕捉短期趋势变化。',
    analogy: '像给最近的考试打更高的权重——更能反映"当前状态"。',
  },
  // Bollinger Bands
  BB: {
    zh: '布林带',
    en: 'Bollinger Bands',
    tip: '由三条线组成的通道：中线是 20 日均线，上下线是 2 倍标准差。价格通常在通道内运动。',
    analogy: '像一条河的堤坝：价格像河水，通常在堤坝内流动。碰到上堤坝 = 可能回落，碰到下堤坝 = 可能反弹。布林带收窄 = 弹簧被压紧，可能有大动作。',
  },
  // Signals
  STRONG_BUY: {
    zh: '强烈看涨',
    en: 'Strong Buy',
    tip: '多数技术指标同时发出买入信号，表示上涨动能很强。但不代表一定会涨。',
    analogy: '像天气预报说"大晴天"——大概率好天气，但也不是 100%。',
  },
  BUY: {
    zh: '看涨',
    en: 'Buy',
    tip: '技术指标偏向买入信号，表示上涨可能性较大。',
    analogy: '像天气预报说"多云转晴"——总体偏好，但需要关注变化。',
  },
  NEUTRAL: {
    zh: '观望',
    en: 'Neutral',
    tip: '技术指标信号混合，没有明确方向。建议等待更清晰的信号。',
    analogy: '像天气预报说"阴天"——不确定会晴还是会下雨，最好带把伞出门。',
  },
  SELL: {
    zh: '看跌',
    en: 'Sell',
    tip: '技术指标偏向卖出信号，表示下跌可能性较大。',
    analogy: '像天气预报说"多云转雨"——要留意风险。',
  },
  STRONG_SELL: {
    zh: '强烈看跌',
    en: 'Strong Sell',
    tip: '多数技术指标同时发出卖出信号，表示下跌压力很大。',
    analogy: '像天气预报说"暴风雨"——风险较大，注意避险。',
  },
  // Chart Patterns
  golden_cross: {
    zh: '金叉',
    en: 'Golden Cross',
    tip: '短期均线从下方穿越长期均线。经典的看涨信号，暗示趋势可能从下跌转为上涨。',
    analogy: '像短跑选手超越长跑选手——短期势头比长期更强了。',
  },
  death_cross: {
    zh: '死叉',
    en: 'Death Cross',
    tip: '短期均线从上方穿越长期均线。经典的看跌信号，暗示趋势可能从上涨转为下跌。',
    analogy: '像短跑选手被长跑选手反超——短期势头开始落后了。',
  },
  support: {
    zh: '支撑位',
    en: 'Support',
    tip: '价格下跌时容易停住的价位。因为很多人在这个价格附近愿意买入。',
    analogy: '像地板：球掉到地板上会弹起来。很多买家在支撑位等着"接盘"。',
  },
  resistance: {
    zh: '阻力位',
    en: 'Resistance',
    tip: '价格上涨时容易受阻的价位。因为很多人在这个价格附近愿意卖出。',
    analogy: '像天花板：球弹到天花板会落下来。很多卖家在阻力位等着"出货"。',
  },
  overbought: {
    zh: '超买',
    en: 'Overbought',
    tip: '指标显示近期涨幅过大，价格可能已经"涨过头"，有回调风险。',
    analogy: '像弹簧拉伸过度——拉得越高，弹回来的力量可能越大。',
  },
  oversold: {
    zh: '超卖',
    en: 'Oversold',
    tip: '指标显示近期跌幅过大，价格可能已经"跌过头"，有反弹机会。',
    analogy: '像弹簧压缩到极限——压得越低，反弹的可能性越大。',
  },
  divergence: {
    zh: '背离',
    en: 'Divergence',
    tip: '价格创新高/新低但指标没有跟随，暗示趋势可能反转。',
    analogy: '像一个人嘴上说"我很好"但脸色很差——表面和内在不一致，要注意。',
  },
  // MA Alignment
  ma_bullish: {
    zh: '多头排列',
    en: 'Bullish MA Alignment',
    tip: '短期、中期、长期均线从上到下依次排列（20 > 50 > 200），表示各时间周期趋势一致向上。',
    analogy: '像学校里短考、期中考、期末考成绩都在进步——全面向好。',
  },
  ma_bearish: {
    zh: '空头排列',
    en: 'Bearish MA Alignment',
    tip: '短期、中期、长期均线从下到上排列（20 < 50 < 200），表示各时间周期趋势一致向下。',
    analogy: '像成绩全面下滑——短期、中期、长期都在走低。',
  },
};

// Signal rating to Chinese label mapping
export const SIGNAL_LABELS: Record<string, string> = {
  STRONG_BUY: '强烈看涨',
  BUY: '看涨',
  NEUTRAL: '观望',
  SELL: '看跌',
  STRONG_SELL: '强烈看跌',
};

// Signal rating to color mapping (Tailwind classes)
export const SIGNAL_COLORS: Record<string, { text: string; bg: string; dot: string; border: string }> = {
  STRONG_BUY: {
    text: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    dot: 'bg-emerald-400',
    border: 'border-emerald-500/30',
  },
  BUY: {
    text: 'text-emerald-400/80',
    bg: 'bg-emerald-500/5',
    dot: 'bg-emerald-400/80',
    border: 'border-emerald-500/20',
  },
  NEUTRAL: {
    text: 'text-amber-400',
    bg: 'bg-amber-500/10',
    dot: 'bg-amber-400',
    border: 'border-amber-500/30',
  },
  SELL: {
    text: 'text-red-400/80',
    bg: 'bg-red-500/5',
    dot: 'bg-red-400/80',
    border: 'border-red-500/20',
  },
  STRONG_SELL: {
    text: 'text-red-400',
    bg: 'bg-red-500/10',
    dot: 'bg-red-400',
    border: 'border-red-500/30',
  },
};
