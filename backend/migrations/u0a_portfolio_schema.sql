-- ============================================================================
-- U0-A · 数据地基: user_portfolios + user_investment_profiles
-- ----------------------------------------------------------------------------
-- 幂等 DDL. 可重复执行. 详情见 docs/plans/for-you/p0-foundation.md §LLD U0-A.
-- 部署: insforge db query --file backend/migrations/u0a_portfolio_schema.sql
--      或 Insforge admin console SQL 编辑器粘贴执行.
-- ============================================================================

-- 1) user_portfolios
--    精度三档: weight_pct (滑块) / shares (股数) / 等权 (空值兜底)
--    P1 字段一次加齐: thesis, target, stop_loss, conviction (本期不写入逻辑)
CREATE TABLE IF NOT EXISTS user_portfolios (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL,
  symbol      TEXT NOT NULL,

  weight_pct  NUMERIC(5,2),         -- 0-100, 滑块输入
  shares      NUMERIC(18,6),        -- 股数输入
  cost_basis  NUMERIC(18,6),        -- 可选, P2 月度复盘用

  -- P1 记忆闭环字段 (本期只建列, 不写入逻辑)
  thesis      TEXT,                  -- ≤ 140 字用户本意
  target      NUMERIC(18,6),         -- 目标价
  stop_loss   NUMERIC(18,6),
  conviction  SMALLINT,              -- 1-5

  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT user_portfolios_user_symbol_unique UNIQUE (user_id, symbol),
  CONSTRAINT user_portfolios_weight_range
    CHECK (weight_pct IS NULL OR (weight_pct >= 0 AND weight_pct <= 100)),
  CONSTRAINT user_portfolios_conviction_range
    CHECK (conviction IS NULL OR (conviction >= 1 AND conviction <= 5))
);

CREATE INDEX IF NOT EXISTS idx_user_portfolios_user
  ON user_portfolios (user_id);

-- 2) user_investment_profiles
--    画像 + 通知偏好 + R-2 持仓保鲜期戳
CREATE TABLE IF NOT EXISTS user_investment_profiles (
  user_id                 TEXT PRIMARY KEY,
  style                   TEXT,                                -- passive | balanced | active
  horizon                 TEXT,                                -- short | mid | long
  risk_tolerance          TEXT,                                -- low | moderate | high
  notify_mode             TEXT NOT NULL DEFAULT 'events_only', -- silent | events_only | daily

  version                 INTEGER NOT NULL DEFAULT 1,          -- 画像变更版本, U0-B Action Bar cache key 用
  onboarded_at            TIMESTAMPTZ,
  portfolio_confirmed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),  -- R-2 持仓保鲜戳, U0-B staleness Signal 消费
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT user_investment_profiles_style_check
    CHECK (style IS NULL OR style IN ('passive', 'balanced', 'active')),
  CONSTRAINT user_investment_profiles_horizon_check
    CHECK (horizon IS NULL OR horizon IN ('short', 'mid', 'long')),
  CONSTRAINT user_investment_profiles_risk_check
    CHECK (risk_tolerance IS NULL OR risk_tolerance IN ('low', 'moderate', 'high')),
  CONSTRAINT user_investment_profiles_notify_check
    CHECK (notify_mode IN ('silent', 'events_only', 'daily'))
);

-- 3) updated_at 自动维护 trigger (Postgres 通用模式)
CREATE OR REPLACE FUNCTION u0a_set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_portfolios_updated_at ON user_portfolios;
CREATE TRIGGER trg_user_portfolios_updated_at
  BEFORE UPDATE ON user_portfolios
  FOR EACH ROW EXECUTE FUNCTION u0a_set_updated_at();

DROP TRIGGER IF EXISTS trg_user_investment_profiles_updated_at ON user_investment_profiles;
CREATE TRIGGER trg_user_investment_profiles_updated_at
  BEFORE UPDATE ON user_investment_profiles
  FOR EACH ROW EXECUTE FUNCTION u0a_set_updated_at();

-- ============================================================================
-- R-2 老用户回填: portfolio_confirmed_at 默认 now() 已覆盖新建场景;
-- 若现有用户表里有老用户但还没 user_investment_profiles 行, 补一行.
-- 假设 Insforge 内置用户表是 auth.users (常见 Postgres convention).
-- 若实际表名不同, 部署时人工调整或跳过 (新用户不受影响).
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'auth' AND table_name = 'users'
  ) THEN
    INSERT INTO user_investment_profiles (user_id, portfolio_confirmed_at)
    SELECT id::text, COALESCE(created_at, now())
    FROM auth.users
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
END $$;

