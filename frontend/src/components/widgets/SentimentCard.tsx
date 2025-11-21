import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface SentimentCardProps {
  data: {
    score: number;
    label: string;
    news_summary: string[];
  };
}

export function SentimentCard({ data }: SentimentCardProps) {
  const sentimentColor = 
    data.label === "Greed" ? "bg-green-500" : 
    data.label === "Fear" ? "bg-red-500" : "bg-yellow-500";

  return (
    <Card className="bento-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          🌡️ Market Sentiment
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <div className="flex justify-between items-end">
            <span className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Fear & Greed Index</span>
            <span className={`text-xl font-bold ${
              data.label === "Greed" ? "text-green-500" : 
              data.label === "Fear" ? "text-red-500" : "text-yellow-500"
            }`}>{data.label} ({data.score})</span>
          </div>
          <Progress value={data.score} indicatorColor={sentimentColor} className="h-2" />
        </div>
        
        <div className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Key Headlines</h4>
          <ul className="space-y-3">
            {data.news_summary.map((item, i) => (
              <li key={i} className="text-sm border-l-2 border-border pl-3 py-1">
                <p className="line-clamp-2 text-balance">{item}</p>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
