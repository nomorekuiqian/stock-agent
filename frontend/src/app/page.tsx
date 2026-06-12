"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Clock3,
  Mail,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import FeatureSections from "@/components/FeatureSections";
import LandingDelight from "@/components/LandingDelight";
import SubscribeForm from "@/components/SubscribeForm";
import { useAuth } from "@/contexts/AuthContext";
import { PRICING } from "@/lib/pricing";

const HERO_FEATURES = ["四份日报", "AI 个股研究", "AI 投研助手", "宏观仪表盘"];

const PRICING_TIERS = [
  {
    name: "免费版",
    description: "先用日报和宏观仪表盘建立节奏",
    price: "$0",
    suffix: "/月",
    href: "/today",
    cta: "免费开始",
    featured: false,
    note: "适合先体验市场复盘",
    features: [
      "盘后总览（网站阅读）",
      "宏观仪表盘",
      "基础市场资讯",
      "无需信用卡",
    ],
  },
  {
    name: "Pro",
    description: "把日报推送和持仓分析纳入日常流程",
    price: PRICING.pro,
    original: PRICING.proOriginal,
    suffix: PRICING.interval,
    href: "/pricing",
    cta: "订阅 Pro",
    featured: false,
    note: "随时取消 · Stripe 安全支付",
    features: [
      "盘前情报 + 盘后总览邮件推送",
      "基于持仓的专属日报",
      "宏观周报邮件推送",
      "自选股管理",
    ],
  },
  {
    name: "Max",
    description: "解锁完整 AI 投研、博主观点和深度个股研究",
    price: PRICING.max,
    original: PRICING.maxOriginal,
    suffix: PRICING.interval,
    href: "/pricing",
    cta: "订阅 Max",
    featured: true,
    note: `${PRICING.maxDiscount} · 新功能优先体验`,
    features: [
      "Pro 的所有功能",
      "300+ 美股博主观点聚合",
      "AI 投研助手无限对话",
      "AI 深度个股分析无限使用",
    ],
  },
];

function SectionLabel({
  label,
  align = "center",
}: {
  label: string;
  align?: "left" | "center";
}) {
  return (
    <div
      className={`flex items-center gap-3 ${
        align === "center" ? "justify-center" : ""
      }`}
    >
      <div className="h-px w-12 bg-gradient-to-r from-primary to-transparent" />
      <span className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">
        {label}
      </span>
      {align === "center" && (
        <div className="h-px w-12 bg-gradient-to-l from-primary to-transparent" />
      )}
    </div>
  );
}

