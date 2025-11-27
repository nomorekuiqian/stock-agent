import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair" });

export const metadata: Metadata = {
  title: "Stock Research Agent",
  description: "AI-powered stock analysis",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${playfair.variable} font-sans antialiased bg-background text-foreground min-h-screen selection:bg-primary selection:text-primary-foreground`}>
        <nav className="p-4 flex justify-center space-x-6 text-sm font-medium border-b border-border/40">
          <a href="/" className="hover:text-primary transition-colors">Stock Analysis</a>
          <a href="/macro" className="hover:text-primary transition-colors">Macro Analysis</a>
        </nav>
        {children}
      </body>
    </html>
  );
}
