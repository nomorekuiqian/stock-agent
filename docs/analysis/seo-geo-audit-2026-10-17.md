# SEO / GEO 基础审计 — 2026-10-17

状态：此文记录第一轮基础修复，原“尚未提交、部署”状态已过时；本轮线上审计确认部分基础修复已生效。后续清单修复及当前发布状态见 [SEO 清单修复](seo-checklist-fixes-2026-10-17.md)。

## 已确认并修复

| 优先级 | 问题与证据 | 修复 |
|---|---|---|
| P0 | 线上 www 域名的 `/robots.txt`、`/sitemap.xml` 均返回 307，Location 指向 login | middleware 精确放行这两个文件，不改变私有页面鉴权 |
| P1 | sitemap 调用 limit=500；线上报告接口返回 422，明确上限 100 | 每批 100，早晚报分别最多 500 条；每小时刷新，10 秒请求超时 |
| P1 | 正式站跳转至 www，但 metadataBase、sitemap、文章实体 URL 均不带 www | SEO 域名统一为 `https://www.themarketbrew.com` |
| P1 | 首页、定价等缺少独立 canonical；日报归档继承栏目 canonical，推特简报日期页也继承栏目 canonical | 为首页、定价、联系、股票入口、宏观、早晚报归档和推特日期/归档页补充独立元信息 |
| P2 | 登录页线上 HTML 为 index, follow；robots 禁抓并不能替代 noindex | 功能与私有路由返回 X-Robots-Tag: noindex, follow，robots 允许抓取响应头；API 仍禁抓 |
| P2 | 静态页面 lastModified 每次生成都取当前时间 | 不再伪造修改时间；报告只使用有效内容日期 |
| P2 | 首页缺少站点/组织实体；文章 JSON-LD 直接插入文本 | 首页添加与可见产品一致的 Organization/WebSite；文章域名一致，JSON 序列化转义 `<` |
| P2 | 报告分享元信息缺少图片、地址；根级 og:url 指向首页 | 报告补全 URL、现有图片，移除根级首页 og:url，避免错误继承 |

早报 sitemap 只读取匿名公开列表，不放开付费正文。暂停功能和调度不变。

## 验证

- 18 项回归测试通过：robots/sitemap 匿名访问、私有路径仍受保护、功能页 noindex、分页边界、单接口失败降级、日期有效性、JSON-LD 安全序列化。
- 修改文件 ESLint、TypeScript 检查通过；生产构建通过。
- 本地生产服务实测：robots 200 text/plain、sitemap 200 application/xml；login 与 pricing/success 返回 noindex；pricing 可索引；profile 仍 307 到登录页。
- 实际 HTML 检查：首页、pricing、today/archive、morning/archive、macro/economy 的 canonical 使用 www 和各自路径。
- 本地构建/API 指向不可用的隔离端口，用于检查静态页面和降级路径；动态地图分页使用 mock 覆盖，没有为验证触发邮件、付款或生成任务。
- 开发服务的 middleware 行为与生产构建不同，本次鉴权及响应头结论以生产服务实测为准。

## 后续优先事项

1. 发布后检查线上 robots/sitemap、动态报告 URL 数量、抽样详情 canonical/noindex；再向 Search Console 与 Bing Webmaster Tools 提交 sitemap。目前未读取这些平台，不能声称已收录或增长。
2. 归档列表和部分图表/推特页面依赖客户端加载。后续优先为高价值公开内容提供服务端正文/列表及可抓取内链，保持付费边界；个股详情暂未纳入 sitemap，先核实有效标的与匿名页面质量。
3. 加强报告可见的来源链接、数据截至时间、AI 生成说明、作者/编辑责任及方法说明；核验首页 1,500+ 用户、300+ 观点源等数字的真实口径。本轮未把未经核实的数字放进结构化数据。
4. 分别检查无效股票代码、无效日期与后端暂时失败的状态码；错误页不应长期形成 soft 404。本轮未修改数据获取错误语义。
5. 后端故障时 sitemap 会缩减为成功列表和静态 URL，下次小时刷新重试；当前每类最多 500 条，超过后应做 sitemap 分片。
6. 本轮没有测量 Core Web Vitals、移动端体验或外部 AI 引用率，也未覆盖所有 URL。字体请求、内容渲染与图片性能需要独立测量后再优化。

## GEO 判断与依据

先把公开内容做到可抓取、URL 一致、实体明确、证据可核查。Google 的 AI 搜索官方指南说明，既有 SEO 原则同样适用，没有额外的特殊标记要求；这不代表其他 AI 引擎规则完全相同，也不能保证被引用。`llms.txt` 本轮不作为阻塞项。

- [Google：AI features and your website](https://developers.google.com/search/docs/appearance/ai-features)
- [线上首页](https://www.themarketbrew.com/)

上述技术修复不等于收录、排名、流量或 AI 引用改善；这些必须发布后观察。
