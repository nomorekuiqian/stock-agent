'use client';

import { RiskGauge } from './RiskGauge';
import { LiquidityCard } from './LiquidityCard';

interface CategoryScore {
  category_id: number;
  category_name: string;
  risk_score: number;
  risk_level: string;
  headline: string;
}

interface RiskSummaryBarProps {
  compositeScore: number;
  categories: CategoryScore[];
  loading?: boolean;
}

const CATEGORY_NAMES_ZH: Record<string, string> = {
  'Economic Deterioration': '经济恶化',
  'Credit / Default Risk': '信用/违约风险',
  'Employment': '就业市场',
  'AI Company Health': 'AI公司健康度',
};

function formatScore(score: number): string {
  return score.toFixed(1);
}

function getRiskColor(level: string): string {
  if (level === 'low') return 'emerald';
  if (level === 'medium') return 'amber';
  return 'red';
}

export function RiskSummaryBar({ compositeScore, categories, loading = false }: RiskSummaryBarProps) {
  return (
    <section>
      <h2 className="text-sm font-medium text-muted-foreground mb-3">Risk Overview</h2>

      {/* Composite Risk Gauge */}
      <div className="mb-4">
        <RiskGauge value={compositeScore} loading={loading} />
      </div>

      {/* Category Score Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {categories.map((cat) => {
          const color = getRiskColor(cat.risk_level);
          return (
            <LiquidityCard
              key={cat.category_id}
              title={CATEGORY_NAMES_ZH[cat.category_name] || cat.category_name}
              value={formatScore(cat.risk_score)}
              unit="/ 10"
              description={cat.headline}
              loading={loading}
              highlight={color === 'emerald'}
            />
          );
        })}
      </div>
    </section>
  );
}
