const nextConfig = {
  output: 'standalone',
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: 'avatars.githubusercontent.com', pathname: '/**' },
    ],
  },
  serverExternalPackages: ['mongodb'],
  allowedDevOrigins: [
    'nexus-core-sprint1.preview.emergentagent.com',
    'nexus-core-sprint1.cluster-12.preview.emergentcf.cloud',
    '*.preview.emergentagent.com',
    '*.preview.emergentcf.cloud',
  ],
  webpack(config, { dev }) {
    if (dev) {
      config.watchOptions = { poll: 2000, aggregateTimeout: 300, ignored: ['**/node_modules'] };
    }
    return config;
  },
  onDemandEntries: { maxInactiveAge: 10000, pagesBufferLength: 2 },
  async headers() {
    // Production-safe framing: restrict who may embed the app in an iframe.
    // Defaults to the app's own origin family (no public wildcard). Override via FRAME_ANCESTORS.
    const frameAncestors = process.env.FRAME_ANCESTORS
      || "'self' https://*.emergentagent.com https://*.emergentcf.cloud";
    // Explicit CORS origin — never fall back to a wildcard in production.
    const corsOrigin = process.env.CORS_ORIGINS
      || process.env.NEXT_PUBLIC_BASE_URL
      || "'self'";
    return [{
      source: '/(.*)',
      headers: [
        // X-Frame-Options intentionally omitted — CSP frame-ancestors governs framing in
        // modern browsers and supports an allow-list (X-Frame-Options cannot).
        { key: 'Content-Security-Policy', value: `frame-ancestors ${frameAncestors};` },
        { key: 'Access-Control-Allow-Origin', value: corsOrigin },
        { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, PATCH, DELETE, OPTIONS' },
        { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
      ],
    }];
  },
};
module.exports = nextConfig;
