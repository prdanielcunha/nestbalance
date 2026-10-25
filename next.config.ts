import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  output: 'export',
  reactStrictMode: true,
  poweredByHeader: false,
  turbopack: {},
  webpack(config) {
    // Core modules also compile with NodeNext, which requires .js specifiers.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js']
    };
    return config;
  }
};
export default nextConfig;
