'use client';

import Link from 'next/link';
import {
  CandlestickChart,
  ChevronRight,
  Layers,
  MessageCircle,
  Radar,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';

import {
  useKolCockpitHighConviction,
  useKolCockpitSector,
  useKolCockpitTickers,
} from '@/hooks/queries/use-kol-data';
import type { KolCockpitTickerSummary } from '@/lib/api';
import { formatStockPrice } from '@/lib/currency';
import OverviewMiniPreview from './OverviewMiniPreview';

interface Props {
  username: string;
}

/**
 * Serenity overview — drops Frank's tile structure on top of supply-chain
 * specific content. 4 tiles in a 12-col grid, mirroring FrankOverview:
 *
 *   ┌───────────────────────────────┬─────────────────┐
 *   │ 高确信清单 (HIGH CONVICTION)   │  个股雷达        │
 *   │  links to /sectors            │  links to /stocks│
 *   ├───────────────────────────────┼─────────────────┤
 *   │ AI capex 周期 (macro)         │  追问            │
 *   │  links to /macro              │  → /research     │
 *   └───────────────────────────────┴─────────────────┘
 */
export default function SerenityOverview({ username }: Props) {
  const hcQ = useKolCockpitHighConviction(username);
  const tickersQ = useKolCockpitTickers(username);
  const macroQ = useKolCockpitSector(username, 'ai-capex-cycle');
  const tickers = tickersQ.data?.tickers ?? [];
  const groups = hcQ.data?.groups ?? [];
  const macro = macroQ.data;

  // Top tickers — by mention count, top 6, with live prices already merged in.
  const topTickers = tickers.slice(0, 6);

  // For the AI capex tile, grab her core questions or first bullet rules.
  const macroCoreQs = (macro?.core_questions ?? [])
    .map((r) => r.text)
    .filter(Boolean);
  const macroSignals = (macro?.signals ?? [])
    .map((r) => r.text)
    .filter(Boolean);

  const promptExamples = [
    '按 Serenity 的供应链漏斗, 现在瓶颈卡在哪一环？',
    '把 AXTI 的 thesis 拆给我看 - 她为什么敢重仓？',
    '她推荐什么 small cap? 跟单需要注意什么风险？',
  ];

  return (
    <div className="space-y-6 py-5 md:space-y-7 md:py-8">
      {/* Hero strip */}
      <section className="max-w-3xl space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="h-px w-12 bg-gradient-to-r from-primary to-transparent" />
          <span className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
            KOL ARCHIVE
          </span>
        </div>
        <div className="space-y-3">
          <h2 className="font-editorial text-3xl leading-tight tracking-tight text-foreground md:text-4xl">
            Serenity 投研驾驶舱
          </h2>
          <p className="max-w-[68ch] text-base leading-relaxed text-muted-foreground md:text-lg">
            把她在 X 上散落的 AI / 半导体供应链观点蒸馏成可调用的多层 skill 体系 ——
            沿 capex 漏斗找上游瓶颈, 在机构发现前重仓买入, 然后无视短期波动持有到瓶颈被消解。
          </p>
        </div>
      </section>

      {/* Mini supply-chain funnel — the one visual that captures her worldview */}
      <section className="rounded-lg border border-border/45 bg-card/30 p-4 md:p-5">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          她的供应链漏斗 · 钱从 Mag7 流到上游瓶颈
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-2">
          {FUNNEL_LAYERS.map((layer, i) => (
            <span key={layer.key} className="flex items-center gap-1.5">
              <Link
                href={`/kol/${username}/sectors?key=${encodeURIComponent(layer.sectorKey)}`}
                className="rounded-md border border-primary/25 bg-primary/[0.06] px-2.5 py-1 text-xs font-medium text-foreground transition hover:border-primary/55 hover:bg-primary/10"
              >
                {layer.label}
              </Link>
              {i < FUNNEL_LAYERS.length - 1 && (
                <ChevronRight
                  className="h-3.5 w-3.5 text-muted-foreground/60"
                  aria-hidden
                />
              )}
            </span>
          ))}
        </div>
      </section>

      {/* 4-tile preview grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-12 md:gap-5">
        {/* 1. HIGH CONVICTION */}
        <OverviewMiniPreview
          title="高确信清单"
          icon={Layers}
          href={`/kol/${username}/sectors`}
          className="md:col-span-7"
          bodyClassName="space-y-3"
        >
          <SectionIntro text="按供应链环节列她现在重仓 / 高确信的标的。high / medium 覆盖度优先, 一行 thesis。点开看她的完整框架。" />
          {hcQ.isLoading ? (
            <MiniLoading rows={4} />
          ) : groups.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无高确信清单</p>
          ) : (
            <ul className="space-y-2">
              {groups.slice(0, 4).map((g) => {
                const lead = g.tickers[0];
                if (!lead) return null;
                return (
                  <li
                    key={g.sector_key}
                    className="grid gap-1 border-l border-primary/25 pl-3 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-3"
                  >
                    <span className="text-xs font-medium uppercase tracking-[0.14em] text-primary">
                      {g.sector_eyebrow}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-data text-sm font-semibold tabular-nums text-foreground">
                          ${lead.ticker}
                        </span>
                        {lead.coverage === 'high' && (
                          <span className="rounded-sm bg-emerald-500/10 px-1.5 py-0.5 text-micro font-medium text-emerald-600 dark:text-emerald-400">
                            高信念
                          </span>
                        )}
                        {lead.region && lead.region !== 'US' && (
                          <span className="rounded-sm border border-border/60 px-1 py-0 font-data text-micro text-muted-foreground">
                            {lead.region}
                          </span>
                        )}
                      </div>
                      {lead.thesis && (
                        <p className="mt-0.5 line-clamp-1 text-sm text-foreground">
                          {lead.thesis}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </OverviewMiniPreview>

        {/* 2. Stocks radar */}
        <OverviewMiniPreview
          title="个股雷达"
          icon={CandlestickChart}
          href={`/kol/${username}/stocks`}
          className="md:col-span-5"
          bodyClassName="space-y-3"
        >
          <SectionIntro text="按提及次数排的全量个股池, 含覆盖度 + 公司解码 + 价格曲线。" />
          {tickersQ.isLoading ? (
            <MiniLoading rows={3} />
          ) : topTickers.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无个股</p>
          ) : (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-2 xl:grid-cols-3">
              {topTickers.map((t) => (
                <li
                  key={t.ticker}
                  className="flex items-center justify-between gap-2 rounded-md border border-border/40 bg-background/45 px-2.5 py-2"
                >
                  <span className="min-w-0">
                    <span className="block font-data text-sm font-medium tabular-nums text-foreground">
                      ${t.ticker}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {t.count} 次
                    </span>
                  </span>
                  <PriceMini ticker={t.ticker} price={t.price} change={t.daily_change} />
                </li>
              ))}
            </ul>
          )}
        </OverviewMiniPreview>

        {/* 3. AI capex macro */}
        <OverviewMiniPreview
          title="AI capex 周期"
          icon={Radar}
          href={`/kol/${username}/macro`}
          className="md:col-span-7"
          bodyClassName="space-y-3"
        >
          <SectionIntro
            text={
              macro?.short ||
              '她对宏观的所有判断都从 AI capex 节奏出发, 不写 Fed 流动性, 重点在 KR / TW / JP 地缘 + 客户量产时间表。'
            }
          />
          {macroQ.isLoading ? (
            <MiniLoading rows={3} />
          ) : (
            <div className="space-y-2.5">
              {macroCoreQs.slice(0, 2).map((q, i) => (
                <p
                  key={i}
                  className="line-clamp-2 rounded-md border border-border/40 bg-background/40 px-3 py-2 text-xs leading-relaxed text-foreground"
                >
                  {q}
                </p>
              ))}
              {macroSignals.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {macroSignals.slice(0, 5).map((sig) => (
                    <span
                      key={sig}
                      className="line-clamp-1 max-w-[18ch] rounded-md border border-border/40 bg-background/40 px-2 py-1 text-xs text-muted-foreground"
                    >
                      {sig.length > 18 ? sig.slice(0, 18) + '…' : sig}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </OverviewMiniPreview>

        {/* 4. Ask Serenity */}
        <OverviewMiniPreview
          title="专属智能体问答"
          icon={MessageCircle}
          href={`/research?agent=kol&persona=${encodeURIComponent(username)}`}
          className="md:col-span-5"
          bodyClassName="space-y-4"
        >
          <SectionIntro text="带上她的方法论与历史 thesis, 用她的供应链漏斗向她追问任何问题。" />
          <div className="space-y-2">
            {promptExamples.map((prompt) => (
              <span
                key={prompt}
                className="block rounded-md border border-border/40 bg-background/45 px-3 py-2 text-sm text-foreground transition group-hover:border-primary/25 group-hover:bg-primary/5"
              >
                {prompt}
              </span>
            ))}
          </div>
          <div className="inline-flex min-h-11 items-center rounded-md border border-primary/25 bg-primary/10 px-3 text-sm font-medium text-primary transition group-hover:border-primary/45 group-hover:bg-primary/15">
            开始问答
          </div>
        </OverviewMiniPreview>
      </div>
    </div>
  );
}

const FUNNEL_LAYERS: { key: string; label: string; sectorKey: string }[] = [
  { key: 'mag7', label: 'Mag7 资本开支', sectorKey: 'ai-infrastructure-mag7' },
  { key: 'neocloud', label: 'Neocloud', sectorKey: 'neocloud' },
  { key: 'optics', label: '光通信', sectorKey: 'optical-transceivers' },
  { key: 'photonics', label: '光子学 · CPO', sectorKey: 'photonics-and-cpo' },
  { key: 'substrates', label: '衬底材料', sectorKey: 'substrates' },
];

function SectionIntro({ text }: { text: string }) {
  return (
    <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
      {text}
    </p>
  );
}

function MiniLoading({ rows }: { rows: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="space-y-2">
          <div className="h-3 w-1/3 rounded bg-muted/50" />
          <div className="h-4 w-[90%] rounded bg-muted/40" />
        </div>
      ))}
    </div>
  );
}

function PriceMini({
  ticker,
  price,
  change,
}: {
  ticker: string;
  price: number | null;
  change: number | null;
}) {
  if (price == null) return null;
  const hasChange = change != null;
  const up = (change ?? 0) > 0;
  const color = !hasChange
    ? 'text-muted-foreground'
    : up
      ? 'text-primary'
      : (change ?? 0) === 0
        ? 'text-muted-foreground'
        : 'text-destructive';
  const ChangeIcon =
    hasChange && (change ?? 0) !== 0 ? (up ? TrendingUp : TrendingDown) : null;
  return (
    <div
      className={`shrink-0 text-right font-data text-xs tabular-nums ${color}`}
    >
      <div>{formatStockPrice(price, ticker, undefined, { compactPrice: true })}</div>
      {hasChange && ChangeIcon ? (
        <div className="flex items-center justify-end gap-0.5">
          <ChangeIcon className="h-3 w-3" />
          {Math.abs(change!).toFixed(2)}%
        </div>
      ) : null}
    </div>
  );
}

// Suppress unused warning for ticker type while we keep the typed param above.
export type { KolCockpitTickerSummary };
