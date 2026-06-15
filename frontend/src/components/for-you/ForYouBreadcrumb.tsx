import Link from 'next/link';

interface ForYouBreadcrumbProps {
  current: string;
}

export function ForYouBreadcrumb({ current }: ForYouBreadcrumbProps) {
  return (
    <nav aria-label="面包屑导航" className="text-sm text-muted-foreground mb-4">
      <Link
        href="/for-you"
        className="text-primary hover:text-primary/80 transition-colors"
      >
        专属
      </Link>
      <span className="mx-2 text-muted-foreground/70">/</span>
      <span className="text-foreground">{current}</span>
    </nav>
  );
}
