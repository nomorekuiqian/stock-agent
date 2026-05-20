-- ============================================================================
-- research_quota · 原子 consume-if-under-limit（Codex M2 复评 [high] 修复）
-- ----------------------------------------------------------------------------
-- 现有 EF 是「读 → 比上限 → 写」两步：并发同 user/day 提交可同时观察到 used<limit
-- 然后都 increment，突破日上限。修复 = 单 Postgres 函数 = 单事务 + (identifier,
-- usage_date) 级 `pg_advisory_xact_lock` 串行化同窗口并发，原子返回
-- (consumed, count, limit)。
--
-- 设计: docs/plans/proposals/holdings-sync-track-m-tech-design.md §5
-- 信任模型 & 角色暴露面 = 与 reconcile_user_portfolio_source 平价（REVOKE FROM
-- PUBLIC + 条件 GRANT TO anon/authenticated；与现有 research-quota EF 同信任边界）。
--
-- 表 research_quota 由 Insforge 平台管理（不在本仓 migrations）；本文件只追加
-- 一个唯一约束 + 一个 RPC，全部幂等。
-- ============================================================================

-- 唯一约束 (identifier, usage_date) — INSERT ... ON CONFLICT 需要它；
-- 现有 EF 没用 ON CONFLICT 也未冲突，说明并发窗口未压力测试过。补这个约束
-- 顺便给原子函数提供 ON CONFLICT 目标。
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'research_quota'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'research_quota_identifier_date_unique'
  ) THEN
    -- BEFORE adding the constraint: collapse any pre-existing duplicates so
    -- the unique index can build. Concurrency wasn't enforced before so dups
    -- may exist (different rows for the same identifier+date).
    WITH d AS (
      SELECT identifier, usage_date, MAX(id::text) AS keep_id, SUM(count) AS sum_count
        FROM research_quota
       GROUP BY identifier, usage_date
       HAVING COUNT(*) > 1
    )
    UPDATE research_quota r
       SET count = d.sum_count
      FROM d
     WHERE r.id::text = d.keep_id;
    DELETE FROM research_quota r
     USING (
       SELECT id FROM (
         SELECT id,
                ROW_NUMBER() OVER (PARTITION BY identifier, usage_date
                                   ORDER BY id) AS rn
           FROM research_quota
       ) ranked
       WHERE rn > 1
     ) dups
     WHERE r.id = dups.id;

    ALTER TABLE research_quota
      ADD CONSTRAINT research_quota_identifier_date_unique
      UNIQUE (identifier, usage_date);
  END IF;
END $$;

-- Atomic consume — single transaction, advisory-locked on (identifier, date).
-- Returns three columns the caller distinguishes:
--   consumed = TRUE  + count = new count        → success (router 200)
--   consumed = FALSE + count = current count    → at cap (router 429)
-- An exception bubbles out (RPC error) for the EF unavailability case
-- (router 503 via fail-closed).
--
-- `p_amount` (M4 PDF — design §5): PDF-vision can consume up to 4 in one
-- shot (one per rendered page). Whole-or-nothing atomicity — refuses if
-- (count + amount) would exceed limit; on accept, increments by amount.
-- Default 1 preserves the M2 screenshot/paste call sites untouched.
--
-- The signature changed from M2 (added p_amount). Postgres `CREATE OR
-- REPLACE FUNCTION` doesn't allow signature changes — drop the old
-- arity-4 form first so this migration stays idempotent on re-deploy.
DROP FUNCTION IF EXISTS consume_research_quota_if_under_limit(TEXT, TEXT, DATE, INT);

CREATE OR REPLACE FUNCTION consume_research_quota_if_under_limit(
  p_identifier      TEXT,
  p_identifier_type TEXT,
  p_usage_date      DATE,
  p_limit           INT,
  p_amount          INT DEFAULT 1
) RETURNS TABLE(consumed BOOLEAN, count INT, lim INT) AS $$
DECLARE
  v_count INT;
BEGIN
  IF p_identifier IS NULL OR p_identifier = '' THEN
    RAISE EXCEPTION 'identifier required';
  END IF;
  IF p_usage_date IS NULL THEN
    RAISE EXCEPTION 'usage_date required';
  END IF;
  IF p_limit IS NULL OR p_limit <= 0 THEN
    RAISE EXCEPTION 'limit must be positive';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('research_quota_consume'),
    hashtext(p_identifier || '|' || p_usage_date::text)
  );

  INSERT INTO research_quota (identifier, identifier_type, usage_date, count)
       VALUES (p_identifier, p_identifier_type, p_usage_date, 0)
  ON CONFLICT (identifier, usage_date) DO NOTHING;

  SELECT count INTO v_count
    FROM research_quota
   WHERE identifier = p_identifier AND usage_date = p_usage_date;

  -- Whole-or-nothing: refuse if (current + amount) would exceed limit
  IF v_count + p_amount > p_limit THEN
    RETURN QUERY SELECT FALSE, v_count, p_limit;
    RETURN;
  END IF;

  UPDATE research_quota
     SET count = COALESCE(count, 0) + p_amount,
         updated_at = now()
   WHERE identifier = p_identifier AND usage_date = p_usage_date;

  SELECT count INTO v_count
    FROM research_quota
   WHERE identifier = p_identifier AND usage_date = p_usage_date;
  RETURN QUERY SELECT TRUE, v_count, p_limit;
END;
$$ LANGUAGE plpgsql;

-- 鉴权暴露面 = 与 reconcile_user_portfolio_source 平价（Codex M1 复评决策；
-- 不留 TO PUBLIC，绑定 EF anon/authenticated 角色）。
REVOKE ALL ON FUNCTION
  consume_research_quota_if_under_limit(TEXT, TEXT, DATE, INT, INT) FROM PUBLIC;
DO $$
DECLARE v_role TEXT;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION '
        'consume_research_quota_if_under_limit(TEXT, TEXT, DATE, INT, INT) TO %I',
        v_role);
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- 回滚 (仅紧急时使用):
--   DROP FUNCTION IF EXISTS consume_research_quota_if_under_limit(TEXT,TEXT,DATE,INT,INT);
--   DROP FUNCTION IF EXISTS consume_research_quota_if_under_limit(TEXT,TEXT,DATE,INT);
--   ALTER TABLE research_quota DROP CONSTRAINT IF EXISTS research_quota_identifier_date_unique;
-- ============================================================================
