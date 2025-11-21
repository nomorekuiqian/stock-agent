import StockAnalysis from "@/components/stock-analysis";

export default function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground p-4 md:p-8 max-w-md mx-auto md:max-w-2xl lg:max-w-3xl">
      {/* Header / Hook Section */}
      <header className="mb-12 mt-8 text-center space-y-4">
        <h1 className="font-serif text-4xl md:text-5xl font-bold tracking-tight">
          Stock 360°
        </h1>
        <p className="text-muted-foreground text-lg font-medium">
          Rational Intelligence for the Modern Investor.
        </p>
      </header>

      {/* Main Feed */}
      <div className="space-y-6">
        <StockAnalysis />
      </div>
      
      {/* Footer */}
      <footer className="mt-20 text-center text-sm text-muted-foreground pb-8">
        <p>© 2024 Stock 360°. AI Analysis provided for informational purposes only.</p>
      </footer>
    </main>
  );
}
