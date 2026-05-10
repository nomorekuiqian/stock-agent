/**
 * Trust banner — editorial framing of the curation moat.
 *
 * Sits above OpeningSection. One slim line in serif, set in Chinese editorial
 * voice (not metadata bullet points). Tells the reader: this is a curated
 * publication, not a feed.
 */

interface Props {
  trackedKolCount: number;
  inputTweetCount: number;
  windowHours: number;
}

export function TrustBanner({ trackedKolCount, inputTweetCount, windowHours }: Props) {
  return (
    <section
      className="pt-2 pb-1 text-center animate-fade-in-up"
      aria-label="编辑导语"
    >
      <p className="text-[11px] uppercase tracking-[0.32em] text-primary/85 font-medium">
        TheMarketBrew · 严选日报
      </p>
      <p className="mt-3 text-sm md:text-[15px] text-foreground/75 leading-relaxed font-editorial max-w-xl mx-auto">
        每日精选追踪{' '}
        <span className="font-data tabular-nums text-foreground/95">{trackedKolCount}</span>{' '}
        位金融博主,只为你呈现过去{' '}
        <span className="font-data tabular-nums text-foreground/95">{windowHours}</span>{' '}
        小时{' '}
        <span className="font-data tabular-nums text-foreground/95">{inputTweetCount}</span>{' '}
        条经五特征质量门筛选的高信号观点。
      </p>
      <span
        aria-hidden
        className="mt-4 mx-auto block w-12 h-px"
        style={{
          background:
            'linear-gradient(to right, transparent, color-mix(in srgb, var(--primary) 60%, transparent), transparent)',
        }}
      />
    </section>
  );
}
