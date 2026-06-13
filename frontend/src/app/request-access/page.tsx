"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getAccessTokenAsync as getAccessToken } from "@/contexts/AuthContext";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

const BACKGROUND_OPTIONS = [
  { value: "入门中", label: "入门中", desc: "正在学习，还没开始实盘" },
  { value: "刚起步", label: "刚起步", desc: "有过实盘，主要买卖股票或 ETF" },
  { value: "进阶", label: "进阶", desc: "有自己的一套体系，主动管理仓位" },
  { value: "老手", label: "老手", desc: "经历过多个完整市场周期" },
  { value: "金融从业者", label: "金融从业者", desc: "以投资或分析为职业" },
];

const MARKET_OPTIONS = [
  "美股（标普 500、纳斯达克）",
  "加密货币（BTC、ETH 等）",
  "港股 / A 股",
  "日韩及亚太市场",
  "贵金属 / 大宗商品",
  "美债 / 宏观利率",
];

const TRADING_STYLE_OPTIONS = [
  "长期持有（buy & hold）",
  "波段操作（数周到数月）",
  "短线 / 日内交易",
  "期权策略（covered call、保护性 put 等）",
  "做空 / 对冲",
  "量化 / 系统化策略",
];

const PAIN_POINT_OPTIONS = [
  "信息太多，不知道该关注什么",
  "没时间每天跟踪市场动态",
  "看不懂宏观经济对持仓的影响",
  "财报和研究报告太难读懂",
  "社交媒体上的信息太情绪化，让我很焦虑",
  "看了很多分析，但不知道跟我的持仓有什么关系",
];

export default function RequestAccessPage(): ReactNode {
  const router = useRouter();

  const [background, setBackground] = useState("");
  const [markets, setMarkets] = useState<string[]>([]);
  const [tradingStyle, setTradingStyle] = useState<string[]>([]);
  const [painPoints, setPainPoints] = useState<string[]>([]);
  const [feedback, setFeedback] = useState("");
  const [source, setSource] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const toggle = (
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    value: string,
  ) => {
    setter((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  };

  useEffect(() => {
    const sourceParam = new URLSearchParams(window.location.search).get("source") || "";
    if (sourceParam === "qinbafrank-agent") {
      router.replace("/kol/qinbafrank");
      return;
    }
    setSource(sourceParam);
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!background || markets.length === 0 || tradingStyle.length === 0 || painPoints.length === 0 || !feedback.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const token = await getAccessToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${API_BASE_URL}/invites/qualify`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          background,
          markets,
          trading_style: tradingStyle,
          pain_points: painPoints,
          feedback: feedback.trim(),
          source: source || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError("提交失败，请稍后再试");
      } else {
        setSubmitted(true);
      }
    } catch {
      setError("网络错误，请检查连接后重试");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-8">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-widest mb-3">
              TheMarketBrew
            </p>
            <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-editorial text-foreground mb-2">
              感谢你的反馈!
            </h1>
            <p className="text-sm text-muted-foreground">
              你的意见对我们非常重要，我们会不断改进产品体验。
            </p>
          </div>

          <Link
            href="/for-you"
            className="inline-block w-full px-4 py-3 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            开始探索
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="max-w-lg w-full">
        <div className="mb-8">
          <button
            type="button"
            onClick={() => window.history.length > 1 ? router.back() : router.push("/")}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            ← 返回
          </button>
        </div>

        <div className="space-y-2 mb-8">
          <p className="text-xs text-muted-foreground uppercase tracking-widest">
            TheMarketBrew
          </p>
          <h1 className="text-2xl font-editorial text-foreground">帮助我们了解你</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            花 1 分钟告诉我们你的投资偏好，帮助我们为你提供更好的体验。
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Q1: 投资经历 */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-foreground">
              你的投资经历<span className="text-primary ml-0.5">*</span>
            </label>
            <div className="grid grid-cols-1 gap-2">
              {BACKGROUND_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setBackground(opt.value)}
                  className={`text-left px-4 py-3 rounded-lg border text-sm transition-all duration-150 ${
                    background === opt.value
                      ? "border-primary/60 bg-primary/10 text-foreground"
                      : "border-border bg-card text-muted-foreground hover:border-border/80 hover:text-foreground"
                  }`}
                >
                  <span className="font-medium">{opt.label}</span>
                  <span className="ml-2 text-xs opacity-60">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Q2: 关注的市场 */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-foreground">
                你主要关注哪些市场<span className="text-primary ml-0.5">*</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {MARKET_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => toggle(setMarkets, opt)}
                  className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-all duration-150 ${
                    markets.includes(opt)
                      ? "border-primary/60 bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground hover:border-border/80 hover:text-foreground"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          {/* Q3: 交易风格 */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-foreground">
              你的交易风格<span className="text-primary ml-0.5">*</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {TRADING_STYLE_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => toggle(setTradingStyle, opt)}
                  className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-all duration-150 ${
                    tradingStyle.includes(opt)
                      ? "border-primary/60 bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground hover:border-border/80 hover:text-foreground"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          {/* Q4: 痛点 */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-foreground">
              你在投研过程中现在遇到哪些痛点<span className="text-primary ml-0.5">*</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {PAIN_POINT_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => toggle(setPainPoints, opt)}
                  className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-all duration-150 ${
                    painPoints.includes(opt)
                      ? "border-primary/60 bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground hover:border-border/80 hover:text-foreground"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          {/* Q5: 开放文字 */}
          <div className="space-y-2">
            <label
              htmlFor="feedback"
              className="block text-sm font-medium text-foreground"
            >
              你最想要 TheMarketBrew 帮你解决什么问题
              <span className="text-primary ml-0.5">*</span>
            </label>
            <textarea
              id="feedback"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="请描述你目前最头疼的问题，或者对产品的期待和建议..."
              rows={3}
              maxLength={500}
              className="w-full px-4 py-3 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary/50 focus:ring-2 focus:ring-primary/10 outline-none transition-all duration-200 resize-none"
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={loading || !background || markets.length === 0 || tradingStyle.length === 0 || painPoints.length === 0 || !feedback.trim()}
            className="w-full px-4 py-3 bg-primary text-primary-foreground rounded-lg font-medium text-sm hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none transition-all duration-200 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg
                  className="w-4 h-4 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                提交中...
              </>
            ) : (
              "提交问卷"
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          还没有账号？
          <Link
            href="/login"
            className="text-primary hover:text-primary/80 transition-colors ml-1"
          >
            免费注册
          </Link>
        </p>
      </div>
    </div>
  );
}
