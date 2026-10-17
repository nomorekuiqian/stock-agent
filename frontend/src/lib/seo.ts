import type { Metadata } from 'next';

// Match the production host's permanent redirect destination.
export const SITE_URL = 'https://www.themarketbrew.com';

export function pageMetadata(path: string, title: string, description: string): Metadata {
  return {
    title, description,
    alternates: { canonical: path },
    openGraph: { type: 'website', url: path, title, description, siteName: 'TheMarketBrew', locale: 'zh_CN', images: ['/logo-avatar.png'] },
    twitter: { card: 'summary', title, description, images: ['/logo-avatar.png'] },
  };
}

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}
