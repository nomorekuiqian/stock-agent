import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

interface HeadUpDisplayProps {
  ticker: string;
  price: number;
  score: number;
  signal: string;
}

export function HeadUpDisplay({ ticker, price, score, signal }: HeadUpDisplayProps) {
  const signalVariant = 
    signal === "Bullish" ? "bullish" : 
    signal === "Bearish" ? "bearish" : "neutral";

  const scoreColor = 
    score >= 7 ? "bg-green-500" : 
    score <= 3 ? "bg-red-500" : "bg-yellow-500";

  return (
    <Card className="bento-card border-l-4 border-l-primary">
      <CardContent className="p-6 flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="text-center md:text-left">
          <h2 className="text-4xl font-bold tracking-tighter">{ticker}</h2>
          <p className="text-2xl font-mono text-muted-foreground mt-1">
            ${price.toFixed(2)}
          </p>
        </div>

        <div className="flex-1 w-full md:max-w-xs space-y-2">
          <div className="flex justify-between text-sm font-medium">
            <span>AI Confidence Score</span>
            <span>{score}/10</span>
          </div>
          <Progress value={score * 10} indicatorColor={scoreColor} className="h-3" />
        </div>

        <div>
          <Badge variant={signalVariant} className="text-lg px-4 py-1 uppercase tracking-widest">
            {signal}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
