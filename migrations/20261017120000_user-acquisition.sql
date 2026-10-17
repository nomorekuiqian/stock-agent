-- 注册来源（restart-2026q4 第 0.3.2 步）
--
-- 每个用户一行，只在首次登录同步时写入一次（重复写入因主键冲突被忽略）。
-- first_touch / last_touch 来自前端 middleware 写入的首方 cookie：
--   utm_source, utm_medium, utm_campaign, utm_content, utm_term,
--   ref, landing_path, referrer_host, ts
-- 老用户在本表上线后首次登录也会写入一行，分析时用
-- recorded_at 与 auth 用户 created_at 的间隔（如 < 1 天）筛出真正的新注册。

CREATE TABLE IF NOT EXISTS public.user_acquisition (
  user_id UUID PRIMARY KEY,
  first_touch JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_touch JSONB NOT NULL DEFAULT '{}'::jsonb,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_acquisition_recorded_at
  ON public.user_acquisition(recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_acquisition_first_source
  ON public.user_acquisition((first_touch->>'utm_source'));

-- 只允许后端用 service key 读写；不给 anon / authenticated 任何策略。
ALTER TABLE public.user_acquisition ENABLE ROW LEVEL SECURITY;
