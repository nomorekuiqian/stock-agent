"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled client error:", error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="terminal-card max-w-lg w-full p-8 text-center space-y-6">
        <div className="space-y-2">
          <h1 className="font-serif text-2xl text-foreground">
            Something went wrong
          </h1>
          <p className="text-sm text-muted-foreground">
            An unexpected error occurred. Please try again.
          </p>
        </div>

        {process.env.NODE_ENV === "development" && (
          <pre className="text-left text-xs text-destructive bg-destructive/10 rounded-lg p-4 overflow-auto max-h-40 font-mono">
            {error.message}
          </pre>
        )}

        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            Try Again
          </button>
          <Link
            href="/"
            className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
