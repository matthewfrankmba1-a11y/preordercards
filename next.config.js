// Replaces Helmet's security headers from the old Express server — every
// value here was captured empirically from the live Express app's actual
// response headers (curl -I) rather than reconstructed from memory, so this
// matches byte-for-byte, not just "close enough".
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "font-src 'self' https: data:",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "img-src 'self' data: https:",
  "object-src 'none'",
  "script-src 'self' https://www.googletagmanager.com",
  "script-src-attr 'none'",
  "style-src 'self' https: 'unsafe-inline'",
  'upgrade-insecure-requests',
  "connect-src 'self' https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com",
].join(';');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // discord.js's WebSocket layer optionally lazy-loads compression libs
  // (zlib-sync, bufferutil) via a runtime try/catch dynamic import — it
  // works fine without them, but Turbopack/webpack try to statically
  // resolve that import at bundle time and fail since they're not
  // installed. Marking discord.js external tells Next.js to just
  // require() it directly at runtime like plain Node code, same as it
  // always worked under the old Express server (no bundler at all).
  serverExternalPackages: ['discord.js', '@discordjs/ws', 'better-sqlite3'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: CSP },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
          { key: 'Origin-Agent-Cluster', value: '?1' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Strict-Transport-Security', value: 'max-age=15552000; includeSubDomains' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-DNS-Prefetch-Control', value: 'off' },
          { key: 'X-Download-Options', value: 'noopen' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
          { key: 'X-XSS-Protection', value: '0' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
