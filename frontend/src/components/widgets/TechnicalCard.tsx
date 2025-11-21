import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface TechnicalCardProps {
  data: {
    trend: string;
    support: string;
    resistance: string;
    summary: string;
  };
}

export function TechnicalCard({ data }: TechnicalCardProps) {
  return (
    <Card className="bento-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          📈 Technical Radar
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 bg-secondary rounded-lg">
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Trend</div>
            <div className="font-bold text-primary">{data.trend}</div>
          </div>
          <div className="p-3 bg-secondary rounded-lg">
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Support</div>
            <div className="font-mono text-sm">{data.support}</div>
          </div>
          <div className="col-span-2 p-3 bg-secondary rounded-lg flex justify-between items-center">
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Resistance</div>
            <div className="font-mono text-sm">{data.resistance}</div>
          </div>
        </div>
        
        <p className="text-sm text-muted-foreground leading-relaxed">
          {data.summary}
        </p>
      </CardContent>
    </Card>
  );
}
