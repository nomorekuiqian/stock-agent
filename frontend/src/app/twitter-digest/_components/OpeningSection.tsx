/**
 * V3 Opening — Hook (headline + intro) + Today's Takeaway, fused.
 *
 * Replaces V2's separate Header + TakeawayPanel. Each takeaway line anchors
 * to a topic card via `#topic-N` so the reader can jump straight to the
 * matching synthesis.
 */

interface Props {
  date: string;
  headline: string;
  intro: string;
  takeaway: string[];
  windowHours: number;
  trackedKolCount: number;
}

const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

function formatHeaderDate(date: string): string {
  try {
    const [y, m, d] = date.split('-').map(Number);
    const dt = new Date(`${date}T08:00:00+08:00`);
    return `${y} 年 ${m} 月 ${d} 日 · ${WEEKDAYS[dt.getDay()]}`;
  } catch {
    return date;
  }
}

export function OpeningSection({
  date, headline, intro, takeaway, windowHours, trackedKolCount,
}: Props) {
  return (
    <section
      className="text-center space-y-5 py-2 animate-fade-in-up"
      aria-label="今日开场"
    >
      <p className="text-sm text-muted-foreground tabular-nums">
        {formatHeaderDate(date)}
      </p>

      {headline ? (
        <h1 className="font-editorial text-3xl md:text-4xl text-foreground tracking-tight max-w-2xl mx-auto leading-tight">
          {headline}
        </h1>
      ) : (
        <h1 className="font-editorial text-3xl md:text-4xl text-foreground tracking-tight">
          KOL 观点日报
        </h1>
      )}

      {intro && (
        <p className="text-base text-foreground/85 max-w-2xl mx-auto leading-relaxed">
          {intro}
        </p>
      )}

      <p className="text-xs text-muted-foreground/80 tabular-nums">
        过去 <span className="font-data text-foreground/70">{windowHours}</span> 小时,
        <span className="font-data text-foreground/70">{trackedKolCount}</span> 位金融博主的关键观点
      </p>

      {takeaway.length > 0 && (
        <ol
          className="max-w-2xl mx-auto space-y-2 pt-2"
          aria-label="今日要点"
        >
          {takeaway.map((line, i) => (
            <li key={i}>
              <a
                href={`#topic-${i}`}
                className="block text-sm md:text-base text-foreground/85 hover:text-primary transition-colors px-3 py-1.5 rounded leading-relaxed"
              >
                <span className="font-data tabular-nums text-muted-foreground/70 mr-2">
                  {String(i + 1).padStart(2, '0')}
                </span>
                {line}
              </a>
            </li>
          ))}
        </ol>
      )}

      <div className="editorial-ornament" aria-hidden>
        <span className="text-xs tracking-[0.25em] uppercase text-muted-foreground/60">
          30 秒读完
        </span>
      </div>
    </section>
  );
}
