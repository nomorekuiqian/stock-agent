"use client";

import { isFeaturePaused } from '@/lib/feature-pause';

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, X } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import {
  hasLocalOnboardingCompleted,
  markLocalOnboardingCompleted,
} from "@/lib/onboarding-status";
import { trackProductEvent } from "@/lib/product-analytics";

const TOUR_STEPS = [
  {
    target: "nav-research-agent",
    label: "AI 研究助手",
    title: "从这里开始深度投研",
    body: "点击直接进入投研助手。准确的数据，专业的框架，更有不同博主的视角帮你深度挖掘",
  },
  {
    target: "nav-daily-reports",
    label: "每日简报",
    title: "每天先看这里建立市场节奏",
    body: "盘前早报看今日焦点，盘后晚报做复盘，推特日报帮你抓高质量讨论和机会。",
  },
  {
    target: "nav-research-system",
    label: "投研",
    title: "需要深挖时进入完整研究工具",
    body: "这里放着个股研究、宏观监控和博主研究室。你可以从单个标的、大环境或成熟框架切入。",
  },
  {
    target: "nav-my",
    label: "我的",
    title: "把你的自选股加进来",
    body: "进入“我的”管理专属日报。先添加你关心的股票，AI系统全方位属于你的监控新闻、风险和机会。",
  },
] as const;

const TOUR_FINISHED_EVENT = "home-guided-tour-finished";

type TourRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

function getTourCompletedKey(userId: string | null | undefined): string {
  return `home_guided_tour_completed:${userId ?? "anonymous"}`;
}

function markHomeTourCompleted(userId: string | null | undefined): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(getTourCompletedKey(userId), "true");
  } catch {
    // Server onboarding status remains the durable source of truth.
  }
}

function hasHomeTourCompleted(userId: string | null | undefined): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(getTourCompletedKey(userId)) === "true";
  } catch {
    return false;
  }
}

function getTourLaunchMode(
  tourParam: string | null,
): "signup" | "force" | null {
  if (tourParam === "1") return "signup";
  if (tourParam === "home") return "force";
  return null;
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function findVisibleTourTarget(target: string): HTMLElement | null {
  const elements = Array.from(
    document.querySelectorAll<HTMLElement>(
      `[data-guided-tour-target="${target}"]`,
    ),
  );
  return (
    elements.find((element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== "none" &&
        style.visibility !== "hidden"
      );
    }) ?? null
  );
}

