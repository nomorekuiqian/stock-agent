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
          '/liquidity',
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
          '/rednote',
        ],
      },
    ],
    sitemap: 'https://themarketbrew.com/sitemap.xml',
  };
}
