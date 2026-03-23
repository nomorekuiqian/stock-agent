"use client";

import { Suspense, useEffect, useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

function LoadingState() {
  return (
    <main className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="w-12 h-12 border-2 border-primary/20 border-t-primary rounded-full animate-spin mx-auto" />
      </div>
    </main>
  );
}

type SaveStatus = "pending" | "saving" | "saved" | "duplicate" | "error";

function FeedbackContent() {
  const searchParams = useSearchParams();

  // Get params from URL (from email link)
  const reportDate = searchParams.get("report_date");
  const email = searchParams.get("email");
  const rating = searchParams.get("rating");
  const reportId = searchParams.get("report_id");
  const reportType = searchParams.get("report_type") || "daily"; // 'daily' or 'digest'

  // Legacy support: check for status param (old redirect flow)
  const legacyStatus = searchParams.get("status");
  const legacyError = searchParams.get("error");

  // Compute initial status from legacy params (no effect needed)
  const initialStatus = useMemo<SaveStatus>(() => {
    if (legacyStatus === "success") return "saved";
    if (legacyStatus === "duplicate") return "duplicate";
    if (legacyStatus === "error") return "error";
    return "pending";
  }, [legacyStatus]);

  const [saveStatus, setSaveStatus] = useState<SaveStatus>(initialStatus);

  // Async save feedback to backend (only for new flow, not legacy)
  useEffect(() => {
    // Skip if legacy flow (already saved by backend redirect)
    if (legacyStatus) {
      return;
    }

    // Skip if missing required params
    if (!reportDate || !email || !rating) {
      return;
    }

    // Validate rating
    if (rating !== "satisfied" && rating !== "dissatisfied") {
      return;
    }

    const saveFeedback = async () => {
      try {
        const apiUrl =
          process.env.NEXT_PUBLIC_API_URL ||
          "https://api.TheMarketBrew.xyz/api";
        const params = new URLSearchParams({
          report_date: reportDate,
          email: email,
          rating: rating,
          report_type: reportType,
        });
        if (reportId) {
          params.append("report_id", reportId);
        }

        const response = await fetch(
          `${apiUrl}/feedback/submit?${params.toString()}`,
          {
            method: "POST",
          },
        );

        const data = await response.json();

        if (data.success && data.is_duplicate) {
          setSaveStatus("duplicate");
        }
        // For other cases, keep showing success (optimistic UI)
      } catch (error) {
        console.error("[Feedback] Network error:", error);
        // Still show success to user - they clicked, that's what matters
      }
    };

    saveFeedback();
  }, [reportDate, email, rating, reportId, reportType, legacyStatus]);

  // Determine if we should show success state
  // Show success immediately if we have valid rating (optimistic UI)
  const showSuccess = rating === "satisfied" || rating === "dissatisfied";
  const showDuplicate =
    saveStatus === "duplicate" || initialStatus === "duplicate";

  // Determine report link based on type
  const reportLink = reportType === "digest" ? "/for-you" : "/today";
  const reportLabel = reportType === "digest" ? "查看专属日报" : "查看今日报告";

  // Success state (immediate display)
  if (showSuccess && !showDuplicate) {
    return (
      <main className="min-h-screen bg-white flex items-center justify-center px-4">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-primary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-semibold text-gray-900 mb-2">
              感谢你的反馈!
            </h1>
            <p className="text-sm text-gray-500">你的意见对我们非常重要</p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
            <p className="text-sm text-gray-500 mb-6">
              我们会根据你的反馈持续改进日报质量，为你提供更好的市场分析。
            </p>
            <Link
              href={reportLink}
              className="inline-block px-6 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium text-sm transition-all hover:bg-primary/90"
            >
              {reportLabel}
            </Link>
          </div>

          <div className="text-center mt-6">
            <Link
              href="/"
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              返回首页
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // Duplicate state
  if (showDuplicate) {
    return (
      <main className="min-h-screen bg-white flex items-center justify-center px-4">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-blue-100 flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-blue-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-semibold text-gray-900 mb-2">
              已收到你的反馈
            </h1>
            <p className="text-sm text-gray-500">
              你已经对这份日报提交过反馈了
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
            <p className="text-sm text-gray-500 mb-6">
              你的反馈已更新，感谢你的参与!
            </p>
            <Link
              href={reportLink}
              className="inline-block px-6 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium text-sm transition-all hover:bg-primary/90"
            >
              {reportLabel}
            </Link>
          </div>

          <div className="text-center mt-6">
            <Link
              href="/"
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              返回首页
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // Error state
  const getErrorMessage = (err: string | null) => {
    switch (err) {
      case "missing_params":
        return "请求缺少必要参数";
      case "invalid_rating":
        return "无效的评分值";
      case "server_error":
        return "服务器出错，请稍后再试";
      default:
        return "链接无效或已过期";
    }
  };

  return (
    <main className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-red-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">出错了</h1>
          <p className="text-sm text-gray-500">无法处理你的反馈</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-3 mb-6">
            <p className="text-sm text-red-600">
              {getErrorMessage(legacyError)}
            </p>
          </div>
          <p className="text-sm text-gray-500 mb-6">
            请尝试重新点击邮件中的反馈按钮，如果问题持续存在请联系我们。
          </p>
          <Link
            href={reportLink}
            className="inline-block px-6 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium text-sm transition-all hover:bg-primary/90"
          >
            {reportLabel}
          </Link>
        </div>

        <div className="text-center mt-6">
          <Link
            href="/"
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            返回首页
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function FeedbackPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <FeedbackContent />
    </Suspense>
  );
}
