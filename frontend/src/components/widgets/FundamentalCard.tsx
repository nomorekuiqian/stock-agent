import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface FundamentalCardProps {
  data: {
    valuation_score: number;
    growth_score: number;
    summary: string;
    details: string[];
  };
}

export function FundamentalCard({ data }: FundamentalCardProps) {
  return (
    <Card className="bento-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          📊 Fundamental Health
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-4">
          <div className="flex-1 p-3 bg-secondary rounded-lg text-center">
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Valuation</div>
            <div className="text-xl font-bold">{data.valuation_score}/10</div>
          </div>
          <div className="flex-1 p-3 bg-secondary rounded-lg text-center">
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Growth</div>
            <div className="text-xl font-bold">{data.growth_score}/10</div>
          </div>
        </div>
        
        <p className="text-sm text-muted-foreground leading-relaxed">
          {data.summary}
        </p>

        <ul className="space-y-2">
          {data.details.map((item, i) => (
            <li key={i} className="text-xs flex items-start gap-2">
              <span className="text-primary mt-1">•</span>
              <span className="text-balance">{item}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