-- ============================================================================
-- Track M · 手动/导入持仓同步 (holdings_sync) — geba 第 1 步
-- ----------------------------------------------------------------------------
-- 设计: docs/plans/proposals/holdings-sync-track-m-tech-design.md §4.1
-- 幂等加列 + 回填 + 源作用域索引. 不加 source CHECK 约束 (枚举由应用层守,
-- 像 symbol 正则一样, 避免每加一种 source 都要迁移).
-- ============================================================================

ALTER TABLE user_portfolios ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';
ALTER TABLE user_portfolios ADD COLUMN IF NOT EXISTS source_synced_at TIMESTAMPTZ;
ALTER TABLE user_portfolios ADD COLUMN IF NOT EXISTS external_account_id TEXT;

-- 回填: 旧行视为手敲来源 (幂等 — 仅命中 source IS NULL)
UPDATE user_portfolios SET source = 'manual' WHERE source IS NULL;

-- 源作用域索引: reconcile 的 replace-by-source 删除按 (user_id, source) 过滤
CREATE INDEX IF NOT EXISTS idx_user_portfolios_user_source
  ON user_portfolios (user_id, source);

-- ============================================================================
-- Track M · 原子 reconcile (replace-by-source) — Codex 评审 [high] 修复
-- ----------------------------------------------------------------------------
-- 把 portfolio.js action=reconcile 原来的「读 → 逐条 upsert → 源作用域删除 →
-- touch」多步 PostgREST 序列折叠进单个 Postgres 函数 = 单事务原子提交，并用
-- (user_id, source) 级 pg_advisory_xact_lock 串行化并发的同源完整集提交，
-- 杜绝两次并发提交交错互删对方结果的可见数据丢失。任一步报错 → 函数抛异常 →
-- 整个事务回滚（EF 收到 error，返回 5xx，调用方按既定 fail 语义处理）。
-- xact 级 advisory lock 随事务提交/回滚自动释放，不会泄漏。
-- 设计: docs/plans/proposals/holdings-sync-track-m-tech-design.md §3.4 / §7bis
-- ============================================================================

CREATE OR REPLACE FUNCTION reconcile_user_portfolio_source(
  p_user_id      TEXT,
  p_source       TEXT,
  p_rows         JSONB,
  p_clear_source BOOLEAN DEFAULT FALSE
) RETURNS SETOF user_portfolios AS $$
DECLARE
  v_now  TIMESTAMPTZ := now();
  v_keep TEXT[];
  r      JSONB;
BEGIN
  IF p_user_id IS NULL OR p_user_id = '' THEN
    RAISE EXCEPTION 'user_id required';
  END IF;
  IF p_source IS NULL OR p_source = '' THEN
    RAISE EXCEPTION 'source required';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'rows must be a json array';
  END IF;
  -- 空集会删光整个 source —— 仅显式 clear_source 允许（防"续修发增量"丢数据）
  IF jsonb_array_length(p_rows) = 0 AND NOT p_clear_source THEN
    RAISE EXCEPTION 'empty rows requires clear_source=true';
  END IF;

  -- 串行化同一 (user_id, source) 的并发完整集提交。两个 int4 key 形式降低碰撞。
  PERFORM pg_advisory_xact_lock(
    hashtext('hsync_reconcile'),
    hashtext(p_user_id || '|' || p_source)
  );

  -- 1) 逐条 upsert；P1 (thesis/target/stop_loss/conviction) 永远保留既有行的值，
  --    绝不取自 import payload —— ON CONFLICT 的 SET 列表里**不含** P1 四列，
  --    既有 P1 原样保留；新行 P1 为 NULL（正是 COALESCE-from-existing 语义）。
  --    import 本就不携带 P1（NormalizedHolding 结构上无 P1 字段）。
  FOR r IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    IF COALESCE(r->>'symbol', '') = '' THEN
      CONTINUE;
    END IF;
    INSERT INTO user_portfolios (
      user_id, symbol, weight_pct, shares, cost_basis, entry_price,
      source, source_synced_at, external_account_id
    ) VALUES (
      p_user_id,
      r->>'symbol',
      NULLIF(r->>'weight_pct','')::numeric,
      NULLIF(r->>'shares','')::numeric,
      NULLIF(r->>'cost_basis','')::numeric,
      NULLIF(r->>'entry_price','')::numeric,
      p_source,
      v_now,
      NULLIF(r->>'external_account_id','')
    )
    ON CONFLICT (user_id, symbol) DO UPDATE SET
      weight_pct          = EXCLUDED.weight_pct,
      shares              = EXCLUDED.shares,
      cost_basis          = EXCLUDED.cost_basis,
      entry_price         = EXCLUDED.entry_price,
      source              = EXCLUDED.source,
      source_synced_at    = EXCLUDED.source_synced_at,
      external_account_id = COALESCE(EXCLUDED.external_account_id,
                                     user_portfolios.external_account_id);
  END LOOP;

  -- 2) 源作用域删除：删掉本次 import 不再包含、且属于本 source 的行；
  --    $CASH 是 source-agnostic 单例，永不被源作用域删除。
  SELECT COALESCE(array_agg(elem->>'symbol'), ARRAY[]::TEXT[])
    INTO v_keep
    FROM jsonb_array_elements(p_rows) AS elem
   WHERE COALESCE(elem->>'symbol','') <> '' AND elem->>'symbol' <> '$CASH';

  DELETE FROM user_portfolios
   WHERE user_id = p_user_id
     AND source  = p_source
     AND symbol  <> '$CASH'
     AND symbol  <> ALL(v_keep);

  -- 3) R-2 touch 折叠进同一事务（原子；错误一并回滚，不再单独往返）
  INSERT INTO user_investment_profiles (user_id, portfolio_confirmed_at)
  VALUES (p_user_id, v_now)
  ON CONFLICT (user_id) DO UPDATE SET portfolio_confirmed_at = v_now;

  -- 4) 返回该用户最新全量持仓（PostgREST 序列化为行对象数组）
  RETURN QUERY
    SELECT * FROM user_portfolios WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- 鉴权暴露面（Codex M1 复评 [high] 修复 — 决策：与既有 `bulk` 平价）：这是一个
