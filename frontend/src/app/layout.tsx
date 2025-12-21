import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { NavAuth } from "@/components/NavAuth";
import { ThemeToggle } from "@/components/ThemeToggle";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "MarketBrew - AI Market Intelligence",
  description: "AI-powered market analysis for smart investors",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased bg-background text-foreground min-h-screen`}>
        <Providers>
          {/* Navigation - Glass effect */}
          <nav className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border">
            <div className="max-w-5xl mx-auto px-4 md:px-6">
              <div className="flex items-center justify-between h-12">
                {/* Logo */}
                <Link href="/" className="flex items-center gap-2 group">
                  <div className="w-7 h-7 rounded-lg bg-emerald-600 dark:bg-emerald-500 flex items-center justify-center group-hover:glow-emerald-sm transition-all">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                  </div>
                  <span className="font-semibold text-sm text-foreground">MarketBrew</span>
                </Link>

                {/* Navigation Links */}
                <div className="flex items-center gap-6">
                  <Link
                    href="/market"
                    className="text-sm text-muted-foreground hover:text-foreground dark:hover:text-emerald-400 transition-colors"
                  >
                    Market
                  </Link>
                  <Link
                    href="/liquidity"
                    className="text-sm text-muted-foreground hover:text-foreground dark:hover:text-emerald-400 transition-colors"
                  >
                    Liquidity
                  </Link>
                  <Link
                    href="/reports"
                    className="text-sm text-muted-foreground hover:text-foreground dark:hover:text-emerald-400 transition-colors"
                  >
                    Reports
                  </Link>
                  <Link
                    href="/digest"
                    className="text-sm text-muted-foreground hover:text-foreground dark:hover:text-emerald-400 transition-colors"
                  >
                    My Brew
                  </Link>
                  <ThemeToggle />
                  <NavAuth />
                </div>
              </div>
            </div>
          </nav>

          {children}

          {/* Footer */}
          <footer className="border-t border-border mt-12">
            <div className="max-w-5xl mx-auto px-4 md:px-6 py-6">
              <div className="flex flex-col md:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <div className="w-5 h-5 rounded bg-emerald-600 dark:bg-emerald-500 flex items-center justify-center">
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                  </div>
                  <span className="text-xs font-medium">MarketBrew</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  AI-powered market intelligence
                </p>
              </div>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
