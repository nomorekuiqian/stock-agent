import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { Instrument_Serif, DM_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Navbar } from "@/components/Navbar";
import { Logo } from "@/components/Logo";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-instrument-serif",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-dm-sans",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || '',
  },
  title: {
    default: "TheMarketBrew - AI 美股分析 | 每日行情、宏观研究、个股投研",
    template: "%s | TheMarketBrew",
  },
  description: "AI 驱动的美股分析平台。每日市场日报、宏观经济周报、个股深度投研、估值对比，中文解读助力投资决策。",
  keywords: [
    "AI 美股分析", "美股每日报告", "美股日报", "美股投研",
    "个股分析", "美股宏观分析", "流动性监控", "美联储",
    "宏观经济分析", "美股估值", "市场情绪",
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
    title: "TheMarketBrew - AI 美股分析平台",
    description: "AI 驱动的美股分析平台。每日市场日报、宏观经济周报、个股深度投研，中文解读助力投资决策。",
    images: [
      {
        url: "/logo-avatar.png",
        width: 400,
        height: 400,
        alt: "TheMarketBrew - AI 美股分析平台",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "TheMarketBrew - AI 美股分析平台",
    description: "AI 驱动的美股分析平台。每日市场日报、宏观经济周报、个股深度投研，中文解读助力投资决策。",
    images: ["/logo-avatar.png"],
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning className={`${instrumentSerif.variable} ${dmSans.variable} ${jetbrainsMono.variable}`}>
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
      </head>
      <body className="font-sans antialiased bg-background text-foreground min-h-screen">
        <Providers>
          <Navbar />
          {/* Spacer for fixed navbar */}
          <div className="h-16" />

          {children}

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
                  <Link href="/morning" className="hover:text-foreground transition-colors">
                    早报
                  </Link>
                  <Link href="/today" className="hover:text-foreground transition-colors">
                    晚报
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
                  <Link href="/macro" className="hover:text-foreground transition-colors">
                    宏观
                  </Link>
                  <Link href="/contact" className="hover:text-foreground transition-colors">
                    联系
                  </Link>
                </div>

                {/* Social & Tagline */}
                <div className="flex items-center gap-4">
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

              {/* Risk Disclaimer */}
              <div className="mt-6 pt-5 border-t border-border/30">
                <p className="text-xs text-muted-foreground/50 leading-relaxed text-center">
                  本平台所有内容（包括 AI 生成的分析与报告）仅供参考，不构成任何投资建议。投资有风险，入市需谨慎，过往表现不代表未来收益。AI 生成内容可能存在不准确之处，请在做出任何投资决策前自行核实相关信息。
                </p>
              </div>
            </div>
          </footer>
        </Providers>
        <Script id="load-chinese-fonts" strategy="afterInteractive">
          {`
            [
              'https://cdn.jsdelivr.net/npm/lxgw-wenkai-webfont@1.7.0/style.css',
              'https://cdn.jsdelivr.net/npm/harmonyos-sans-sc-webfont-splitted@1.0.1/dist/Regular.css',
              'https://cdn.jsdelivr.net/npm/harmonyos-sans-sc-webfont-splitted@1.0.1/dist/Medium.css',
              'https://cdn.jsdelivr.net/npm/harmonyos-sans-sc-webfont-splitted@1.0.1/dist/Bold.css'
            ].forEach(function(href) {
              var link = document.createElement('link');
              link.rel = 'stylesheet';
              link.href = href;
              document.head.appendChild(link);
            });
          `}
        </Script>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
