'use client';

import { useState, useMemo } from 'react';

// =============================================================================
// Types
// =============================================================================

interface StatementRow {
  key: string;
  label: string;
  indent?: boolean;
  bold?: boolean;
  separator?: boolean; // horizontal line before this row
}

interface FinancialStatementsProps {
  activeQuarter: string | null;
  incomeStatements: Array<Record<string, unknown>>;
  cashflowStatements: Array<Record<string, unknown>>;
  balanceSheets: Array<Record<string, unknown>>;
}

// =============================================================================
// Statement definitions — what rows to show and in what order
// =============================================================================

const INCOME_ROWS: StatementRow[] = [
  { key: 'revenue', label: '营收 Revenue', bold: true },
  { key: 'cost_of_revenue', label: '营业成本 COGS', indent: true },
  { key: 'gross_profit', label: '毛利润 Gross Profit', bold: true },
  { key: 'gross_profit_margin', label: '毛利率 Gross Margin', indent: true },
  { key: 'research_and_development', label: '研发费用 R&D', indent: true, separator: true },
  { key: 'selling_and_marketing', label: '销售费用 S&M', indent: true },
  { key: 'general_and_administrative', label: '管理费用 G&A', indent: true },
  { key: 'total_costs_and_expenses', label: '总成本费用 Total Costs', bold: true },
  { key: 'operating_income', label: '经营利润 Operating Income', bold: true, separator: true },
  { key: 'operating_income_margin', label: '经营利润率 Op Margin', indent: true },
  { key: 'interest_income', label: '利息收入', indent: true, separator: true },
  { key: 'interest_expense', label: '利息支出', indent: true },
  { key: 'income_before_tax', label: '税前利润 Pre-tax Income', bold: true },
  { key: 'income_tax_expense', label: '所得税 Income Tax', indent: true },
  { key: 'net_income', label: '净利润 Net Income', bold: true, separator: true },
  { key: 'net_income_margin', label: '净利率 Net Margin', indent: true },
  { key: 'depreciation_and_amortization', label: '折旧摊销 D&A', indent: true, separator: true },
  { key: 'ebitda', label: 'EBITDA', bold: true },
  { key: 'eps', label: 'EPS (Basic)', separator: true },
  { key: 'eps_diluted', label: 'EPS (Diluted)', bold: true },
  { key: 'weighted_avg_shares', label: '加权股数 Basic', separator: true },
  { key: 'weighted_avg_shares_diluted', label: '加权股数 Diluted' },
];

const CASHFLOW_ROWS: StatementRow[] = [
  { key: 'net_income', label: '净利润 Net Income' },
  { key: 'depreciation_and_amortization', label: '折旧摊销 D&A', indent: true },
  { key: 'stock_based_compensation', label: '股权激励 SBC', indent: true },
  { key: 'change_in_working_capital', label: '营运资本变动', indent: true },
  { key: 'operating_cash_flow', label: '经营活动现金流 OCF', bold: true, separator: true },
  { key: 'capital_expenditure', label: '资本支出 CapEx', separator: true },
  { key: 'acquisitions', label: '收购 Acquisitions', indent: true },
  { key: 'purchases_of_investments', label: '购买投资', indent: true },
  { key: 'sales_of_investments', label: '出售投资', indent: true },
  { key: 'net_cash_from_investing', label: '投资活动现金流', bold: true },
  { key: 'net_debt_issuance', label: '债务净发行', indent: true, separator: true },
  { key: 'stock_repurchase', label: '股票回购 Buyback', indent: true },
  { key: 'dividends_paid', label: '股息支付 Dividends', indent: true },
  { key: 'net_cash_from_financing', label: '融资活动现金流', bold: true },
  { key: 'net_change_in_cash', label: '现金净变动', bold: true, separator: true },
  { key: 'free_cash_flow', label: '自由现金流 FCF', bold: true },
  { key: 'cash_at_end', label: '期末现金', separator: true },
];

