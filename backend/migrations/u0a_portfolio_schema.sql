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
-- 回滚 (仅紧急时使用):
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
