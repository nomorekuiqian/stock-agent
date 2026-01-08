import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { NavAuth } from "@/components/NavAuth";
import { ThemeToggle } from "@/components/ThemeToggle";
import { MobileMenu } from "@/components/MobileMenu";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";

export const metadata: Metadata = {
  // Google Search Console 验证 - 替换为你的验证码
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || '',
  },
  title: {
    default: "MarketBrew - AI Market Intelligence",
    template: "%s | MarketBrew",
  },
  description: "AI 驱动的美股每日分析报告。获取智能市场洞察、流动性监控、宏观经济日历，助力投资决策。每日更新，中文解读。",
  keywords: [
    "AI 美股分析", "美股每日报告", "美股日报", "市场分析工具",
    "流动性监控", "美联储资产负债表", "宏观经济分析",
    "stock market analysis", "daily market report", "AI market intelligence"
  ],
  authors: [{ name: "MarketBrew" }],
  creator: "MarketBrew",
  publisher: "MarketBrew",
  metadataBase: new URL("https://themarketbrew.com"),
  openGraph: {
    type: "website",
    locale: "zh_CN",
    url: "https://themarketbrew.com",
    siteName: "MarketBrew",
    title: "MarketBrew - AI Market Intelligence",
    description: "AI-powered daily market analysis and insights for smart investors.",
  },
  twitter: {
    card: "summary_large_image",
    title: "MarketBrew - AI Market Intelligence",
    description: "AI-powered daily market analysis and insights for smart investors.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: [
      { url: "/logo-avatar.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

// Abstract M Logo with emerald gradient
function Logo({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="emerald-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#10B981" />
          <stop offset="50%" stopColor="#34D399" />
          <stop offset="100%" stopColor="#6EE7B7" />
        </linearGradient>
      </defs>
      {/* Abstract M shape - three ascending lines forming M */}
      <path
        d="M4 24V12L10 6V24M10 6L16 14L22 6M22 6V24M28 24V12L22 6"
        stroke="url(#emerald-gradient)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body className="font-sans antialiased bg-background text-foreground min-h-screen">
        <Providers>
          {/* Navigation - Premium Glass Effect */}
          <nav className="sticky top-0 z-50 bg-background/60 backdrop-blur-2xl border-b border-border/50">
            <div className="max-w-6xl mx-auto px-4 md:px-6">
              <div className="flex items-center justify-between h-14">
                {/* Logo */}
                <Link href="/" className="flex items-center gap-2.5 group">
                  <Logo className="w-7 h-7 transition-transform duration-300 group-hover:scale-105" />
                  <span className="font-medium text-sm tracking-tight text-foreground">
                    MarketBrew
                  </span>
                </Link>

                {/* Navigation Links */}
                <div className="hidden md:flex items-center gap-1">
                  <Link
                    href="/today"
                    className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/50 transition-colors"
                  >
                    Today
                  </Link>
                  <Link
                    href="/liquidity"
                    className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/50 transition-colors"
                  >
                    Liquidity
                  </Link>
                  <Link
                    href="/for-you"
                    className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/50 transition-colors"
                  >
                    For You
                  </Link>
                  {process.env.NODE_ENV === 'development' && (
                    <Link
                      href="/rednote"
                      className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/50 transition-colors"
                    >
                      RedNote
                    </Link>
                  )}
                </div>

                {/* Right Side Actions */}
                <div className="flex items-center gap-2">
                  <ThemeToggle />
                  {/* Desktop Auth */}
                  <div className="hidden md:block">
                    <NavAuth />
                  </div>
                  {/* Mobile Menu */}
                  <MobileMenu />
                </div>
              </div>
            </div>
          </nav>

          {children}

          {/* Footer - Minimal & Elegant */}
          <footer className="border-t border-border/50 mt-16">
            <div className="max-w-6xl mx-auto px-4 md:px-6 py-8">
              <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                {/* Brand */}
                <div className="flex items-center gap-2.5 text-muted-foreground">
                  <Logo className="w-5 h-5 opacity-60" />
                  <span className="text-xs font-medium">MarketBrew</span>
                </div>

                {/* Links */}
                <div className="flex items-center gap-6 text-xs text-muted-foreground">
                  <Link href="/today" className="hover:text-foreground transition-colors">
                    Today
                  </Link>
                  <Link href="/liquidity" className="hover:text-foreground transition-colors">
                    Liquidity
                  </Link>
                  <Link href="/today/archive" className="hover:text-foreground transition-colors">
                    Archive
                  </Link>
                </div>

                {/* Tagline */}
                <p className="text-xs text-muted-foreground/60">
                  AI-powered market intelligence
                </p>
              </div>
            </div>
          </footer>
        </Providers>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
