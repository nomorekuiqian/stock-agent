import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { NavAuth } from "@/components/NavAuth";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "MarketPulse - AI Market Intelligence",
  description: "AI-powered market analysis for smart investors",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans antialiased bg-white text-gray-900 min-h-screen`}>
        <Providers>
          {/* Navigation */}
          <nav className="sticky top-0 z-50 bg-white border-b border-gray-100">
            <div className="max-w-5xl mx-auto px-4 md:px-6">
              <div className="flex items-center justify-between h-12">
                {/* Logo */}
                <a href="/" className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-emerald-600 flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                  </div>
                  <span className="font-semibold text-sm text-gray-900">MarketPulse</span>
                </a>

                {/* Navigation Links */}
                <div className="flex items-center gap-6">
                  <a
                    href="/market"
                    className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
                  >
                    Market Analysis
                  </a>
                  <NavAuth />
                </div>
              </div>
            </div>
          </nav>

          {children}

          {/* Footer */}
          <footer className="border-t border-gray-100 mt-12">
            <div className="max-w-5xl mx-auto px-4 md:px-6 py-6">
              <div className="flex flex-col md:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-gray-400">
                  <div className="w-5 h-5 rounded bg-emerald-600 flex items-center justify-center">
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                  </div>
                  <span className="text-xs font-medium">MarketPulse</span>
                </div>
                <p className="text-xs text-gray-400">
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
