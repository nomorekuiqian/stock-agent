-- ============================================================================
-- Track M · holdings_sync 符号解析 L2 跨实例共享缓存
-- ----------------------------------------------------------------------------
-- 设计: docs/plans/proposals/holdings-sync-track-m-tech-design.md §4.0
-- 独立 migration —— **不属 portfolio geba**，不碰 user_portfolios
-- (类比 user_broker_connections 走独立 migration)。
-- 部署: insforge db query --file backend/migrations/holdings_sync_symbol_cache.sql
-- 幂等. 可重复执行.
--
-- key 安全约束 (§2bis.A.3 / Codex 修复项): query_norm 只能是可跨用户共享的
-- 安全规范 key —— 标准 ticker / FMP-confirmed symbol，或不可逆安全 hash
-- (h:<hex>)；EF 侧 + 调用侧双重校验，绝不写入账户标签/CUSIP/邮箱/原文片段。
-- ============================================================================

CREATE TABLE IF NOT EXISTS symbol_resolution_cache (
  query_norm    TEXT PRIMARY KEY,
  resolved_json JSONB NOT NULL,
  status        TEXT NOT NULL,                       -- ok | needs_review | unresolved
  hit_count     INTEGER NOT NULL DEFAULT 0,
  resolved_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL,

  CONSTRAINT symbol_resolution_cache_status_check
    CHECK (status IN ('ok', 'needs_review', 'unresolved'))
);

-- 惰性过期靠读时判 expires_at；该索引支撑后续周期清理 (followup ③)
CREATE INDEX IF NOT EXISTS idx_symbol_cache_expires
  ON symbol_resolution_cache (expires_at);

-- ============================================================================
-- 回滚 (仅紧急时使用，缓存可重建，安全):
--   DROP INDEX IF EXISTS idx_symbol_cache_expires;
--   DROP TABLE IF EXISTS symbol_resolution_cache;
-- ============================================================================
