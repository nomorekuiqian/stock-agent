import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface SkepticCardProps {
  data: {
    bear_case: string;
    risks: string[];
  };
}

export function SkepticCard({ data }: SkepticCardProps) {
  return (
    <Card className="bento-card border-yellow-500/20 bg-yellow-500/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-yellow-500">
          ⚠️ The Skeptic's View
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="p-4 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
          <h4 className="text-xs font-bold uppercase tracking-wider text-yellow-600 mb-2">Bear Case</h4>
          <p className="text-sm text-yellow-200/90 leading-relaxed font-medium">
            {data.bear_case}
          </p>
        </div>

        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Major Risks</h4>
          <ul className="space-y-2">
            {data.risks.map((risk, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                <span className="text-yellow-500 mt-0.5">⚠️</span>
                <span>{risk}</span>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
