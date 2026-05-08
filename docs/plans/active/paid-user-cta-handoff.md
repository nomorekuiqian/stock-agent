# 任务交接：日报邮件 CTA 按用户分级渲染

> 这是一份给接手 AI / 工程师的 briefing。前一轮探索已经走过两条死路，本文档记录现状、约束、已踩的坑，避免重复。

## 目标

每日日报邮件底部有一个 CTA section：两张升级卡（Pro $4.99 / Max $9.99，按钮指向 `/pricing`）。需要让 **真付费用户**（10 个，下面列出）收到的邮件里 CTA 显示**感谢文案**，按钮指向 `/for-you` 等付费用户已开通的功能；**免费用户和试用用户**继续看到原升级文案。

## 真付费用户清单（10 个）

```
kedengpan@gmail.com           # lifetime
wushaoqing1986@gmail.com      # lifetime
jackli9299@gmail.com
sqrt2141@gmail.com
jeanine.rjj@gmail.com
linwenyueonly@outlook.com
xuxy1994@gmail.com
weixiang77@gmail.com
qzhu24@gmail.com
wenyi.wynn@gmail.com
```

**关键约束**：Insforge `subscriptions` 表里 `entitlements` 非空的用户有 124 个，但其中 122 是试用用户（通过邀请码 `AUTO_TRIAL` / `GIFT2026` / `BREW2026` 进来的）+ 2 个 lifetime。试用用户**不算付费**，他们仍要看到原升级 CTA 来引导转化。所以**不能**用 `entitlements 非空` 作为付费判定。

## 技术栈

- 后端：Python FastAPI + Resend（邮件）
- DB：Insforge (PostgreSQL)
- 项目根：`/Users/kedeng/projects/stock-agent/backend`
- venv：`backend/venv/`

## 关键代码位置

| 文件 | 作用 |
|---|---|
| `backend/app/features/subscription/email_templates.py` | `get_digest_cta_section()` — CTA HTML（约 line 301-433）；`format_html_report()` 在 line 706 处嵌入 CTA |
| `backend/app/features/subscription/email_service.py` | `broadcast_daily_report()` 走 Resend Broadcast；`send_daily_report()` 走 Resend `Emails.send`（单发） |
| `backend/app/features/subscription/service.py` | `sync_resend_segments(email, entitlements)` — 唯一的 Resend segment 写入点，由 Stripe entitlements webhook 调用 |
| `backend/app/features/payment/router.py` | Stripe webhook handler，line 398 调用 `sync_resend_segments` |
| `backend/app/features/payment/entitlements.py` | `PRO_FEATURES` / `MAX_ONLY_FEATURES` 集合定义 |
| `backend/app/core/config.py` | env 变量：`RESEND_SEGMENT_EVENING / MORNING / WEEKLY` |

## Resend 端现状

| 名称 | id | 用途 |
|---|---|---|
| `TheMarketBrew Daily` (segment + audience，同 id) | `a0e3508d-894b-4e56-a234-66d277c09916` | 当前所有日报订阅者（526 contact，496 已订阅，30 退订），生产 cron 用这个 segment 广播 |
| `TheMarketBrew Daily Free` | `a081542c-7411-4cd3-bb24-80aedd7af9e2` | **空 segment，可删**（之前思路废弃） |
| `TheMarketBrew Daily Paid` | `f119ea94-de81-4a78-bb7a-f7ebf016bdaf` | **空 segment，预留给真付费用户** |
| `TheMarketBrew Morning` | `8ac12045-8832-4191-ac09-77898ee09b92` | Pro entitlement 用户的早报 |
| `TheMarketBrew Weekly` | (env 中) | Pro entitlement 用户的周报 |
| `Test Broadcast` | `be8e3ede-2dff-4114-a4b3-bccb2f4192bf` | 用户手动建的测试 segment（含 voya） |
| 17 个自定义 contact properties (`cta_eyebrow`, `cta_title`, `cta_pro_*`, `cta_max_*`) | — | **失败方案的残留，无害但建议清理** |

## 已经放弃的方案（避免重复踩坑）

### 方案 1：Resend Contact Property + 合并标签（FAILED）

- HTML 用 `{{{contact.properties.cta_X|<inline_fallback>}}}` 写所有可变文本
- `sync_resend_segments` 给付费用户写 17 个 property 值
- **测试结果**：Resend Broadcast 没有按预期替换合并标签——voya 收到的邮件里：
  - 第一次（property 还没建）：合并标签变成字面量 `{{{CONTACT.PROPERTIES.CTA_EYEBROW|升级订阅}}}`
  - 第二次（property 建了，voya 写了 Max 文案）：渲染成了 inline fallback（即免费文案），**没用 voya 的实际属性值**
- 发了 5 种语法变体的探针 broadcast 想定位真正语法（`contact.properties.X` / `contact.X` / `X` / `contact.PROPERTIES.X`），但用户决定放弃这个方向
- Resend Broadcast **不支持 Liquid `{% if %}` 条件块**——条件分支只在 Automations 里
- 这个方案的所有代码都已经从 git working tree 里 revert 了

### 方案 2：两个互斥 segment（IN PROGRESS，被叫停）

- 思路：`TheMarketBrew Daily` 留给免费+试用，新建 `TheMarketBrew Daily Paid` 装真付费用户
- 用户当时确认了这个方向
- 写了迁移脚本 `backend/scripts/migrate_daily_segment_split.py`：对每个付费用户做 `add to Daily Paid` + `remove from Daily`
- 已经干跑过（dry_run 显示 10 个用户操作，0 失败），用户看到后说"不要，我觉得这样不好"

## 关键技术约束

