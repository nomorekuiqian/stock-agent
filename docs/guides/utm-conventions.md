# UTM 与来源规范

所有对外链接（X、小红书、公众号、邮件、博主合作、SEO 以外的一切）都要带 UTM，否则注册会被记成「直接访问」或只剩 referrer 域名。

## 参数

| 参数 | 含义 | 取值 |
|---|---|---|
| `utm_source` | 平台 | `x`、`xiaohongshu`、`wechat`、`jike`、`email`、`telegram`、博主 handle（合作时） |
| `utm_medium` | 渠道类型 | `organic`（自己发的内容）、`kol`（博主转发/合作）、`email`、`paid`、`referral` |
| `utm_campaign` | 内容或活动 id | 推荐 `YYYYMMDD-短标识`，如 `20261020-nvda-earnings` |
| `utm_content` | 同一内容的变体（可选） | `card`、`thread`、`bio-link` |
| `ref` | 博主或邀请人短码（可选） | 如 `frank` |

全部小写，用 `-` 连接，不用空格和中文。

## 例子

```
https://themarketbrew.com/stock/NVDA?utm_source=x&utm_medium=organic&utm_campaign=20261020-nvda-earnings&utm_content=card
https://themarketbrew.com/?utm_source=x&utm_medium=kol&utm_campaign=20261021-frank-repost&ref=frank
```

## 数据去向

1. 前端 middleware 把首次触达写入 `tmb_ft`，最近一次带来源的访问写入 `tmb_lt`（180 天，见 `frontend/src/lib/acquisition.ts`）。
2. 用户首次登录同步时，后端写入 `user_acquisition`（每人一行），并把首次触达同步到 PostHog 的 `initial_*` 人物属性。
3. 查询新注册来源：

```sql
SELECT a.first_touch->>'utm_source' AS source,
       a.first_touch->>'utm_medium' AS medium,
       count(*) AS signups
FROM user_acquisition a
JOIN auth.users u ON u.id = a.user_id
WHERE a.recorded_at - u.created_at < interval '1 day'
  AND a.recorded_at >= now() - interval '7 days'
GROUP BY 1, 2
ORDER BY signups DESC;
```

`auth.users` 的表名以 Insforge 实际 schema 为准。

## 已知局限

- 用户在 A 设备点链接、在 B 设备点验证邮件完成首次登录时，B 设备没有 cookie，会被记成直接访问。
- 浏览器禁用 cookie 或清理过 cookie 的用户同理。
