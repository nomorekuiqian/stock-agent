import * as React from "react"

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "destructive" | "outline" | "bullish" | "bearish" | "neutral"
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  const variants = {
    default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
    secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
    destructive: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
    outline: "text-foreground",
    bullish: "border-transparent bg-green-500/15 text-green-500 hover:bg-green-500/25",
    bearish: "border-transparent bg-red-500/15 text-red-500 hover:bg-red-500/25",
    neutral: "border-transparent bg-yellow-500/15 text-yellow-500 hover:bg-yellow-500/25",
  }

  return (
    <div
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${variants[variant]} ${className}`}
      {...props}
    />
  )
}

export { Badge }
