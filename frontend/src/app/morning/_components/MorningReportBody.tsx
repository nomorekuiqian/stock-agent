'use client';

import Link from 'next/link';
import { percent } from '@/lib/seo-public';
import { StockLinkedText } from '@/components/StockLinkedText';

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
 * Renders the morning report body with section-level paywall.
 *
 * SSR contract: the parent server component reads the access-token cookie
 * and forwards it as `Authorization` to the backend. When the cookie is
 * present + valid, the backend returns the unlocked payload directly in
 * the SSR HTML (no client-side flicker).
 *
 * Fallback: if the cookie was missing or expired at SSR time but the
 * authenticated client *does* have the entitlement, we re-fetch via the
 * authenticated client to upgrade in place. This case is rare (only when
 * the 15-min access-token cookie expires between sessions) but worth
 * handling so subscribers never see a stale lock.
 */
export function MorningReportBody({ report: initialReport, targetPath }: Props) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { has, isLoading: entLoading } = useEntitlements();

  const [report, setReport] = useState<MorningReport>(initialReport);

  const hasMorningAccess = has('morning_website');

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
        // upgrade is best-effort; keep the SSR-rendered locked shape on failure
      });
    return () => {
      cancelled = true;
    };
  }, [hasMorningAccess, initialReport.is_locked, initialReport.report_id]);

  const locked = PAYWALL_ENABLED && report.is_locked === true;
  const ctaResolving = PAYWALL_ENABLED && (authLoading || (isAuthenticated && entLoading));

  return (
    <>
      {report.public_excerpt && <section aria-label="公开盘前解读" className="space-y-3"><h2 className="text-xl font-medium">期货走势解读</h2><p className="whitespace-pre-line text-sm leading-7">{report.public_excerpt}</p></section>}
      {report.today_focus?.length>0&&<section><h2 className="text-xl">今日关注</h2>{report.today_focus.map((r,i)=><article key={i}><h3>{r.title}</h3><p>{r.analysis}</p></article>)}</section>}
      {!!report.public_event_points?.length&&<section><h2 className="text-xl">隔夜事件要点</h2>{report.public_event_points.map((r,i)=><p key={i}>{r.title}</p>)}</section>}
      {!!report.public_movers?.length&&<section><h2 className="text-xl">盘前异动个股</h2><ul>{report.public_movers.slice(0,5).map(row=><li key={row.symbol}><Link href={`/stock/${row.symbol}#why`}>{row.symbol}</Link> · {row.price} 美元 · {percent(row.change_percent)}</li>)}</ul></section>}
      <div>
      {locked && !ctaResolving && (
        <UpgradeBanner
          isAuthenticated={isAuthenticated}
          targetPath={targetPath}
        />
      )}

      <section className="morning-paywall animate-fade-in-up delay-150">
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
                  <StockLinkedText text={report.market_pulse} />
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
      </div>
    </>
  );
}