const BALANCE_ROWS: StatementRow[] = [
  { key: 'cash_and_equivalents', label: '现金 Cash' },
  { key: 'short_term_investments', label: '短期投资' },
  { key: 'cash_and_short_term_investments', label: '现金+短投合计', bold: true },
  { key: 'net_receivables', label: '应收账款', indent: true },
  { key: 'inventory', label: '存货', indent: true },
  { key: 'total_current_assets', label: '流动资产合计', bold: true, separator: true },
  { key: 'property_plant_equipment', label: '固定资产 PP&E' },
  { key: 'goodwill', label: '商誉 Goodwill' },
  { key: 'intangible_assets', label: '无形资产 Intangibles' },
  { key: 'long_term_investments', label: '长期投资' },
  { key: 'total_non_current_assets', label: '非流动资产合计', bold: true },
  { key: 'total_assets', label: '总资产 Total Assets', bold: true, separator: true },
  { key: 'accounts_payable', label: '应付账款', separator: true },
  { key: 'total_current_liabilities', label: '流动负债合计', bold: true },
  { key: 'long_term_debt', label: '长期负债 LT Debt' },
  { key: 'total_non_current_liabilities', label: '非流动负债合计', bold: true },
  { key: 'total_liabilities', label: '负债合计', bold: true, separator: true },
  { key: 'total_debt', label: '总债务 Total Debt' },
  { key: 'net_debt', label: '净债务 Net Debt' },
  { key: 'retained_earnings', label: '留存收益', separator: true },
  { key: 'additional_paid_in_capital', label: '资本公积' },
  { key: 'total_equity', label: '股东权益 Equity', bold: true },
  { key: 'shares_outstanding', label: '流通股数 Shares Out', separator: true },
];

// =============================================================================
// Helpers
// =============================================================================

