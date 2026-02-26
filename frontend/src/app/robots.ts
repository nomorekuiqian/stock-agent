import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: [
          '/',
          '/today',
          '/today/*',
          '/macro',
          '/macro/*',
          '/stock',
          '/stock/*',
        ],
        disallow: [
          '/api/',
          '/login',
          '/auth/',
          '/for-you',
          '/for-you/*',
          '/digest',
          '/unsubscribe',
          '/email-test',
          '/feedback',
        ],
      },
    ],
    sitemap: 'https://themarketbrew.com/sitemap.xml',
  };
}
