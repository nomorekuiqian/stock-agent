'use client';

import { useEffect, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { useEntitlements } from '@/contexts/EntitlementsContext';
import { MorningReportContent } from '@/components/MorningReportContent';
import { api, type MorningReport } from '@/lib/api';
import { formatReportDate } from '@/lib/timezone';

import { LockedBlur, UpgradeBanner } from './LockedBlur';

const PAYWALL_ENABLED = process.env.NEXT_PUBLIC_ENABLE_PAYWALL === 'true';

interface Props {
  report: MorningReport;
  /** Used by the upgrade banner to redirect back after login. */
  targetPath: string;
}

/**
 * Client wrapper that renders the morning report body and applies the
 * twitter-digest-style section paywall: futures cards and global markets
 * tables stay visible, AI-generated narrative is replaced by LockedBlur, and
 * an UpgradeBanner sits above the fold for free / unauth users.
 *
 * SSR contract: the backend `/morning/reports/{id}` endpoint strips AI text
 * fields when the caller lacks the `morning_website` entitlement. Server
 * fetches have no bearer token, so the report passed in here is *always*
 * the locked shape (`is_locked === true`) when rendered server-side. Once
 * we know the visitor has the entitlement, we re-fetch client-side with
 * the bearer token to upgrade in place. This keeps paid content out of the
 * SSR'd HTML even for subscribers — only their authenticated client fetch
 * sees the full payload.
 */
export function MorningReportBody({ report: initialReport, targetPath }: Props) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { has, trialEligible, isLoading: entLoading } = useEntitlements();

  const [report, setReport] = useState<MorningReport>(initialReport);

  const hasMorningAccess = has('morning_website');

  // Subscriber upgrade path: server gave us the locked shape because the
  // SSR fetch had no token. If the visitor actually has access, re-fetch
  // through the authenticated client to get the full payload. Keyed on
  // `report_id` so navigating between archived reports re-triggers.
  useEffect(() => {
    if (!PAYWALL_ENABLED || !hasMorningAccess) return;
    if (!initialReport.is_locked) return;
    if (!initialReport.report_id) return;
    let cancelled = false;
    api.morningReports
      .getById(initialReport.report_id)
      .then((full) => {
        if (cancelled || !full || full.is_locked) return;
        setReport(full);
      })
      .catch(() => {
        // upgrade is best-effort; keep showing the locked shape on failure
      });
    return () => {
      cancelled = true;
    };
  }, [hasMorningAccess, initialReport.is_locked, initialReport.report_id]);

  // Until we know who the visitor is, default to *locked* — never flash
  // paid content. (Server already returned locked data so this only
  // affects the unauth → locked frame timing, not actual data exposure.)
  const stillResolving = PAYWALL_ENABLED && (authLoading || (isAuthenticated && entLoading));
  const locked = PAYWALL_ENABLED && (stillResolving || !hasMorningAccess || report.is_locked === true);

  return (
    <>
      {locked && (
        <UpgradeBanner
          isAuthenticated={isAuthenticated}
          trialEligible={trialEligible}
          targetPath={targetPath}
        />
      )}

      <section className="animate-fade-in-up delay-150">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card border border-border/50">
            <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            <span className="text-sm font-data text-foreground tabular-nums">
              {formatReportDate(report.report_date || '')}
            </span>
          </div>
        </div>

        {locked ? (
          <div className="space-y-4">
            <LockedBlur lines={1} label="今日盘前主题" variant="paragraph" />
            <LockedBlur lines={2} variant="paragraph" />
          </div>
        ) : (
          <>
            {report.title && (
              <h2 className="text-2xl md:text-3xl font-editorial text-foreground leading-[1.15]">
                {report.title}
              </h2>
            )}
            {report.market_pulse && (
              <div className="mt-4 p-4 rounded-lg bg-primary/5 border border-primary/10">
                <p className="text-muted-foreground leading-relaxed text-sm">
                  {report.market_pulse}
                </p>
              </div>
            )}
          </>
        )}
      </section>

      <MorningReportContent
        futures={report.futures || []}
        futures_analysis={report.futures_analysis}
        global_markets={report.global_markets || { asia: [], europe: [], other: [] }}
        global_markets_analysis={report.global_markets_analysis}
        overnight_news={report.overnight_news || []}
        today_focus={report.today_focus || []}
        summary={report.summary || []}
        locked={locked}
      />
    </>
  );
}