-- **租户写**RPC（按入参 p_user_id 改/删持仓，p_clear_source=true 可整源清空）。
-- Postgres 新建函数默认 PUBLIC 可执行——必须**显式 REVOKE FROM PUBLIC**，绝不
-- 留 `GRANT … TO PUBLIC`（Codex 明确点名的反模式）。
--
-- 信任模型 = 与已上线的 `action=bulk` 租户写**完全相同**（非更弱也非更强）：
-- 后端 verify JWT → 带 X-Internal-Secret 调 EF → EF 用 anon DB 客户端写
-- `user_portfolios`。`bulk` 已依赖 anon 角色对该表的 DML 授权 + 平台约定
-- “PostgREST 不外部直连，只经 EF”（portfolio/.context.md 规则 5；RLS 后续再接）。
-- 故本函数 EXECUTE 仅绑定到 EF anon 客户端实际所用的标准 PostgREST 角色
-- （anon / authenticated），与 `bulk` 的表 DML 暴露面**严格平价**——不引入新越权类。
-- 残留暴露（= bulk 既有、已接受）由部署冒烟验证并记录（见 runbook M1.1）。
REVOKE ALL ON FUNCTION
  reconcile_user_portfolio_source(TEXT, TEXT, JSONB, BOOLEAN) FROM PUBLIC;
DO $$
DECLARE
  v_role TEXT;
BEGIN
  -- 绑定到 EF anon 客户端实际所用角色（PostgREST 标准 anon/authenticated）。
  -- 角色不存在则跳过（不同 Insforge 部署角色名可能不同；部署校验见 runbook
  -- M1.1：anon-key 直连 /rpc 行为须与 bulk 平价并记录）。
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION '
        'reconcile_user_portfolio_source(TEXT, TEXT, JSONB, BOOLEAN) TO %I',
        v_role);
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- 回滚 (仅紧急时使用):
--   DROP FUNCTION IF EXISTS reconcile_user_portfolio_source(TEXT, TEXT, JSONB, BOOLEAN);
--   ALTER TABLE user_portfolios DROP COLUMN IF EXISTS external_account_id;
--   ALTER TABLE user_portfolios DROP COLUMN IF EXISTS source_synced_at;
--   ALTER TABLE user_portfolios DROP COLUMN IF EXISTS source;
--   DROP INDEX IF EXISTS idx_user_portfolios_user_source;
--   DROP TRIGGER IF EXISTS trg_user_investment_profiles_updated_at ON user_investment_profiles;
--   DROP TRIGGER IF EXISTS trg_user_portfolios_updated_at ON user_portfolios;
--   DROP FUNCTION IF EXISTS u0a_set_updated_at();
--   DROP TABLE IF EXISTS user_investment_profiles;
--   DROP TABLE IF EXISTS user_portfolios;
-- 注意: 回滚会丢失所有持仓 + 画像数据. 仅用于 staging.
-- ============================================================================