function PricingCard({
  tier,
}: {
  tier: (typeof PRICING_TIERS)[number];
}) {
  return (
    <div
      data-delight-card
      className={`relative flex h-full flex-col rounded-lg border p-6 transition-all hover:-translate-y-0.5 ${
        tier.featured
          ? "border-primary/35 bg-primary/[0.055] shadow-xl shadow-primary/5"
          : "border-border/55 bg-card/35 hover:border-primary/25"
      }`}
    >
      {tier.featured && (
        <div className="absolute right-5 top-5 rounded-full border border-primary/20 bg-background/70 px-3 py-1 text-sm font-medium text-primary">
          推荐
        </div>
      )}
      <div className="pr-20">
        <h3 className="text-lg font-semibold text-foreground">{tier.name}</h3>
        <p className="mt-2 min-h-12 text-sm leading-relaxed text-muted-foreground">
          {tier.description}
        </p>
      </div>

      <div className="mt-6 flex items-end gap-2">
        <span className="font-data text-3xl font-semibold text-foreground tabular-nums">
          {tier.price}
        </span>
        <span className="pb-1 text-sm text-muted-foreground">
          {tier.suffix}
        </span>
        {tier.original && (
          <span className="pb-1 font-data text-sm text-muted-foreground line-through">
            {tier.original}
          </span>
        )}
      </div>

      <div className="mt-6 space-y-3">
        {tier.features.map((feature) => (
          <div key={feature} className="flex gap-2.5">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span className="text-sm leading-relaxed text-foreground">
              {feature}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-auto pt-7">
        <Link
          href={tier.href}
          data-delight-action
          className={`flex min-h-11 w-full items-center justify-center rounded-lg px-4 py-3 text-sm font-medium transition-all active:scale-[0.98] ${
            tier.featured
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "border border-border/60 bg-background/70 text-foreground hover:border-primary/35 hover:bg-card/70"
          }`}
        >
          {tier.cta}
        </Link>
        <p className="mt-3 text-center text-sm leading-relaxed text-muted-foreground">
          {tier.note}
        </p>
      </div>
    </div>
  );
}

export default function Home() {
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <main className="min-h-screen bg-background">
      <LandingDelight />
      <section className="relative -mt-16 flex min-h-screen items-center justify-center overflow-hidden bg-background md:h-screen">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 60% 50% at 22% 12%, rgba(16,185,129,0.18), transparent 62%), radial-gradient(ellipse 55% 50% at 84% 82%, rgba(232,170,96,0.10), transparent 62%)",
          }}
        />

        <div className="relative mx-auto w-full max-w-3xl px-4 pt-24 pb-16 text-center md:px-6 md:py-20">
          <div className="mb-7 flex items-center justify-center gap-3">
            <div className="h-px w-8 bg-primary/60 animate-line-expand" />
            <span className="font-data text-xs uppercase tracking-[0.3em] text-primary">
              美股 AI 投研平台
            </span>
          </div>

          <h1 className="mb-7 font-editorial text-5xl leading-[1.05] tracking-tight text-foreground md:text-6xl lg:text-7xl">
            你的 AI <span className="text-primary">投研团队</span>
          </h1>

          <p className="mx-auto mb-9 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
            从日报到个股、从持仓到宏观 -- 一个平台，覆盖你的全部投研需求。
          </p>

          <div className="mb-10 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
            {HERO_FEATURES.map((item) => (
              <span key={item} className="inline-flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-primary" aria-hidden />
                {item}
              </span>
            ))}
          </div>

          <div className="flex flex-col items-center gap-4">
            <Link
              href="/research"
              aria-busy={isLoading}
              data-delight-action
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-7 py-3.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.98]"
            >
              {isAuthenticated ? "进入工作台" : "免费开始"}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <p className="text-xs text-muted-foreground/70">
              无需信用卡
            </p>
          </div>
        </div>
      </section>

      <section
        data-delight-section
        className="relative border-b border-border/40 bg-card/20"
      >
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-5 md:flex-row md:items-center md:px-6">
          <div
            data-delight-card
            className="flex min-w-0 flex-1 items-start gap-3"
          >
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/[0.07]">
              <Mail className="h-4 w-4 text-primary" aria-hidden />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                每个交易日收盘后，先收到一份清晰复盘
              </p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                适合先建立市场节奏，再进入个股和投研助手。
              </p>
            </div>
          </div>
          <SubscribeForm variant="inline" className="w-full md:max-w-xl" />
        </div>
      </section>

      <FeatureSections />

      <section
        data-delight-section
        className="relative overflow-hidden border-t border-border/40 py-18 md:py-24"
      >
        <div className="absolute inset-0 bg-[linear-gradient(rgba(16,185,129,0.014)_1px,transparent_1px),linear-gradient(90deg,rgba(16,185,129,0.014)_1px,transparent_1px)] bg-[size:80px_80px]" />
        <div className="relative mx-auto max-w-6xl px-4 md:px-6">
          <div className="mb-12 grid gap-8 md:grid-cols-[0.95fr_1.05fr] md:items-end">
            <div className="space-y-5">
              <SectionLabel label="Pricing" align="left" />
              <h2 className="font-editorial text-3xl leading-tight text-foreground md:text-5xl">
                先免费建立节奏，
                <br />
                再按需要升级深度
              </h2>
            </div>
            <p className="max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
              免费版覆盖基础复盘；Pro 负责推送和持仓；Max 解锁完整 AI 投研、博主观点和深度个股分析。
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {PRICING_TIERS.map((tier) => (
              <PricingCard key={tier.name} tier={tier} />
            ))}
          </div>
        </div>
      </section>

      <section
        data-delight-section
        className="relative overflow-hidden border-y border-border/40 bg-muted/10 py-18 md:py-24"
      >
        <div className="mx-auto grid max-w-6xl gap-10 px-4 md:px-6 lg:grid-cols-[0.72fr_1.28fr]">
          <aside className="lg:sticky lg:top-28 lg:self-start">
            <SectionLabel label="Our Story" align="left" />
            <div className="mt-8 flex items-center gap-4">
              <Image
                src="/founder-avatar.jpeg"
                alt="Golden"
                width={80}
                height={80}
                className="h-20 w-20 rounded-xl border border-primary/20 object-cover"
              />
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Golden / 金黄
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  独立开发者，美股投资者
                </p>
              </div>
            </div>
          </aside>

          <div className="space-y-8">
            <div>
              <h2 className="font-editorial text-3xl leading-tight text-foreground md:text-4xl">
                不是为了制造更多信息，
                <br />
                而是为了更快看清主线
              </h2>
              <div className="mt-6 max-w-3xl space-y-4 text-base leading-relaxed text-muted-foreground">
                <p>
                  我是硅谷大厂的全职程序员，也投资美股十多年。过去我每天被盘面、新闻和社交媒体牵着走，涨跌都知道，真正的原因却经常要花很久才拼出来。
                </p>
                <p>
                  TheMarketBrew 最早只是给自己做的一份 AI 日报。后来它逐渐变成一个完整的投研平台：日报、盘前情报、个股深度分析、宏观仪表盘和投研助手，都服务同一个目标。
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { icon: Clock3, text: "少花时间追噪音" },
                { icon: TrendingUp, text: "多看事实和主线" },
                { icon: ShieldCheck, text: "让决策更平静" },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.text}
                    data-delight-card
                    className="rounded-lg border border-border/55 bg-card/35 p-4"
                  >
                    <Icon className="mb-3 h-4 w-4 text-primary" aria-hidden />
                    <p className="text-sm font-medium text-foreground">
                      {item.text}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section
        data-delight-section
        className="relative overflow-hidden py-16 md:py-20"
      >
        <div className="mx-auto max-w-4xl px-4 text-center md:px-6">
          <h2 className="font-editorial text-3xl leading-tight text-foreground md:text-4xl">
            从一份清晰研究开始
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
            免费体验日报和投研助手。需要更完整的推送、博主观点和深度个股分析时，再升级即可。
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/research"
              data-delight-action
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-7 py-3 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.98]"
            >
              进入投研助手
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              href="/today"
              data-delight-action
              className="inline-flex min-h-11 items-center rounded-lg border border-border/60 bg-card/35 px-5 py-3 text-sm font-medium text-foreground transition-all hover:border-primary/35 hover:bg-card/60"
            >
              先看盘后总览
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