1. **Resend `Emails.send`（单发）不处理任何合并标签**——HTML 原样发出。任何 dev 测试 / 手动触发的单发会暴露未替换的合并标签。
2. **Resend Broadcast 只支持 inline 文本替换**，不支持条件块。自定义 contact property 的合并标签实测不可靠（见方案 1）。
3. **生产 cron 走 broadcast 路径**：`broadcast_daily_report` → 一次 broadcast → 一个 segment_id（`RESEND_SEGMENT_EVENING`）→ 一份 HTML 给所有人。
4. **本地 Stripe key 是 test mode，无法查 live mode 的 subscription**。判定真付费 vs 试用必须从外部信息源（用户提供清单 / 用户在 dashboard 手动看）。
5. **CLAUDE.md 规则**：不能自动 git commit / push；改代码前要读对应模块的 `.context.md`，改完要更新；用 `get_logger(__name__)`，不用 `print`；测试账号 voya.technologies@gmail.com / 123456。

## 当前代码库状态

- ✅ 干净——所有方案 1 的改动都 revert 了
- ✅ 116+ 单元测试通过
- ✅ `get_digest_cta_section()` 是原始 hardcoded 双卡 upsell 版本
- ⚠️ `backend/scripts/migrate_daily_segment_split.py` 还在（方案 2 的脚本，未执行）—— 视方案决定保留或删除
- ⚠️ Resend 上的 17 个 contact property 还在（方案 1 残留，无害）
- ⚠️ Resend 上 voya 的 contact 写过一份 free defaults 属性值（无害）

## 已选方案

采用“一个日报订阅名单 + 两个 CTA 发送名单”：

- `TheMarketBrew Daily` / `RESEND_SEGMENT_EVENING` 继续表示谁订阅了日报。
- `RESEND_SEGMENT_DAILY_FREE_CTA` 发送升级 CTA，包含免费用户和试用用户。
- `RESEND_SEGMENT_DAILY_PAID_CTA` 发送感谢 CTA，包含真付费用户。

生产环境的 `broadcast_daily_report()` 发两次 Resend Broadcast；非生产环境和显式传入 `audience_id` 的测试发送仍只发一次，避免测试收件人收到重复邮件。

真付费用户清单集中在 `backend/app/features/subscription/paid_cta.py`。当前仍以用户提供的 10 个邮箱为真相，试用用户即使有 entitlements 也留在 Free CTA。

## 接手方需要决定 + 实现的内容

1. **架构选择**：以下任一种，或更好方案
   - (a) 两个互斥 segment + 两次 broadcast（方案 2 方向）
   - (b) 一个 segment + 两次 broadcast，中间用 Resend Segment "filter" 过滤付费用户（如 Resend 支持的话）
   - (c) 把广播改成 per-recipient 单发（量小可接受，但生产规模 ~496 用户会慢；Resend 限速 2 req/s）
   - (d) 其它

2. **真付费用户判定**：用户给的 10 人清单是当前真相。未来需要让 Stripe entitlements webhook 在用户**真付费**（不是试用）时触发分组变更。判定逻辑可能是：
   - `is_lifetime=true`，或
   - `invite_code is None` 且 `stripe_subscription_id` 非空 且 Stripe API 显示 `status='active'` 且 `trial_end` 已过

3. **代码改动**：
   - 添加付费版 CTA HTML（感谢文案，按钮指向 `/for-you` 而不是 `/pricing`）
   - 让 `broadcast_daily_report` 按方案发送
   - 让 `sync_resend_segments` 在用户付费/取消时同步分组
   - 测试 + 更新 `.context.md`

4. **迁移**：把 10 个真付费用户初始化进对应分组

## 验证方法

### 测试单发

```bash
cd backend && source venv/bin/activate
venv/bin/python -c "
import sys, asyncio, logging; sys.path.insert(0,'.')
logging.basicConfig(level=logging.INFO)
from app.features.subscription.email_service import get_email_service
from app.features.daily_report import db as market_db
from app.features.notification.router import _report_data_from_db
async def go():
    report = await market_db.get_latest_report()
    data = _report_data_from_db(report)
    r = await get_email_service().send_daily_report(data, to_email='voya.technologies@gmail.com', first_name='Voya')
    print(r)
asyncio.run(go())
"
```

### 测试 broadcast

可以用现成的 `Test Broadcast` segment（只包含 voya），调：

```python
email_service._create_and_send_broadcast(
    label='SomeLabel',
    audience_id=None,
    segment_id='be8e3ede-2dff-4114-a4b3-bccb2f4192bf',  # Test Broadcast
    subject='[TEST] ...',
    broadcast_name='Test ...',
    html=html,
)
```

### 跑测试套件

```bash
venv/bin/python -m pytest tests/test_email_rendering.py tests/test_sync_resend_unit.py tests/test_architecture.py tests/test_funnel_unit.py -q
```

## Resend 上的清理动作（可选）

如果决定不再用方案 1，建议清理：

```python
import resend
from app.core.config import RESEND_API_KEY
resend.api_key = RESEND_API_KEY

# Delete unused contact properties (17 个)
for key in [
    "cta_eyebrow", "cta_title", "cta_pro_badge", "cta_pro_label",
    "cta_pro_headline", "cta_pro_desc", "cta_pro_price", "cta_pro_button",
    "cta_pro_url", "cta_pro_footnote", "cta_max_label", "cta_max_headline",
    "cta_max_desc", "cta_max_price", "cta_max_button", "cta_max_url",
    "cta_max_footnote",
]:
    try:
        resend.ContactProperties.remove({"key": key})
    except Exception as e:
        print(f"skip {key}: {e}")

# Delete unused 'TheMarketBrew Daily Free' segment
resend.Segments.remove(id="a081542c-7411-4cd3-bb24-80aedd7af9e2")
```
