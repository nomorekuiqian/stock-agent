import type { Metadata } from "next";
import { Instrument_Serif, DM_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { PageShell } from "@/components/PageShell";
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
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/harmonyos-sans-sc-webfont-splitted@1.0.1/dist/Regular.css" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/harmonyos-sans-sc-webfont-splitted@1.0.1/dist/Medium.css" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/harmonyos-sans-sc-webfont-splitted@1.0.1/dist/Bold.css" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/lxgw-wenkai-webfont@1.7.0/style.css" />
      </head>
      <body className="font-sans antialiased bg-background text-foreground min-h-screen">
        <Providers>
          <PageShell>
            {children}
          </PageShell>
        </Providers>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
