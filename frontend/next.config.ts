import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  experimental: {
    optimizePackageImports: ['lightweight-charts', 'lucide-react'],
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
