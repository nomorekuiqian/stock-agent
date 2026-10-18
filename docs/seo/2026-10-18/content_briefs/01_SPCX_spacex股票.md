# Brief 01：SpaceX(SPCX) 股票页（样本组第 1 优先）
- **URL**：/stock/SPCX（已存在；GSC 已有 8 次展示，平均排名 8.75，是全站唯一接近首页的个股页）
- **主词**：spacex 股票（美国 12,100/月，加拿大 4,400/月）
- **次级词**（美国月量）：SPCX股票 1,600；spacex 上市 720；SPCX股價 720；SPCX股价 590；spacex 股票代码 260；spcx 是什么 30
- **意图**：导航 + 信息（这是不是 SpaceX？代码是什么？什么时候上市的？现在多少钱？）
- **当前问题**：title「Space Exploration Technologies Corp. (SPCX) 个股分析」不含「SpaceX」也不含「股票」；页面没有 JSON-LD；内容只有数据表；不在 stock sitemap 中。
- **Title**：`SpaceX(SPCX)股票：股价、上市表现与AI解读 | TheMarketBrew`
- **H1**：`SpaceX（SPCX）` 副标题 `Space Exploration Technologies Corp. · {交易所，取自数据层} · 航天`
- **首屏直接答案（模板）**：`SPCX 是 SpaceX（太空探索技术公司）的美股交易代码。截至 {date} 收盘报 {price} 美元（{chg}）；上市日期 {ipo_date}，发行价 {ipo_price} 美元。`（上市日期和发行价必须取自数据层；没有就省略整句）
- **独特模块**：
  1. #about：SpaceX 的业务构成（发射服务、星链 Starlink、星舰），用中文写，150–300 字。
  2. #why：上市以来单日涨跌幅超过 ±3% 的事件（取自 /today）。
  3. #kol：推特博主对 SPCX 的观点。
  4. 「上市以来表现」小表：发行价、首日收盘、至今涨跌幅（数据层）。
  5. 相关代码：其他航天股（RKLB 等，链接到样本组页面）。
- **FAQ**：SPCX 是 SpaceX 吗？｜SpaceX 什么时候上市的？｜SPCX 在哪个交易所交易？｜SpaceX 下一次财报是什么时候？｜投资 SPCX 需要关注哪些风险？
- **禁用**：「SpaceX 必涨」「值得买」「目标价必达」。
- **验收**：title/H1 含「SpaceX」「股票」；加入 sitemap；独特内容 ≥40%；GSC 中「spacex 股票」类查询开始出现展示。