function ActiveHomeGuidedTour() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const userId = user?.id ?? null;
  const tourParam = searchParams.get("tour");
  const launchMode = getTourLaunchMode(tourParam);
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<TourRect | null>(null);
  const [placement, setPlacement] = useState<"top" | "bottom">("bottom");
  const [completing, setCompleting] = useState(false);

  const step = TOUR_STEPS[stepIndex];

  const cleanupTourUrl = useCallback(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.delete("tour");
    const nextPath = `${url.pathname}${url.search}${url.hash}`;
    router.replace(nextPath || "/", { scroll: false });
  }, [router]);

  const startTour = useCallback(() => {
    const frame = window.requestAnimationFrame(() => {
      setStepIndex(0);
      setActive(true);
    });
    trackProductEvent("home_guided_tour_started", {
      step_count: TOUR_STEPS.length,
    });
    return frame;
  }, []);

  useEffect(() => {
    if (!launchMode) return;
    if (launchMode === "signup" && authLoading) return;

    let cancelled = false;
    let frame: number | null = null;

    async function prepareTour() {
      if (launchMode === "signup") {
        if (!isAuthenticated || !userId) {
          cleanupTourUrl();
          return;
        }

        const cachedStatus = queryClient.getQueryData<{ completed: boolean }>([
          "onboarding-status",
          userId,
        ]);
        if (
          hasLocalOnboardingCompleted(userId) ||
          hasHomeTourCompleted(userId) ||
          cachedStatus?.completed === true
        ) {
          cleanupTourUrl();
          return;
        }

        try {
          const status = await api.user.onboardingStatus();
          if (cancelled) return;
          queryClient.setQueryData(["onboarding-status", userId], status);
          if (status.completed === true) {
            markLocalOnboardingCompleted(userId);
            cleanupTourUrl();
            return;
          }
        } catch {
          // If the status check fails, keep the tour available rather than
          // stranding a brand-new user on a bare homepage.
        }
      }

      if (!cancelled) {
        frame = startTour();
      }
    }

    void prepareTour();

    return () => {
      cancelled = true;
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [
    authLoading,
    cleanupTourUrl,
    isAuthenticated,
    launchMode,
    queryClient,
    startTour,
    userId,
  ]);

  const updateTargetRect = useCallback(() => {
    const element = findVisibleTourTarget(step.target);
    if (!element) {
      setTargetRect(null);
      return;
    }

    const rect = element.getBoundingClientRect();
    const inset = 10;
    const maxHeight = Math.max(180, window.innerHeight - 170);
    const top = Math.max(12, rect.top - inset);
    const left = Math.max(12, rect.left - inset);
    const width = Math.min(
      rect.width + inset * 2,
      window.innerWidth - left - 12,
    );
    const height = Math.min(rect.height + inset * 2, maxHeight);

    setTargetRect({ top, left, width, height });
    setPlacement(top > window.innerHeight * 0.42 ? "top" : "bottom");
  }, [step.target]);

  useEffect(() => {
    if (!active) return;

    const element = findVisibleTourTarget(step.target);
    element?.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "center",
      inline: "nearest",
    });

    const firstFrame = window.setTimeout(updateTargetRect, 80);
    const afterScroll = window.setTimeout(
      updateTargetRect,
      prefersReducedMotion() ? 120 : 520,
    );
    window.addEventListener("resize", updateTargetRect);
    window.addEventListener("scroll", updateTargetRect, { passive: true });

    trackProductEvent("home_guided_tour_step_view", {
      step: step.target,
      step_index: stepIndex + 1,
    });

    return () => {
      window.clearTimeout(firstFrame);
      window.clearTimeout(afterScroll);
      window.removeEventListener("resize", updateTargetRect);
      window.removeEventListener("scroll", updateTargetRect);
    };
  }, [active, step.target, stepIndex, updateTargetRect]);

  async function finishTour() {
    if (completing) return;
    setCompleting(true);
    trackProductEvent("home_guided_tour_completed", {
      step_index: stepIndex + 1,
      skipped: stepIndex < TOUR_STEPS.length - 1,
    });

    if (isAuthenticated && userId) {
      try {
        await api.user.completeOnboarding();
      } catch {
        // Tour completion should never trap the user if the backend is temporarily unavailable.
      }
      markLocalOnboardingCompleted(userId);
      queryClient.setQueryData(["onboarding-status", userId], {
        completed: true,
      });
    }

    markHomeTourCompleted(userId);
    setActive(false);
    setCompleting(false);
    window.dispatchEvent(new Event(TOUR_FINISHED_EVENT));
    cleanupTourUrl();
  }

  function goNext() {
    if (stepIndex >= TOUR_STEPS.length - 1) {
      void finishTour();
      return;
    }
    setStepIndex((current) => current + 1);
  }

  const chipStyle = useMemo(() => {
    if (!targetRect) return undefined;
    const maxWidth = Math.min(360, window.innerWidth - 32);
    const estimatedChipHeight = window.innerWidth < 640 ? 288 : 238;
    const left = Math.min(
      Math.max(16, targetRect.left),
      Math.max(16, window.innerWidth - maxWidth - 16),
    );
    const top =
      placement === "top"
        ? Math.max(16, targetRect.top - estimatedChipHeight)
        : Math.min(
            window.innerHeight - estimatedChipHeight,
            targetRect.top + targetRect.height + 16,
          );

    return {
      left,
      top: Math.max(16, top),
      width: maxWidth,
    };
  }, [placement, targetRect]);

  if (!active || !targetRect || !chipStyle) {
    return null;
  }

  return (
    <>
      <div className="fixed inset-0 z-[80] pointer-events-none">
        <div
          aria-hidden
          className="absolute rounded-xl border border-primary/70 bg-transparent shadow-[0_0_0_9999px_rgba(2,6,23,0.76)] ring-2 ring-primary/25 transition-all duration-300"
          style={{
            top: targetRect.top,
            left: targetRect.left,
            width: targetRect.width,
            height: targetRect.height,
          }}
        />
      </div>

      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="home-guided-tour-title"
        className="fixed z-[90] max-h-[calc(100vh-32px)] overflow-y-auto rounded-xl border border-border/70 bg-background/95 p-4 shadow-2xl shadow-black/35 backdrop-blur-md"
        style={chipStyle}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
            {step.label} · {stepIndex + 1}/{TOUR_STEPS.length}
          </div>
          <button
            type="button"
            onClick={() => void finishTour()}
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            aria-label="跳过导览"
            disabled={completing}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <h2
          id="home-guided-tour-title"
          className="text-lg font-semibold leading-snug text-foreground"
        >
          {step.title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {step.body}
        </p>

        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => void finishTour()}
            disabled={completing}
            className="min-h-11 cursor-pointer rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-60"
          >
            跳过
          </button>
          <button
            type="button"
            onClick={goNext}
            disabled={completing}
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {stepIndex === TOUR_STEPS.length - 1 ? (
              <>
                <Check className="h-4 w-4" aria-hidden />
                完成导览
              </>
            ) : (
              <>
                下一步
                <ArrowRight className="h-4 w-4" aria-hidden />
              </>
            )}
          </button>
        </div>
      </aside>
    </>
  );
}

export default function HomeGuidedTour() {
  if (isFeaturePaused('onboarding')) return null;
  return <ActiveHomeGuidedTour />;
}
