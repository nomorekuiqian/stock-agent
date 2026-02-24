import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ['lightweight-charts'],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'financialmodelingprep.com',
        pathname: '/image-stock/**',
      },
      {
        protocol: 'https',
        hostname: 'images.financialmodelingprep.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'assets.parqet.com',
        pathname: '/logos/**',
      },
    ],
  },
};

export default nextConfig;
