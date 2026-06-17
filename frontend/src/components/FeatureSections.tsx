"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowUp,
  ArrowRight,
  BarChart3,
  Check,
  Database,
  FileText,
  Glasses,
  LineChart,
  MessageSquareText,
  Newspaper,
  PanelRightOpen,
  Plus,
  Search,
  Workflow,
} from "lucide-react";
import { api, type StockSearchResult } from "@/lib/api";

function SectionLabel({
  label,
  align = "left",
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
      <span className="text-primary text-xs font-semibold tracking-[0.2em] uppercase">
        {label}
      </span>
      {align === "center" && (
        <div className="h-px w-12 bg-gradient-to-l from-primary to-transparent" />
      )}
    </div>
  );
}

function ArrowLink({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "quiet";
}) {
  const className =
    variant === "primary"
      ? "bg-primary text-primary-foreground hover:bg-primary/90"
      : "border border-border/60 bg-card/35 text-foreground hover:border-primary/35 hover:bg-card/60";

  return (
    <Link
      href={href}
      data-delight-action
      className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-5 py-3 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:scale-[0.98] ${className}`}
    >
      {children}
      <ArrowRight className="h-4 w-4" aria-hidden />
    </Link>
  );
}

function StockSearchBox() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StockSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const composingRef = useRef(false);

  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 1) {
      setResults([]);
      setOpen(false);
      return;
    }
    setIsSearching(true);
    try {
      const data = await api.searchStocks(q, 5);
      setResults(data.stocks);
      setOpen(data.stocks.length > 0);
    } catch {
      setResults([]);
      setOpen(false);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const onQueryChange = useCallback(
    (value: string) => {
      setQuery(value);
      if (composingRef.current) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => doSearch(value), 300);
    },
    [doSearch]
  );

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <Search
          className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={(e) => {
            composingRef.current = false;
            onQueryChange((e.target as HTMLInputElement).value);
          }}
          onFocus={() => {
            if (results.length > 0) setOpen(true);
          }}
          placeholder="输入股票代码或公司名"
          className="min-h-11 w-full rounded-lg border border-border/60 bg-background/70 py-3 pl-11 pr-4 text-sm text-foreground transition-all placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20"
        />
        {isSearching && (
          <div
            className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-primary/40 border-t-primary animate-spin"
            aria-hidden
          />
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-lg border border-border/70 bg-card shadow-2xl shadow-black/30">
          {results.map((stock) => (
            <button
              key={stock.symbol}
              onClick={() => {
                router.push(`/stock/${stock.symbol}`);
              }}
              className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-primary/[0.055]"
            >
              <div className="min-w-0">
                <div className="font-data text-sm font-semibold text-primary">
                  {stock.symbol}
                </div>
                <div className="truncate text-sm text-muted-foreground">
                  {stock.name}
                </div>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const TRUST_STATS = [
  {
    value: "1,500+",
    label: "活跃用户",
    detail: "中文投资者正在用 TheMarketBrew 做日常研究",
    numeric: true,
  },
  {
    value: "3,680+",
    label: "美股标的",
    detail: "覆盖主流可交易股票与 ETF 的研究入口",
    numeric: true,
  },
  {
    value: "300+",
    label: "博主观点源",
    detail: "从高质量公开观点里提取论据和市场线索",
    numeric: true,
  },
  {
    value: "多市场",
    label: "信息延伸",
    detail: "以美股为核心，延伸到港股、A 股、日股、韩国等相关市场",
    numeric: false,
  },
];

function TrustSignalSection() {
  const markets = ["美股", "港股", "A 股", "日股", "韩国"];

  return (
    <section
      data-delight-section
      className="relative border-b border-border/40 bg-card/15 py-12 md:py-16"
    >
      <div className="mx-auto grid max-w-6xl gap-8 px-4 md:px-6 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="space-y-4">
          <SectionLabel label="Trusted Research Stack" />
          <h2 className="font-editorial text-3xl leading-tight text-foreground md:text-4xl">
            被真实投资者每天打开的投研系统
          </h2>
          <p className="max-w-xl text-sm leading-relaxed text-muted-foreground md:text-base">
            我们不把 Agent 做成单纯聊天窗口，而是把专业数据、新闻、宏观和博主方法论放进同一个研究环境。
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            {markets.map((market) => (
              <span
                key={market}
                className="rounded-full border border-border/60 bg-background/55 px-3 py-1 text-sm font-medium text-muted-foreground"
              >
                {market}
              </span>
            ))}
          </div>
        </div>

        <div className="grid gap-px overflow-hidden rounded-lg border border-border/60 bg-border/40 sm:grid-cols-2">
          {TRUST_STATS.map((stat) => (
            <div
              key={stat.label}
              data-delight-card
              className="bg-background/80 p-5 md:p-6"
            >
              <div
                className={`mb-2 text-2xl text-foreground md:text-3xl ${
                  stat.numeric ? "font-data font-semibold" : "font-medium"
                }`}
              >
                {stat.value}
              </div>
              <div className="mb-2 text-sm font-semibold text-foreground">
                {stat.label}
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {stat.detail}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const AGENT_PILLARS = [
  {
    icon: Database,
    title: "专业准确的股票数据和新闻",
    desc: "行情、财务、新闻、宏观数据和报告内容进入同一套上下文，回答不脱离事实基础。",
  },
  {
    icon: Workflow,
    title: "专业投研工作流",
    desc: "从筛选、比较、个股研究到宏观和日报复盘，Agent 可以沿着研究链路持续推进。",
  },
  {
    icon: Glasses,
    title: "用博主视角看待市场",
    desc: "切换到 qinbafrank 或 Serenity，把公开观点、方法论和原文证据变成可追问的研究视角。",
  },
];

function MiniAssistantAvatar() {
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-primary/20 bg-primary/10">
      <Image
        src="/logo-avatar.png"
        alt="TheMarketBrew Agent"
        width={28}
        height={28}
        className="h-full w-full object-cover"
      />
    </div>
  );
}

function ResearchAgentVisual() {
  const previewRef = useRef<HTMLDivElement>(null);
  const conversations = [
    "AI 半导体比较",
    "NVDA 风险复盘",
    "Frank 观点验证",
  ];
  const contextItems = ["股票数据", "新闻", "宏观", "博主观点"];
  const candidateRows = [
    { symbol: "NVDA", label: "AI 芯片龙头", tone: "text-primary" },
    { symbol: "AVGO", label: "AI 网络与 ASIC", tone: "text-sky-500" },
    { symbol: "AMD", label: "追赶者", tone: "text-amber-500" },
  ];

  useEffect(() => {
    const rootEl = previewRef.current;
    if (!rootEl) return;

    let disposed = false;
    let cleanupGsap: (() => void) | undefined;

    async function setupAnimation(rootEl: HTMLDivElement) {
      const { gsap } = await import("gsap");
      if (disposed) return;

      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;

      const ctx = gsap.context(() => {
        if (reduceMotion) {
          gsap.set(
            [
              rootEl,
              "[data-agent-panel]",
              "[data-agent-message]",
              "[data-agent-chip]",
              "[data-agent-card]",
            ],
            { autoAlpha: 1, clearProps: "transform" }
          );
          return;
        }

        const panels = rootEl.querySelectorAll("[data-agent-panel]");
        const messages = rootEl.querySelectorAll("[data-agent-message]");
        const cards = rootEl.querySelectorAll("[data-agent-card]");
        const chips = rootEl.querySelectorAll("[data-agent-chip]");
        const status = rootEl.querySelector("[data-agent-status]");
        const scan = rootEl.querySelector("[data-agent-scan]");
        const orb = rootEl.querySelector("[data-agent-orb]");

        gsap.set(rootEl, {
          autoAlpha: 0,
          transformPerspective: 1200,
          transformOrigin: "50% 45%",
        });
        gsap.set([panels, messages, cards, chips], { autoAlpha: 0, y: 14 });
        gsap.set(status, { autoAlpha: 0, scale: 0.92 });
        gsap.set(scan, { autoAlpha: 0, xPercent: -130 });
        gsap.set(orb, { rotate: -8, scale: 0.9 });

        const intro = gsap.timeline({
          paused: true,
          defaults: { duration: 0.55, ease: "power3.out" },
        });

        intro
          .to(rootEl, { autoAlpha: 1, y: 0, scale: 1, duration: 0.75 })
          .from(rootEl, { y: 28, scale: 0.985, duration: 0.75 }, 0)
          .to(orb, { rotate: 0, scale: 1, duration: 0.75 }, "<0.08")
          .to(status, { autoAlpha: 1, scale: 1, duration: 0.45 }, "<0.15")
          .to(panels, { autoAlpha: 1, y: 0, stagger: 0.08 }, "<0.08")
          .to(cards, { autoAlpha: 1, y: 0, stagger: 0.045 }, "<0.12")
          .to(messages, { autoAlpha: 1, y: 0, stagger: 0.12 }, "<0.08")
          .to(chips, { autoAlpha: 1, y: 0, stagger: 0.05 }, "<0.05");

        let hasPlayed = false;
        const observer = new IntersectionObserver(
          ([entry]) => {
            if (!entry?.isIntersecting || hasPlayed) return;
            hasPlayed = true;
            intro.play(0);

            gsap.to(scan, {
              autoAlpha: 1,
              xPercent: 330,
              duration: 1.35,
              ease: "power2.inOut",
              repeat: -1,
              repeatDelay: 3.2,
            });
            gsap.to(status, {
              scale: 1.05,
              duration: 0.85,
              ease: "sine.inOut",
              yoyo: true,
              repeat: 3,
              delay: 0.9,
            });
            gsap.to(rootEl.querySelectorAll("[data-agent-context-row]"), {
              y: -2,
              duration: 0.42,
              ease: "sine.inOut",
              yoyo: true,
              repeat: 1,
              stagger: 0.08,
              delay: 1.1,
            });
          },
          { threshold: 0.35 }
        );

        observer.observe(rootEl);

        const finePointer = window.matchMedia("(pointer: fine)").matches;
        let removePointerListeners: (() => void) | undefined;

        if (finePointer) {
          const rotateXTo = gsap.quickTo(rootEl, "rotationX", {
            duration: 0.55,
            ease: "power3.out",
          });
          const rotateYTo = gsap.quickTo(rootEl, "rotationY", {
            duration: 0.55,
            ease: "power3.out",
          });

          const handleMove = (event: MouseEvent) => {
            const rect = rootEl.getBoundingClientRect();
            const xRatio = (event.clientX - rect.left) / rect.width - 0.5;
            const yRatio = (event.clientY - rect.top) / rect.height - 0.5;
            rotateXTo(yRatio * -3);
            rotateYTo(xRatio * 4);
          };

          const handleLeave = () => {
            rotateXTo(0);
            rotateYTo(0);
          };

          rootEl.addEventListener("mousemove", handleMove);
          rootEl.addEventListener("mouseleave", handleLeave);
          removePointerListeners = () => {
            rootEl.removeEventListener("mousemove", handleMove);
            rootEl.removeEventListener("mouseleave", handleLeave);
          };
        }

        cleanupGsap = () => {
          observer.disconnect();
          removePointerListeners?.();
          ctx.revert();
        };
      }, rootEl);

      if (reduceMotion) {
        cleanupGsap = () => ctx.revert();
      }
    }

    void setupAnimation(rootEl);

    return () => {
      disposed = true;
      cleanupGsap?.();
    };
  }, []);

  return (
    <div
      ref={previewRef}
      data-agent-preview-root
      className="relative flex min-h-[560px] flex-col overflow-hidden rounded-lg border border-border/70 bg-background shadow-2xl shadow-black/10 will-change-transform md:aspect-[16/9] md:min-h-0"
    >
      <div
        data-agent-panel
        className="relative flex items-center justify-between gap-3 overflow-hidden border-b border-border/60 bg-card/45 px-4 py-3"
      >
        <div
          data-agent-scan
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-primary/20 to-transparent"
        />
        <div className="flex items-center gap-2">
          <div
            data-agent-orb
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-primary/20 bg-primary/10"
          >
            <MessageSquareText className="h-3.5 w-3.5 text-primary" aria-hidden />
          </div>
          <div>
            <div className="text-sm font-semibold text-foreground">投研助手</div>
            <div className="text-xs text-muted-foreground">Research workspace</div>
          </div>
        </div>
        <span
          data-agent-status
          className="rounded-full border border-primary/20 bg-primary/[0.06] px-3 py-1 text-sm font-medium text-primary"
        >
          上下文已就绪
        </span>
      </div>

      <div className="grid min-h-[504px] flex-1 bg-border/40 md:grid-cols-[0.68fr_1.42fr] md:min-h-0 lg:grid-cols-[0.72fr_1.45fr_0.95fr]">
        <aside data-agent-panel className="hidden bg-card/35 p-3 md:block">
          <button
            type="button"
            className="mb-3 flex w-full items-center gap-2 rounded-lg border border-border/50 bg-background px-3 py-2 text-left text-sm font-medium text-foreground"
          >
            <Plus className="h-3.5 w-3.5 text-primary" aria-hidden />
            新对话
          </button>
          <div className="space-y-1">
            {conversations.map((conversation, index) => (
              <div
                key={conversation}
                className={`rounded-lg px-3 py-2 text-sm ${
                  index === 0
                    ? "border border-primary/20 bg-primary/[0.07] text-foreground"
                    : "text-muted-foreground"
                }`}
              >
                <div className="truncate">{conversation}</div>
                <div className="mt-0.5 text-sm text-muted-foreground">
                  {index === 0 ? "正在研究" : "历史对话"}
                </div>
              </div>
            ))}
          </div>
        </aside>

        <div data-agent-panel className="flex min-w-0 flex-col bg-background">
          <div className="flex items-center justify-between border-b border-border/55 px-4 py-3">
            <div>
              <div className="text-sm font-medium text-foreground">
                NVDA 与 AVGO 长期配置
              </div>
              <div className="text-sm text-muted-foreground">
                普通投研助手
              </div>
            </div>
            <PanelRightOpen className="h-4 w-4 text-muted-foreground" aria-hidden />
          </div>

          <div className="flex-1 space-y-4 px-4 py-4">
            <div data-agent-message className="flex justify-end">
              <div className="max-w-[82%] rounded-2xl border border-border/50 bg-muted px-4 py-2.5 text-sm leading-relaxed text-foreground">
                NVDA 和 AVGO，谁更适合作为 AI 基建长期仓位？
              </div>
            </div>

            <div data-agent-message className="flex gap-3">
              <MiniAssistantAvatar />
              <div className="min-w-0 flex-1 space-y-3">
                <p className="text-sm leading-relaxed text-foreground">
                  我会先把问题拆成四层：收入质量、估值、AI 需求可持续性和下行风险。当前更像是两种不同风险暴露。
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {[
                    ["NVDA", "弹性更高，估值更依赖 AI 训练需求延续"],
                    ["AVGO", "现金流更稳，ASIC 与网络侧受益更分散"],
                  ].map(([symbol, text]) => (
                    <div
                      key={symbol}
                      data-agent-card
                      className="rounded-lg border border-border/55 bg-card/35 p-3"
                    >
                      <div className="mb-1 font-data text-sm font-semibold text-primary">
                        {symbol}
                      </div>
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {text}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                  {["继续比较估值", "看风险清单", "切到 Frank 视角"].map((chip) => (
                    <span
                      key={chip}
                      data-agent-chip
                      className="rounded-full border border-border/55 bg-background px-3 py-1"
                    >
                      {chip}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-border/55 p-3">
            <div className="flex items-end gap-2 rounded-2xl border border-border bg-card p-2.5">
              <div className="min-h-10 flex-1 px-2 py-1 text-sm text-muted-foreground">
                继续追问估值、风险或切换博主视角...
              </div>
              <button
                type="button"
                aria-label="发送"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
              >
                <ArrowUp className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>
        </div>

        <aside data-agent-panel className="hidden bg-card/35 p-4 lg:block">
          <div className="mb-4">
            <div className="mb-2 text-sm font-semibold text-foreground">
              工作台上下文
            </div>
            <div className="grid gap-2">
              {contextItems.map((item) => (
                <div
                  key={item}
                  data-agent-card
                  data-agent-context-row
                  className="flex items-center gap-2 rounded-lg border border-border/50 bg-background/70 px-3 py-2 text-sm text-foreground"
                >
                  <Check className="h-3.5 w-3.5 text-primary" aria-hidden />
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-sm font-semibold text-foreground">
              候选标的
            </div>
            <div className="space-y-2">
              {candidateRows.map((row) => (
                <div
                  key={row.symbol}
                  data-agent-card
                  className="rounded-lg border border-border/50 bg-background/70 p-3"
                >
                  <div className={`font-data text-sm font-semibold ${row.tone}`}>
                    {row.symbol}
                  </div>
                  <div className="mt-0.5 text-sm text-muted-foreground">
                    {row.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function ResearchAgentSection() {
  return (
    <section
      data-delight-section
      className="relative overflow-hidden py-20 md:py-32"
    >
      <div className="absolute inset-0 bg-[linear-gradient(rgba(16,185,129,0.018)_1px,transparent_1px),linear-gradient(90deg,rgba(16,185,129,0.018)_1px,transparent_1px)] bg-[size:80px_80px]" />
      <div className="relative mx-auto max-w-7xl px-4 md:px-6">
        <div className="mx-auto mb-10 max-w-3xl text-center md:mb-12">
          <div className="mb-6">
            <SectionLabel label="Research Agent" align="center" />
          </div>
          <h2 className="font-editorial text-3xl leading-tight text-foreground md:text-5xl">
            不是聊天机器人，
            <br />
            是一套会追问的投研工作流
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
            TheMarketBrew Agent 的核心，是把专业准确的股票数据和新闻、完整投研流程，以及博主视角放在同一个研究台里。
          </p>
        </div>

        <div className="mx-auto mb-8 grid max-w-6xl gap-3 md:grid-cols-3">
          {AGENT_PILLARS.map((pillar) => {
            const Icon = pillar.icon;
            return (
              <div
                key={pillar.title}
                data-delight-card
                className="rounded-lg border border-border/50 bg-card/30 p-4 transition-colors hover:border-primary/25 hover:bg-card/45"
              >
                <div className="mb-2 flex items-center gap-2.5">
                  <Icon className="h-4 w-4 text-primary" aria-hidden />
                  <h3 className="text-sm font-semibold text-foreground">
                    {pillar.title}
                  </h3>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {pillar.desc}
                </p>
              </div>
            );
          })}
        </div>

        <div className="mb-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <ArrowLink href="/research">进入投研工作台</ArrowLink>
          <ArrowLink href="/stock" variant="quiet">
            查看个股研究
          </ArrowLink>
        </div>

        <ResearchAgentVisual />
      </div>
    </section>
  );
}

const PERSONA_CARDS = [
  {
    name: "qinbafrank",
    handle: "@qinbafrank",
    href: "/kol/qinbafrank",
    avatar: "/kol-avatars/qinbafrank.png",
    desc: "围绕 AI 算力、宏观流动性、市场节奏和加密金融，把长期公开观点整理成可追问的研究框架。",
    tags: ["AI 产业", "宏观与市场", "公司逻辑"],
  },
  {
    name: "Serenity",
    handle: "@aleabitoreddit",
    href: "/kol/serenity",
    avatar: "/kol-avatars/serenity.png",
    desc: "偏向 AI 半导体供应链、光子/CPO 和物理瓶颈迁移，适合从底层供给链理解机会。",
    tags: ["供应链漏斗", "光子/CPO", "瓶颈迁移"],
  },
];

function PersonaResearchSection() {
  return (
    <section
      data-delight-section
      className="relative overflow-hidden border-y border-border/40 bg-muted/10 py-20 md:py-28"
    >
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <div className="mb-10 grid gap-8 md:grid-cols-[0.9fr_1.1fr] md:items-end">
          <div className="space-y-5">
            <SectionLabel label="Blogger Lens" />
            <h2 className="font-editorial text-3xl leading-tight text-foreground md:text-5xl">
              博主研究室：
              <br />
              用成熟视角重新看市场
            </h2>
          </div>
          <p className="max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
            我们把公开内容蒸馏成方法论、主题地图和原文证据。你看到的是研究视角和历史证据，不是伪装成博主本人发言。
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {PERSONA_CARDS.map((persona) => (
            <Link
              key={persona.name}
              href={persona.href}
              data-delight-card
              className="group rounded-lg border border-border/55 bg-card/35 p-6 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:bg-card/55"
            >
              <div className="mb-5 flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-4">
                  <Image
                    src={persona.avatar}
                    alt={`${persona.name} avatar`}
                    width={56}
                    height={56}
                    sizes="56px"
                    loading="eager"
                    unoptimized
                    className="h-14 w-14 shrink-0 rounded-xl border border-border/60 bg-muted object-cover ring-1 ring-primary/10"
                  />
                  <div className="min-w-0">
                    <div className="mb-1 truncate font-editorial text-2xl text-foreground">
                      {persona.name}
                    </div>
                    <div className="truncate text-sm font-medium text-primary">
                      {persona.handle}
                    </div>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
              </div>
              <p className="mb-5 text-sm leading-relaxed text-muted-foreground">
                {persona.desc}
              </p>
              <div className="flex flex-wrap gap-2">
                {persona.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-border/60 bg-background/55 px-3 py-1 text-sm font-medium text-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </Link>
          ))}
        </div>

        <div
          data-delight-card
          className="mt-8 flex flex-col items-start justify-between gap-4 rounded-lg border border-primary/20 bg-primary/[0.055] p-5 md:flex-row md:items-center"
        >
          <div>
            <div className="text-sm font-semibold text-foreground">
              在同一个投研助手里切换普通助手和博主视角
            </div>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              主入口保持统一，用户不用在多个工具之间来回跳转。
            </p>
          </div>
          <ArrowLink href="/research">打开投研助手</ArrowLink>
        </div>
      </div>
    </section>
  );
}

type ReportAccent = "amber" | "sky" | "primary";

interface ReportCardConfig {
  key: string;
  tier: "免费" | "Pro+";
  name: string;
  tagline: string;
  cadence: string;
  bullets: string[];
  href: string;
  accent: ReportAccent;
}

const ACCENT_STYLES: Record<
  ReportAccent,
  { ring: string; dot: string; text: string; bg: string }
> = {
  amber: {
    ring: "border-amber-400/25 hover:border-amber-400/45",
    dot: "bg-amber-400",
    text: "text-amber-400",
    bg: "bg-amber-400/[0.07]",
  },
  sky: {
    ring: "border-sky-400/25 hover:border-sky-400/45",
    dot: "bg-sky-400",
    text: "text-sky-400",
    bg: "bg-sky-400/[0.07]",
  },
  primary: {
    ring: "border-primary/25 hover:border-primary/45",
    dot: "bg-primary",
    text: "text-primary",
    bg: "bg-primary/[0.07]",
  },
};

const DAILY_REPORTS: ReportCardConfig[] = [
  {
    key: "morning",
    tier: "Pro+",
    name: "盘前情报",
    tagline: "开盘前把隔夜、早盘和今日议程一次过完",
    cadence: "工作日 · 开盘前",
    bullets: ["隔夜新闻", "财报日历", "盘前异动"],
    href: "/morning",
    accent: "amber",
  },
  {
    key: "evening",
    tier: "免费",
    name: "盘后总览",
    tagline: "用更短时间复盘当天市场发生了什么",
    cadence: "工作日 · 盘后",
    bullets: ["市场动态", "板块轮动", "明日观察"],
    href: "/today",
    accent: "primary",
  },
  {
    key: "kol",
    tier: "Pro+",
    name: "推特简报",
    tagline: "把高质量博主观点筛成可以阅读的市场线索",
    cadence: "工作日 · 盘后",
    bullets: ["博主观点", "多空论据", "原文引用"],
    href: "/twitter-digest",
    accent: "sky",
  },
  {
    key: "personal",
    tier: "Pro+",
    name: "专属日报",
    tagline: "基于你的持仓，只看真正相关的市场变化",
    cadence: "工作日 · 盘后",
    bullets: ["持仓新闻", "影响分析", "邮件推送"],
    href: "/for-you",
    accent: "primary",
  },
];

function ReportCard({ config }: { config: ReportCardConfig }) {
  const s = ACCENT_STYLES[config.accent];
  return (
    <Link
      href={config.href}
      data-delight-card
      className={`group rounded-lg border bg-card/35 p-5 transition-all hover:-translate-y-0.5 hover:bg-card/55 ${s.ring}`}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden />
          <span className="text-sm font-medium text-muted-foreground">
            {config.cadence}
          </span>
        </div>
        <span className={`rounded px-2 py-1 text-sm font-medium ${s.text} ${s.bg}`}>
          {config.tier}
        </span>
      </div>
      <h3 className="mb-2 font-editorial text-2xl leading-tight text-foreground">
        {config.name}
      </h3>
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        {config.tagline}
      </p>
      <div className="flex flex-wrap gap-2">
        {config.bullets.map((bullet) => (
          <span
            key={bullet}
            className="rounded-full border border-border/50 bg-background/45 px-2.5 py-1 text-sm text-muted-foreground"
          >
            {bullet}
          </span>
        ))}
      </div>
    </Link>
  );
}

function ResearchSystemSection() {
  const surfaces = [
    {
      icon: LineChart,
      title: "个股研究页",
      desc: "把基本面、技术面、新闻和 AI 分析收在一页，适合深挖单个标的。",
      href: "/stock",
      cta: "打开个股研究",
    },
    {
      icon: BarChart3,
      title: "宏观仪表盘",
      desc: "流动性、经济、通胀利率和市场情绪四个维度，帮助判断大环境。",
      href: "/macro",
      cta: "查看宏观",
    },
  ];

  return (
    <section
      data-delight-section
      className="relative overflow-hidden py-20 md:py-32"
    >
      <div className="absolute inset-0 bg-[linear-gradient(rgba(251,191,36,0.014)_1px,transparent_1px),linear-gradient(90deg,rgba(251,191,36,0.014)_1px,transparent_1px)] bg-[size:80px_80px]" />
      <div className="relative mx-auto max-w-6xl px-4 md:px-6">
        <div className="mx-auto mb-12 max-w-3xl text-center">
          <div className="mb-6">
            <SectionLabel label="Research System" align="center" />
          </div>
          <h2 className="mb-4 font-editorial text-3xl leading-tight text-foreground md:text-5xl">
            Agent 背后，是完整的信息系统
          </h2>
          <p className="text-base leading-relaxed text-muted-foreground md:text-lg">
            不是所有研究都必须从对话开始。日报、个股页和宏观仪表盘仍然是稳定的信息入口，也会成为 Agent 的研究上下文。
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <div className="mb-4 flex items-center gap-2">
              <Newspaper className="h-4 w-4 text-primary" aria-hidden />
              <h3 className="text-sm font-semibold text-foreground">
                四份日报
              </h3>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {DAILY_REPORTS.map((report) => (
                <ReportCard key={report.key} config={report} />
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div
              data-delight-card
              className="rounded-lg border border-border/55 bg-card/35 p-5"
            >
              <div className="mb-4 flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" aria-hidden />
                <h3 className="text-sm font-semibold text-foreground">
                  所有入口都会回到研究上下文
                </h3>
              </div>
              <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
                日报、个股页、宏观仪表盘和持仓信息不是孤立页面。进入 Research 后，它们会成为 Agent 判断和追问的背景。
              </p>
              <div className="flex flex-wrap gap-2">
                {["日报", "个股", "宏观", "持仓", "博主观点"].map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-border/55 bg-background/50 px-3 py-1 text-sm font-medium text-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <div
              data-delight-card
              className="rounded-lg border border-border/55 bg-card/35 p-5"
            >
              <div className="mb-4 flex items-center gap-2">
                <Search className="h-4 w-4 text-primary" aria-hidden />
                <h3 className="text-sm font-semibold text-foreground">
                  快速进入个股研究
                </h3>
              </div>
              <StockSearchBox />
            </div>

            {surfaces.map((surface) => {
              const Icon = surface.icon;
              return (
                <Link
                  key={surface.title}
                  href={surface.href}
                  data-delight-card
                  className="group block rounded-lg border border-border/55 bg-card/35 p-5 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:bg-card/55"
                >
                  <div className="mb-3 flex items-center gap-2">
                    <Icon className="h-4 w-4 text-primary" aria-hidden />
                    <h3 className="text-sm font-semibold text-foreground">
                      {surface.title}
                    </h3>
                  </div>
                  <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
                    {surface.desc}
                  </p>
                  <div className="inline-flex items-center gap-1.5 text-sm font-medium text-primary transition-all group-hover:gap-2.5">
                    {surface.cta}
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

export default function FeatureSections() {
  return (
    <>
      <TrustSignalSection />
      <ResearchAgentSection />
      <PersonaResearchSection />
      <ResearchSystemSection />
    </>
  );
}
