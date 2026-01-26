import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { NavAuth } from "@/components/NavAuth";
import { ThemeToggle } from "@/components/ThemeToggle";
import { MobileMenu } from "@/components/MobileMenu";
import { NavDropdown } from "@/components/NavDropdown";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";

export const metadata: Metadata = {
  // Google Search Console 验证 - 替换为你的验证码
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || '',
  },
  title: {
    default: "TheMarketBrew - AI Market Intelligence",
    template: "%s | TheMarketBrew",
  },
  description: "AI 驱动的美股每日分析报告。获取智能市场洞察、流动性监控、宏观经济日历，助力投资决策。每日更新，中文解读。",
  keywords: [
    "AI 美股分析", "美股每日报告", "美股日报", "市场分析工具",
    "流动性监控", "美联储资产负债表", "宏观经济分析",
    "stock market analysis", "daily market report", "AI market intelligence"
  ],
  authors: [{ name: "TheMarketBrew" }],
  creator: "TheMarketBrew",
  publisher: "TheMarketBrew",
  metadataBase: new URL("https://themarketbrew.com"),
  openGraph: {
    type: "website",
    locale: "zh_CN",
    url: "https://themarketbrew.com",
    siteName: "TheMarketBrew",
    title: "TheMarketBrew - AI Market Intelligence",
    description: "AI-powered daily market analysis and insights for smart investors.",
  },
  twitter: {
    card: "summary_large_image",
    title: "TheMarketBrew - AI Market Intelligence",
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
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* English fonts from Google Fonts */}
        <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
        {/* LXGW WenKai - Chinese editorial font for headlines */}
        <link href="https://cdn.jsdelivr.net/npm/lxgw-wenkai-webfont@1.7.0/style.css" rel="stylesheet" />
        {/* OPPO Sans - Modern Chinese body font with premium feel */}
        <link href="https://cdn.jsdelivr.net/npm/oppo-sans@1.0.1/OPPOSans-Regular.css" rel="stylesheet" />
        <link href="https://cdn.jsdelivr.net/npm/oppo-sans@1.0.1/OPPOSans-Medium.css" rel="stylesheet" />
        <link href="https://cdn.jsdelivr.net/npm/oppo-sans@1.0.1/OPPOSans-Bold.css" rel="stylesheet" />
      </head>
      <body className="font-sans antialiased bg-background text-foreground min-h-screen">
        <Providers>
          {/* Navigation - Premium Glass Effect */}
          <nav className="sticky top-0 z-50 bg-background/80 backdrop-blur-2xl border-b border-border/40">
            <div className="max-w-6xl mx-auto px-4 md:px-6">
              <div className="flex items-center justify-between h-16">
                {/* Logo */}
                <Link href="/" className="flex items-center gap-3 group">
                  <Logo className="w-8 h-8 transition-transform duration-300 group-hover:scale-105" />
                  <div className="flex flex-col">
                    <span className="font-semibold text-[15px] tracking-tight text-foreground leading-tight">
                      TheMarketBrew
                    </span>
                    <span className="text-[10px] text-muted-foreground/60 tracking-widest uppercase hidden sm:block">
                      Market Intelligence
                    </span>
                  </div>
                </Link>

                {/* Navigation Links - Center */}
                <div className="hidden md:flex items-center">
                  <NavDropdown
                    label="日报"
                    items={[
                      { href: '/today', label: '今日日报' },
                      { href: '/today/archive', label: '往期归档' },
                    ]}
                  />
                  <NavDropdown
                    label="专属"
                    items={[
                      { href: '/for-you', label: '今日专属' },
                      { href: '/for-you/archive', label: '往期归档' },
                    ]}
                  />
                  {process.env.NODE_ENV === 'development' && (
                    <Link
                      href="/sectors"
                      className="px-4 py-2 text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors duration-200"
                    >
                      板块
                    </Link>
                  )}
                  <Link
                    href="/stock"
                    className="px-4 py-2 text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors duration-200"
                  >
                    个股
                  </Link>
                  <Link
                    href="/tools"
                    className="px-4 py-2 text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors duration-200"
                  >
                    工具
                  </Link>
                  <Link
                    href="/contact"
                    className="px-4 py-2 text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors duration-200"
                  >
                    联系
                  </Link>
                </div>

                {/* Right Side Actions */}
                <div className="flex items-center gap-3">
                  <ThemeToggle />
                  {/* Desktop Auth */}
                  <div className="hidden md:flex items-center">
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
                  <span className="text-xs font-medium">TheMarketBrew</span>
                </div>

                {/* Links */}
                <div className="flex items-center gap-6 text-xs text-muted-foreground">
                  <Link href="/today" className="hover:text-foreground transition-colors">
                    日报
                  </Link>
                  <Link href="/for-you" className="hover:text-foreground transition-colors">
                    专属
                  </Link>
                  {process.env.NODE_ENV === 'development' && (
                    <Link href="/sectors" className="hover:text-foreground transition-colors">
                      板块
                    </Link>
                  )}
                  <Link href="/stock" className="hover:text-foreground transition-colors">
                    个股
                  </Link>
                  <Link href="/tools" className="hover:text-foreground transition-colors">
                    工具
                  </Link>
                  <Link href="/contact" className="hover:text-foreground transition-colors">
                    联系
                  </Link>
                </div>

                {/* Social & Tagline */}
                <div className="flex items-center gap-4">
                  {/* Xiaohongshu Icon */}
                  <a
                    href="https://xiaohongshu.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground/60 hover:text-primary transition-colors"
                    title="小红书"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm5.5 14.5c0 .828-.672 1.5-1.5 1.5s-1.5-.672-1.5-1.5.672-1.5 1.5-1.5 1.5.672 1.5 1.5zm-4-6c0 1.105-.895 2-2 2s-2-.895-2-2 .895-2 2-2 2 .895 2 2zm-5.5 6c0 .828-.672 1.5-1.5 1.5S5 17.328 5 16.5 5.672 15 6.5 15s1.5.672 1.5 1.5z"/>
                    </svg>
                  </a>
                  <span className="text-border">|</span>
                  <p className="text-xs text-muted-foreground/60">
                    AI 驱动的市场洞察
                  </p>
                </div>
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
