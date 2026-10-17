export function validReportDate(date?: string): date is string {
  return !!date && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
}
export function reportPath(kind: 'today' | 'morning', report: { id?: string; report_date?: string }) {
  return validReportDate(report.report_date)
    ? `/${kind}/${report.report_date}-${kind === 'today' ? 'market-report' : 'morning-brief'}`
    : `/${kind}/${encodeURIComponent(report.id || '')}`;
}
export function reportSlugDate(kind: 'today' | 'morning', slug: string): string | null {
  const suffix = kind === 'today' ? '-market-report' : '-morning-brief';
  const date = slug.endsWith(suffix) ? slug.slice(0, -suffix.length) : '';
  return validReportDate(date) ? date : null;
}
export function reportTitle(kind: 'today' | 'morning', report: { title?: string; report_date?: string }) {
  const label = kind === 'today' ? '美股全市场日报' : '美股盘前早报';
  return `${label}${validReportDate(report.report_date) ? `｜${report.report_date}` : ''}${report.title ? `｜${report.title}` : ''}`;
}