function fmtVal(v: unknown, key: string): string {
  if (v === null || v === undefined) return '--';
  const n = Number(v);
  if (isNaN(n)) return String(v);

  // Margins are ratios (0.41 = 41%)
  if (key.includes('margin')) return `${(n * 100).toFixed(1)}%`;
  // EPS
  if (key.startsWith('eps')) return `$${n.toFixed(2)}`;
  // Shares
  if (key.includes('shares') || key.includes('weighted_avg')) return `${(n / 1e6).toFixed(0)}M`;

  // Financial values in millions
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function computeYoY(current: unknown, prior: unknown): string | null {
  if (current === null || current === undefined || prior === null || prior === undefined) return null;
  const c = Number(current);
  const p = Number(prior);
  if (isNaN(c) || isNaN(p) || p === 0) return null;
  const change = ((c - p) / Math.abs(p)) * 100;
  return `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`;
}

function yoyColor(yoyStr: string | null): string {
  if (!yoyStr) return '';
  return yoyStr.startsWith('+') ? 'text-emerald-400' : 'text-red-400';
}

// =============================================================================
// Statement Table Component
// =============================================================================

function StatementTable({ rows, current, prior, currentLabel, priorLabel }: {
  rows: StatementRow[];
  current: Record<string, unknown> | undefined;
  prior: Record<string, unknown> | undefined;
  currentLabel: string;
  priorLabel: string;
}) {
  if (!current) {
    return <div className="p-8 text-center text-sm text-muted-foreground">暂无数据</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-card/60">
            <th className="text-left py-2 px-3 text-xs uppercase tracking-wider text-muted-foreground font-medium w-1/2">项目</th>
            <th className="text-right py-2 px-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">{currentLabel}</th>
            {prior && <th className="text-right py-2 px-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">{priorLabel}</th>}
            {prior && <th className="text-right py-2 px-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">YoY</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const val = current[row.key];
            const priorVal = prior?.[row.key];
            const yoy = prior ? computeYoY(val, priorVal) : null;

            // Skip rows where both current and prior are null/0
            if ((val === null || val === undefined || val === 0) &&
                (priorVal === null || priorVal === undefined || priorVal === 0)) {
              return null;
            }

            return (
              <tr key={row.key} className={`border-t ${row.separator ? 'border-border/40' : 'border-border/15'} ${row.bold ? 'bg-card/30' : ''}`}>
                <td className={`py-2 px-3 ${row.indent ? 'pl-6' : ''} ${row.bold ? 'font-medium text-foreground' : 'text-foreground/80'}`}>
                  {row.label}
                </td>
                <td className={`py-2 px-3 text-right font-data ${row.bold ? 'font-semibold text-foreground' : 'text-foreground/90'}`}>
                  {fmtVal(val, row.key)}
                </td>
                {prior && (
                  <td className="py-2 px-3 text-right font-data text-muted-foreground">
                    {fmtVal(priorVal, row.key)}
                  </td>
                )}
                {prior && (
                  <td className={`py-2 px-3 text-right font-data text-xs ${yoyColor(yoy)}`}>
                    {yoy || '--'}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

type StatementTab = 'income' | 'cashflow' | 'balance';

export function FinancialStatements({
  activeQuarter,
  incomeStatements,
  cashflowStatements,
  balanceSheets,
}: FinancialStatementsProps) {
  const [activeStatement, setActiveStatement] = useState<StatementTab>('income');

  // Find current + prior year quarter
  const { current, prior, currentLabel, priorLabel } = useMemo(() => {
    const stmts = activeStatement === 'income' ? incomeStatements
      : activeStatement === 'cashflow' ? cashflowStatements
      : balanceSheets;

    if (!stmts.length || !activeQuarter) {
      return { current: undefined, prior: undefined, currentLabel: '', priorLabel: '' };
    }

    // Match by date (year-month)
    const targetYM = activeQuarter.slice(0, 7);
    const curr = stmts.find(s => String(s.date || '').slice(0, 7) === targetYM) || stmts[0];

    // Find same quarter from prior year
    const currDate = String(curr?.date || '');
    if (currDate.length >= 10) {
      const priorYear = String(parseInt(currDate.slice(0, 4)) - 1);
      const priorDate = priorYear + currDate.slice(4);
      const prev = stmts.find(s => String(s.date || '') === priorDate);

      const cLabel = curr?.fiscal_period ? `${curr.fiscal_period} ${String(curr.fiscal_year || currDate.slice(0, 4))}` : currDate.slice(0, 7);
      const pLabel = prev?.fiscal_period ? `${prev.fiscal_period} ${String(prev.fiscal_year || priorYear)}` : priorDate.slice(0, 7);

      return {
        current: curr as Record<string, unknown>,
        prior: prev as Record<string, unknown> | undefined,
        currentLabel: cLabel,
        priorLabel: pLabel,
      };
    }

    return { current: curr as Record<string, unknown>, prior: undefined, currentLabel: '', priorLabel: '' };
  }, [activeStatement, activeQuarter, incomeStatements, cashflowStatements, balanceSheets]);

  const tabs: { id: StatementTab; label: string; labelEn: string }[] = [
    { id: 'income', label: '损益表', labelEn: 'Income' },
    { id: 'cashflow', label: '现金流量表', labelEn: 'Cash Flow' },
    { id: 'balance', label: '资产负债表', labelEn: 'Balance Sheet' },
  ];

  const rows = activeStatement === 'income' ? INCOME_ROWS
    : activeStatement === 'cashflow' ? CASHFLOW_ROWS
    : BALANCE_ROWS;

  return (
    <div className="bg-card/50 light:bg-card border border-border/40 rounded-xl overflow-hidden">
      {/* Statement Tab Bar */}
      <div className="flex border-b border-border/30">
        {tabs.map((tab) => {
          const isActive = activeStatement === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveStatement(tab.id)}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-all cursor-pointer relative
                focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:outline-none
                ${isActive ? 'text-foreground bg-card/40 light:bg-muted/50' : 'text-muted-foreground hover:text-foreground hover:bg-card/20'}`}
            >
              <span>{tab.label}</span>
              <span className="text-xs text-muted-foreground ml-1 hidden sm:inline">{tab.labelEn}</span>
              {isActive && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-emerald-500" />}
            </button>
          );
        })}
      </div>

      {/* Statement Content */}
      <StatementTable
        rows={rows}
        current={current}
        prior={prior}
        currentLabel={currentLabel}
        priorLabel={priorLabel}
      />
    </div>
  );
}
